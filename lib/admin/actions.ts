'use server';

/**
 * Server actions for the admin screens.
 *
 * Every one of them re-reads the session rather than trusting a tenant id from
 * the form: a hidden field is attacker-controlled, and the session cookie is
 * signed. Zod validates at the boundary, per CLAUDE.md.
 */
import { revalidatePath } from 'next/cache';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';
import { requireSession } from '@/lib/auth';
import { toPlainDate, toTstzRange } from '@/lib/time';
import { findSlots, loadAvailabilityContext } from '@/lib/availability';
import { cancelBookingInTx } from '@/lib/booking/cancel';
import { createBookingInTx, toSatang, fromSatang } from '@/lib/booking/create';
import { resolveCustomer, mergeCustomers } from '@/lib/customer/upsert';
import { cancelBookingNotifications, enqueueBookingConfirmation } from '@/lib/notifications/queue';
import { findTemplate } from './templates';
import { isExclusionViolation } from '@/lib/booking/errors';
import { earnPointsForBooking } from '@/lib/loyalty/earn';
import { redeemPoints } from '@/lib/loyalty/redeem';
import { pointRuleFormSchema } from '@/lib/loyalty/validation';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

const ok: ActionResult = { ok: true };

// ---------------------------------------------------------------------
// Booking status — the calendar's most-used control
// ---------------------------------------------------------------------

const statusSchema = z.object({
  bookingId: z.uuid(),
  status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled']),
  // "จ่ายบิลด้วยแต้มบางส่วน" — docs/logic.md ข้อ 3.1/3.2. Only looked at when
  // this call is the one that first marks the booking completed.
  redeemPoints: z.coerce.number().int().min(0).optional(),
});

export async function setBookingStatus(input: unknown): Promise<ActionResult> {
  const session = await requireSession('staff');
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลไม่ถูกต้อง');

  const { bookingId, status, redeemPoints: pointsToRedeem } = parsed.data;
  const now = DateTime.now();

  try {
    await withTenant(session.tenantId, async (tx) => {
      if (status === 'cancelled') {
        await cancelBookingInTx(tx, {
          tenantId: session.tenantId,
          bookingId,
          bypassCutoff: true, // shop staff are not bound by the customer cutoff
          reason: 'ยกเลิกโดยร้าน',
          now,
        });
        return;
      }

      const [current] = await tx
        .select({
          status: schema.booking.status,
          customerId: schema.booking.customerId,
          total: schema.booking.total,
        })
        .from(schema.booking)
        .where(and(eq(schema.booking.tenantId, session.tenantId), eq(schema.booking.id, bookingId)));
      if (!current) throw new Error('ไม่พบรายการจองนี้');

      // Re-pressing a status that already applied must not re-run its side
      // effects — this is what makes "กดปุ่มเสร็จงาน 2 ครั้ง" safe for
      // visitCount/lifetimeSpend/points, not just the point_ledger unique index.
      const enteringCompleted = status === 'completed' && current.status !== 'completed';
      const enteringNoShow = status === 'no_show' && current.status !== 'no_show';

      const patch: Partial<typeof schema.booking.$inferInsert> = {
        status,
        updatedAt: now.toJSDate(),
      };
      if (enteringCompleted) {
        patch.completedAt = now.toJSDate();
      }

      // Redeem first, so the completed total already excludes what was paid
      // with points before points are earned on what's left — ข้อ 3.1 step 1.
      if (enteringCompleted && pointsToRedeem && pointsToRedeem > 0 && current.customerId) {
        const redemption = await redeemPoints(tx, {
          tenantId: session.tenantId,
          customerId: current.customerId,
          pointsWanted: pointsToRedeem,
          billTotalSatang: toSatang(current.total),
          sourceType: 'booking',
          sourceId: bookingId,
        });
        patch.pointDiscount = fromSatang(redemption.valueSatang);
        patch.pointsSpent = redemption.pointsRedeemed;
        patch.total = fromSatang(Math.max(0, toSatang(current.total) - redemption.valueSatang));
      }

      await tx
        .update(schema.booking)
        .set(patch)
        .where(and(eq(schema.booking.tenantId, session.tenantId), eq(schema.booking.id, bookingId)));

      if (status === 'no_show' || status === 'completed') {
        // Nothing left to remind them about.
        await cancelBookingNotifications(tx, session.tenantId, bookingId);
      }

      if (enteringNoShow && current.customerId) {
        await tx
          .update(schema.customer)
          .set({ noShowCount: sql`${schema.customer.noShowCount} + 1` })
          .where(eq(schema.customer.id, current.customerId));
      }

      if (enteringCompleted && current.customerId) {
        await tx
          .update(schema.customer)
          .set({
            visitCount: sql`${schema.customer.visitCount} + 1`,
            lifetimeSpend: sql`${schema.customer.lifetimeSpend} + ${patch.total ?? current.total}::numeric`,
            lastVisitAt: now.toJSDate(),
          })
          .where(eq(schema.customer.id, current.customerId));

        const earned = await earnPointsForBooking(tx, session.tenantId, bookingId);
        if (earned.pointsEarned > 0) {
          await tx
            .update(schema.booking)
            .set({ pointsEarned: earned.pointsEarned })
            .where(and(eq(schema.booking.tenantId, session.tenantId), eq(schema.booking.id, bookingId)));
        }
      }
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'เปลี่ยนสถานะไม่สำเร็จ');
  }

  revalidatePath('/dashboard');
  return ok;
}

// ---------------------------------------------------------------------
// Walk-in
// ---------------------------------------------------------------------

const walkInSchema = z.object({
  serviceIds: z.array(z.uuid()).min(1),
  startsAt: z.iso.datetime({ offset: true }),
  resourceId: z.uuid().optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(20).optional(),
});

export async function createWalkIn(input: unknown): Promise<ActionResult & { code?: string }> {
  const session = await requireSession('staff');
  const parsed = walkInSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลไม่ถูกต้อง');

  const data = parsed.data;

  try {
    const booking = await withTenant(session.tenantId, async (tx) => {
      const customerId = await resolveCustomer(tx, {
        tenantId: session.tenantId,
        name: data.customerName ?? null,
        phone: data.customerPhone ?? null,
      });

      return createBookingInTx(tx, {
        tenantId: session.tenantId,
        customerId,
        startsAt: DateTime.fromISO(data.startsAt, { setZone: true }),
        serviceIds: data.serviceIds,
        preferredResourceId: data.resourceId,
        source: 'walk_in',
        // The customer is standing at the counter; the online lead time and
        // advance horizon do not apply.
        ignorePolicyWindow: true,
      });
    });

    revalidatePath('/dashboard');
    return { ok: true, code: booking.code };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'สร้างคิวไม่สำเร็จ');
  }
}

// ---------------------------------------------------------------------
// Rescheduling — the drag-and-drop target
// ---------------------------------------------------------------------

const rescheduleSchema = z.object({
  bookingId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  resourceId: z.uuid().optional(),
});

/**
 * Moving a booking keeps its id and code.
 *
 * The customer already has that code in a Flex message, and queued
 * notifications reference the booking id — deleting and recreating would break
 * both. So the row stays and only its times and allocations move.
 *
 * The old allocations are released first, then the new ones inserted in the
 * same transaction. The EXCLUDE constraint still has the final word: a drop
 * onto an occupied slot is rejected exactly like a double-booking, and the
 * rollback puts the original allocations back.
 */
export async function rescheduleBooking(input: unknown): Promise<ActionResult> {
  const session = await requireSession('staff');
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลไม่ถูกต้อง');

  const { bookingId, startsAt, resourceId } = parsed.data;

  try {
    await withTenant(session.tenantId, async (tx) => {
      const [booking] = await tx
        .select({ id: schema.booking.id, status: schema.booking.status })
        .from(schema.booking)
        .where(
          and(eq(schema.booking.tenantId, session.tenantId), eq(schema.booking.id, bookingId)),
        );
      if (!booking) throw new Error('ไม่พบรายการจองนี้');
      if (['completed', 'cancelled', 'no_show'].includes(booking.status)) {
        throw new Error('รายการนี้เลื่อนไม่ได้แล้ว');
      }

      const items = await tx
        .select({ id: schema.bookingItem.id, serviceId: schema.bookingItem.serviceId })
        .from(schema.bookingItem)
        .where(eq(schema.bookingItem.bookingId, bookingId))
        .orderBy(asc(schema.bookingItem.seq));
      if (items.length === 0) throw new Error('รายการจองนี้ไม่มีบริการ');

      const itemIds = items.map((i) => i.id);
      const serviceIds = items.map((i) => i.serviceId);
      const target = DateTime.fromISO(startsAt, { setZone: true });

      // Release first, so re-planning sees this booking's own time as free —
      // otherwise a booking can never be moved by fifteen minutes.
      await tx
        .update(schema.resourceAllocation)
        .set({ isReleased: true })
        .where(
          and(
            eq(schema.resourceAllocation.tenantId, session.tenantId),
            inArray(schema.resourceAllocation.bookingItemId, itemIds),
          ),
        );

      // The instant is unambiguous; the calendar day it belongs to is not, so
      // resolve the day in the shop's own timezone.
      const [tenantRow] = await tx
        .select({ timezone: schema.tenant.timezone })
        .from(schema.tenant)
        .where(eq(schema.tenant.id, session.tenantId));
      const zone = tenantRow?.timezone ?? 'Asia/Bangkok';

      const ctx = await loadAvailabilityContext(
        tx,
        session.tenantId,
        toPlainDate(target, zone),
        serviceIds,
      );
      const zoned = target.setZone(ctx.timezone);

      const slot = findSlots(ctx, {
        date: toPlainDate(zoned, ctx.timezone),
        serviceIds,
        preferredResourceId: resourceId,
        // Staff move bookings within today all the time (a customer arrived
        // early); the online policy window does not apply at the counter.
        ignorePolicyWindow: true,
      }).find((s) => s.start.toMillis() === zoned.toMillis());

      if (!slot) throw new Error('เวลาใหม่ไม่ว่าง กรุณาเลือกเวลาอื่น');

      const spans = new Map<string, { start: DateTime; end: DateTime }>();
      for (const hold of slot.holds) {
        const current = spans.get(hold.serviceId);
        if (!current) spans.set(hold.serviceId, { start: hold.start, end: hold.end });
        else {
          if (hold.start < current.start) current.start = hold.start;
          if (hold.end > current.end) current.end = hold.end;
        }
      }

      for (const item of items) {
        const span = spans.get(item.serviceId);
        if (!span) throw new Error('จัดตารางใหม่ไม่สำเร็จ');
        await tx
          .update(schema.bookingItem)
          .set({ startsAt: span.start.toJSDate(), endsAt: span.end.toJSDate() })
          .where(eq(schema.bookingItem.id, item.id));
      }

      const itemIdByService = new Map(items.map((i) => [i.serviceId, i.id]));

      // Anything overlapping is rejected here, by the constraint.
      await tx.insert(schema.resourceAllocation).values(
        slot.holds.map((hold) => ({
          tenantId: session.tenantId,
          bookingItemId: itemIdByService.get(hold.serviceId)!,
          resourceId: hold.resourceId,
          period: toTstzRange({ start: hold.start, end: hold.end }),
          isActiveHold: hold.isActiveHold,
        })),
      );

      await tx
        .update(schema.booking)
        .set({
          startsAt: slot.start.toJSDate(),
          endsAt: slot.end.toJSDate(),
          updatedAt: DateTime.now().toJSDate(),
        })
        .where(eq(schema.booking.id, bookingId));

      // The reminders were scheduled against the old time.
      await cancelBookingNotifications(tx, session.tenantId, bookingId);
      await enqueueBookingConfirmation(tx, {
        tenantId: session.tenantId,
        bookingId,
        customerId: await customerIdOf(tx, bookingId),
        startsAt: slot.start,
        now: DateTime.now().setZone(ctx.timezone),
      });
    });

    revalidatePath('/dashboard');
    return ok;
  } catch (error) {
    if (isExclusionViolation(error)) return fail('เวลาใหม่ชนกับคิวอื่น กรุณาเลือกเวลาอื่น');
    return fail(error instanceof Error ? error.message : 'เลื่อนคิวไม่สำเร็จ');
  }
}

async function customerIdOf(tx: TenantTx, bookingId: string): Promise<string | null> {
  const [row] = await tx
    .select({ customerId: schema.booking.customerId })
    .from(schema.booking)
    .where(eq(schema.booking.id, bookingId));
  return row?.customerId ?? null;
}

// ---------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------

const serviceSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'ต้องมีชื่อบริการ').max(120),
  description: z.string().trim().max(500).nullish(),
  basePrice: z.coerce.number().min(0).max(1_000_000),
  bufferBeforeMin: z.coerce.number().int().min(0).max(240),
  bufferAfterMin: z.coerce.number().int().min(0).max(240),
  durationMin: z.coerce.number().int().min(5).max(600),
  isActive: z.boolean().default(true),
});

export async function saveService(input: unknown): Promise<ActionResult> {
  const session = await requireSession('manager');
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');

  const data = parsed.data;

  await withTenant(session.tenantId, async (tx) => {
    if (data.id) {
      await tx
        .update(schema.service)
        .set({
          name: data.name,
          description: data.description ?? null,
          basePrice: data.basePrice.toFixed(2),
          bufferBeforeMin: data.bufferBeforeMin,
          bufferAfterMin: data.bufferAfterMin,
          isActive: data.isActive,
        })
        .where(and(eq(schema.service.tenantId, session.tenantId), eq(schema.service.id, data.id)));

      // A service with segments already (a colour, say) keeps its shape; only a
      // plain single-segment service has its duration edited here.
      const segments = await tx
        .select()
        .from(schema.serviceSegment)
        .where(eq(schema.serviceSegment.serviceId, data.id));

      if (segments.length === 1) {
        await tx
          .update(schema.serviceSegment)
          .set({ durationMin: data.durationMin })
          .where(eq(schema.serviceSegment.id, segments[0]!.id));
      }
      return;
    }

    const [created] = await tx
      .insert(schema.service)
      .values({
        tenantId: session.tenantId,
        name: data.name,
        description: data.description ?? null,
        basePrice: data.basePrice.toFixed(2),
        bufferBeforeMin: data.bufferBeforeMin,
        bufferAfterMin: data.bufferAfterMin,
        isActive: data.isActive,
      })
      .returning({ id: schema.service.id });

    await tx.insert(schema.serviceSegment).values({
      serviceId: created!.id,
      seq: 1,
      kind: 'active',
      durationMin: data.durationMin,
    });

    // Every service needs its resource requirements or it can never be booked.
    const types = await tx
      .select()
      .from(schema.resourceType)
      .where(eq(schema.resourceType.tenantId, session.tenantId));

    await tx.insert(schema.serviceResourceRequirement).values(
      types.map((type) => ({
        serviceId: created!.id,
        resourceTypeId: type.id,
        quantity: 1,
        holdScope: type.isHuman ? ('active_only' as const) : ('whole' as const),
      })),
    );
  });

  revalidatePath('/dashboard/services');
  return ok;
}

// ---------------------------------------------------------------------
// Resources and their hours
// ---------------------------------------------------------------------

const resourceSchema = z.object({
  id: z.uuid().optional(),
  resourceTypeId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  bio: z.string().trim().max(300).nullish(),
  isBookable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  serviceIds: z.array(z.uuid()).default([]),
});

export async function saveResource(input: unknown): Promise<ActionResult> {
  const session = await requireSession('manager');
  const parsed = resourceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');

  const data = parsed.data;

  await withTenant(session.tenantId, async (tx) => {
    let resourceId = data.id;

    if (resourceId) {
      await tx
        .update(schema.resource)
        .set({
          name: data.name,
          bio: data.bio ?? null,
          isBookable: data.isBookable,
          isActive: data.isActive,
        })
        .where(
          and(eq(schema.resource.tenantId, session.tenantId), eq(schema.resource.id, resourceId)),
        );
    } else {
      const [created] = await tx
        .insert(schema.resource)
        .values({
          tenantId: session.tenantId,
          resourceTypeId: data.resourceTypeId,
          name: data.name,
          bio: data.bio ?? null,
          isBookable: data.isBookable,
          isActive: data.isActive,
        })
        .returning({ id: schema.resource.id });
      resourceId = created!.id;
    }

    // Skills are replaced wholesale — simpler to reason about than a diff, and
    // the table is small.
    await tx
      .delete(schema.resourceServiceSkill)
      .where(eq(schema.resourceServiceSkill.resourceId, resourceId));

    if (data.serviceIds.length > 0) {
      await tx
        .insert(schema.resourceServiceSkill)
        .values(data.serviceIds.map((serviceId) => ({ resourceId: resourceId!, serviceId })));
    }
  });

  revalidatePath('/dashboard/resources');
  return ok;
}

const hoursSchema = z.object({
  resourceId: z.uuid().nullish(),
  rows: z
    .array(
      z.object({
        weekday: z.coerce.number().int().min(0).max(6),
        openTime: z.string().regex(/^\d{2}:\d{2}$/),
        closeTime: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .max(30),
});

export async function saveHours(input: unknown): Promise<ActionResult> {
  const session = await requireSession('manager');
  const parsed = hoursSchema.safeParse(input);
  if (!parsed.success) return fail('เวลาทำการไม่ถูกต้อง');

  const { resourceId, rows } = parsed.data;

  for (const row of rows) {
    if (row.closeTime <= row.openTime) {
      return fail(`เวลาปิดต้องหลังเวลาเปิด (${row.openTime}-${row.closeTime})`);
    }
  }

  await withTenant(session.tenantId, async (tx) => {
    await tx
      .delete(schema.businessHour)
      .where(
        and(
          eq(schema.businessHour.tenantId, session.tenantId),
          resourceId
            ? eq(schema.businessHour.resourceId, resourceId)
            : sql`${schema.businessHour.resourceId} IS NULL`,
        ),
      );

    if (rows.length > 0) {
      await tx.insert(schema.businessHour).values(
        rows.map((row) => ({
          tenantId: session.tenantId,
          resourceId: resourceId ?? null,
          weekday: row.weekday,
          openTime: `${row.openTime}:00`,
          closeTime: `${row.closeTime}:00`,
        })),
      );
    }
  });

  revalidatePath('/dashboard/resources');
  revalidatePath('/dashboard');
  return ok;
}

// ---------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------

const timeOffSchema = z.object({
  resourceId: z.uuid().nullish(),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  reason: z.string().trim().max(200).nullish(),
});

export async function createTimeOff(input: unknown): Promise<ActionResult> {
  const session = await requireSession('manager');
  const parsed = timeOffSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลวันลาไม่ถูกต้อง');

  const start = DateTime.fromISO(parsed.data.start, { setZone: true });
  const end = DateTime.fromISO(parsed.data.end, { setZone: true });
  if (end <= start) return fail('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');

  await withTenant(session.tenantId, (tx) =>
    tx.insert(schema.timeOff).values({
      tenantId: session.tenantId,
      resourceId: parsed.data.resourceId ?? null,
      period: toTstzRange({ start, end }),
      reason: parsed.data.reason ?? null,
    }),
  );

  revalidatePath('/dashboard/resources');
  revalidatePath('/dashboard');
  return ok;
}

export async function deleteTimeOff(input: unknown): Promise<ActionResult> {
  const session = await requireSession('manager');
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail('ข้อมูลไม่ถูกต้อง');

  await withTenant(session.tenantId, (tx) =>
    tx
      .delete(schema.timeOff)
      .where(and(eq(schema.timeOff.tenantId, session.tenantId), eq(schema.timeOff.id, parsed.data.id))),
  );

  revalidatePath('/dashboard/resources');
  return ok;
}

// ---------------------------------------------------------------------
// Customers (Phase 4)
// ---------------------------------------------------------------------

const noteSchema = z.object({
  customerId: z.uuid(),
  note: z.string().trim().max(2000).nullish(),
});

export async function saveCustomerNote(input: unknown): Promise<ActionResult> {
  const session = await requireSession('staff');
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลไม่ถูกต้อง');

  await withTenant(session.tenantId, (tx) =>
    tx
      .update(schema.customer)
      .set({ note: parsed.data.note || null })
      .where(
        and(
          eq(schema.customer.tenantId, session.tenantId),
          eq(schema.customer.id, parsed.data.customerId),
        ),
      ),
  );

  revalidatePath('/dashboard/customers');
  return ok;
}

const mergeSchema = z.object({ keepId: z.uuid(), mergeId: z.uuid() });

export async function mergeCustomerRecords(input: unknown): Promise<ActionResult> {
  const session = await requireSession('manager');
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลไม่ถูกต้อง');

  try {
    await withTenant(session.tenantId, (tx) =>
      mergeCustomers(tx, session.tenantId, parsed.data.keepId, parsed.data.mergeId),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'รวมลูกค้าไม่สำเร็จ');
  }

  revalidatePath('/dashboard/customers');
  return ok;
}

// ---------------------------------------------------------------------
// Shop templates — the Phase 3 gate: a new shop set up in 15 minutes
// ---------------------------------------------------------------------

const templateSchema = z.object({
  businessType: z.string().min(1),
  spaceCount: z.coerce.number().int().min(1).max(30).optional(),
});

/**
 * Fill an empty shop with a standard service list and the resource types it
 * needs. Refuses to run on a shop that already has services, so it can never
 * silently duplicate a menu somebody has already edited.
 */
export async function applyShopTemplate(input: unknown): Promise<ActionResult & { created?: number }> {
  const session = await requireSession('owner');
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลไม่ถูกต้อง');

  const template = findTemplate(parsed.data.businessType);
  if (!template) return fail('ไม่พบเทมเพลตของประเภทร้านนี้');

  try {
    const created = await withTenant(session.tenantId, async (tx) => {
      const existing = await tx
        .select({ id: schema.service.id })
        .from(schema.service)
        .where(eq(schema.service.tenantId, session.tenantId));
      if (existing.length > 0) {
        throw new Error('ร้านนี้มีบริการอยู่แล้ว เทมเพลตใช้ได้เฉพาะร้านที่ยังว่าง');
      }

      // Resource types first: services reference them.
      const typeIds = new Map<string, string>();
      for (const type of template.resourceTypes) {
        const [row] = await tx
          .insert(schema.resourceType)
          .values({
            tenantId: session.tenantId,
            code: type.code,
            name: type.name,
            isHuman: type.isHuman,
          })
          .onConflictDoNothing({
            target: [schema.resourceType.tenantId, schema.resourceType.code],
          })
          .returning({ id: schema.resourceType.id });

        if (row) {
          typeIds.set(type.code, row.id);
        } else {
          const [found] = await tx
            .select({ id: schema.resourceType.id })
            .from(schema.resourceType)
            .where(
              and(
                eq(schema.resourceType.tenantId, session.tenantId),
                eq(schema.resourceType.code, type.code),
              ),
            );
          if (found) typeIds.set(type.code, found.id);
        }
      }

      const categoryIds = new Map<string, string>();
      const categories = [...new Set(template.services.map((s) => s.category))];
      for (const [index, name] of categories.entries()) {
        const [row] = await tx
          .insert(schema.serviceCategory)
          .values({ tenantId: session.tenantId, name, displayOrder: index })
          .returning({ id: schema.serviceCategory.id });
        categoryIds.set(name, row!.id);
      }

      for (const [index, service] of template.services.entries()) {
        const [row] = await tx
          .insert(schema.service)
          .values({
            tenantId: session.tenantId,
            categoryId: categoryIds.get(service.category) ?? null,
            name: service.name,
            basePrice: service.price.toFixed(2),
            bufferAfterMin: service.bufferAfterMin ?? 0,
            displayOrder: index,
          })
          .returning({ id: schema.service.id });

        await tx.insert(schema.serviceSegment).values({
          serviceId: row!.id,
          seq: 1,
          kind: 'active',
          durationMin: service.durationMin,
        });

        await tx.insert(schema.serviceResourceRequirement).values(
          template.resourceTypes
            .filter((type) => typeIds.has(type.code))
            .map((type) => ({
              serviceId: row!.id,
              resourceTypeId: typeIds.get(type.code)!,
              quantity: 1,
              holdScope: type.isHuman ? ('active_only' as const) : ('whole' as const),
            })),
        );
      }

      // The chairs/beds/rooms. Staff are added by name afterwards, since only
      // the owner knows who works there.
      const spaceType = template.resourceTypes.find((t) => !t.isHuman);
      const spaceCount = parsed.data.spaceCount ?? template.defaultSpaces;
      if (spaceType && typeIds.has(spaceType.code)) {
        await tx.insert(schema.resource).values(
          Array.from({ length: spaceCount }, (_, i) => ({
            tenantId: session.tenantId,
            resourceTypeId: typeIds.get(spaceType.code)!,
            name: `${template.spaceLabel} ${i + 1}`,
            displayOrder: i,
            isBookable: false,
          })),
        );
      }

      // A shop with no opening hours can never be booked; 10:00-20:00 daily is
      // the most common Thai retail pattern and is editable straight away.
      const hasHours = await tx
        .select({ id: schema.businessHour.id })
        .from(schema.businessHour)
        .where(eq(schema.businessHour.tenantId, session.tenantId));

      if (hasHours.length === 0) {
        await tx.insert(schema.businessHour).values(
          [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            tenantId: session.tenantId,
            resourceId: null,
            weekday,
            openTime: '10:00:00',
            closeTime: '20:00:00',
          })),
        );
      }

      const hasPolicy = await tx
        .select({ tenantId: schema.tenantBookingPolicy.tenantId })
        .from(schema.tenantBookingPolicy)
        .where(eq(schema.tenantBookingPolicy.tenantId, session.tenantId));
      if (hasPolicy.length === 0) {
        await tx.insert(schema.tenantBookingPolicy).values({ tenantId: session.tenantId });
      }

      return template.services.length;
    });

    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard/resources');
    return { ok: true, created };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'ใช้เทมเพลตไม่สำเร็จ');
  }
}

// ---------------------------------------------------------------------
// Loyalty rule — docs/logic.md ข้อ 3
// ---------------------------------------------------------------------

export async function savePointRule(input: unknown): Promise<ActionResult> {
  const session = await requireSession('owner'); // touches how much every future booking earns/costs
  const parsed = pointRuleFormSchema.safeParse(input);
  if (!parsed.success) return fail('ข้อมูลไม่ถูกต้อง');
  const data = parsed.data;

  if (data.maxRedeemPercent > 0 && data.minRedeemPoints * data.pointValueBaht === 0) {
    return fail('ตั้งค่ามูลค่าแต้มก่อนเปิดให้ใช้แต้ม');
  }

  await withTenant(session.tenantId, (tx) =>
    tx
      .insert(schema.pointRule)
      .values({
        tenantId: session.tenantId,
        bahtPerPoint: String(data.bahtPerPoint),
        rounding: data.rounding,
        pointValueBaht: String(data.pointValueBaht),
        minRedeemPoints: data.minRedeemPoints,
        maxRedeemPercent: String(data.maxRedeemPercent),
        expiryMonths: data.expiryMonths,
        signupBonus: data.signupBonus,
        birthdayBonus: data.birthdayBonus,
        referralBonus: data.referralBonus,
        isActive: data.isActive,
      })
      .onConflictDoUpdate({
        target: schema.pointRule.tenantId,
        set: {
          bahtPerPoint: String(data.bahtPerPoint),
          rounding: data.rounding,
          pointValueBaht: String(data.pointValueBaht),
          minRedeemPoints: data.minRedeemPoints,
          maxRedeemPercent: String(data.maxRedeemPercent),
          expiryMonths: data.expiryMonths,
          signupBonus: data.signupBonus,
          birthdayBonus: data.birthdayBonus,
          referralBonus: data.referralBonus,
          isActive: data.isActive,
        },
      }),
  );

  revalidatePath('/dashboard/settings/loyalty');
  return ok;
}
