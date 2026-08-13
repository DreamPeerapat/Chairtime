/**
 * Seed three shops and fill their calendars: 30 days of history and 14 days
 * ahead, so the admin screens and the availability engine both have something
 * that looks like a working business.
 *
 * Bookings are placed through lib/booking/create.ts rather than by inserting
 * rows, so the seed exercises the same EXCLUDE constraint the app relies on. A
 * clash is normal here — it just means the shop was full at that moment.
 */
import { DateTime } from 'luxon';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { loadEnv } from '@/lib/env';

loadEnv();
import { db, schema, sqlClient } from '../client';
import { withTenant, type TenantTx } from '../tenant';
import { createBookingInTx } from '@/lib/booking/create';
import { SlotTakenError, SlotUnavailableError } from '@/lib/booking/errors';
import { getAvailability } from '@/lib/availability';
import { toPlainDate } from '@/lib/time';
import { seedTenants, type SeedTenant } from './data';

/** Deterministic PRNG so two seed runs produce the same shop. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const HISTORY_DAYS = 30;
const FUTURE_DAYS = 14;

export async function seed(options: { quiet?: boolean } = {}) {
  const log = options.quiet ? () => {} : console.log;

  await truncateAll();

  for (const spec of seedTenants) {
    const tenantId = await seedTenant(spec);
    log(`seeded ${spec.name} (${spec.slug}) -> ${tenantId}`);
    const created = await seedBookings(tenantId, spec);
    log(`  ${created.past} past bookings, ${created.future} upcoming`);
  }
}

/**
 * TRUNCATE needs table ownership, which the app role deliberately does not
 * have, so the wipe runs on the admin connection.
 */
async function truncateAll() {
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) throw new Error('DATABASE_URL_ADMIN must be set to reseed');
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`
      TRUNCATE TABLE
        tenant, tenant_booking_policy, resource_type, resource, service_category, service,
        service_segment, service_resource_requirement, resource_service_skill, business_hour,
        time_off, customer, booking, booking_item, resource_allocation, membership_tier,
        customer_tier, point_rule, point_lot, point_ledger, reward, reward_redemption,
        package, package_service, customer_package, notification_queue, staff_user, audit_log
      RESTART IDENTITY CASCADE
    `);
  } finally {
    await admin.end();
  }
}

async function seedTenant(spec: SeedTenant): Promise<string> {
  // `tenant` sits outside RLS — it is the row you look up before you know which
  // tenant you are.
  const [tenantRow] = await db
    .insert(schema.tenant)
    .values({
      slug: spec.slug,
      name: spec.name,
      businessType: spec.businessType,
      phone: spec.phone,
      address: spec.address,
      plan: 'pro',
    })
    .returning({ id: schema.tenant.id });
  if (!tenantRow) throw new Error('tenant insert returned no row');
  const tenantId = tenantRow.id;

  await withTenant(tenantId, async (tx) => {
    await tx.insert(schema.tenantBookingPolicy).values({ tenantId, ...spec.policy });

    await tx.insert(schema.pointRule).values({
      tenantId,
      bahtPerPoint: String(spec.pointRule.bahtPerPoint),
      pointValueBaht: String(spec.pointRule.pointValueBaht),
      minRedeemPoints: spec.pointRule.minRedeemPoints,
      maxRedeemPercent: String(spec.pointRule.maxRedeemPercent),
      expiryMonths: spec.pointRule.expiryMonths,
      signupBonus: spec.pointRule.signupBonus,
      birthdayBonus: spec.pointRule.birthdayBonus,
    });

    await tx.insert(schema.membershipTier).values(
      spec.tiers.map((tier) => ({
        tenantId,
        name: tier.name,
        level: tier.level,
        qualifySpend: String(tier.qualifySpend),
        qualifyVisits: tier.qualifyVisits,
        pointMultiplier: String(tier.pointMultiplier),
        discountPercent: String(tier.discountPercent),
        priorityBookingDays: tier.priorityBookingDays,
        color: tier.color,
      })),
    );

    const typeIds = new Map<string, string>();
    for (const type of spec.resourceTypes) {
      const [row] = await tx
        .insert(schema.resourceType)
        .values({ tenantId, code: type.code, name: type.name, isHuman: type.isHuman })
        .returning({ id: schema.resourceType.id });
      typeIds.set(type.code, row!.id);
    }

    const categoryIds = new Map<string, string>();
    for (const [index, name] of [...new Set(spec.services.map((s) => s.category))].entries()) {
      const [row] = await tx
        .insert(schema.serviceCategory)
        .values({ tenantId, name, displayOrder: index })
        .returning({ id: schema.serviceCategory.id });
      categoryIds.set(name, row!.id);
    }

    const serviceIds = new Map<string, string>();
    for (const [index, svc] of spec.services.entries()) {
      const [row] = await tx
        .insert(schema.service)
        .values({
          tenantId,
          categoryId: categoryIds.get(svc.category)!,
          name: svc.name,
          basePrice: svc.price.toFixed(2),
          bufferBeforeMin: svc.bufferBeforeMin ?? 0,
          bufferAfterMin: svc.bufferAfterMin ?? 0,
          pointEarnMode: svc.pointEarnMode ?? 'inherit',
          displayOrder: index,
        })
        .returning({ id: schema.service.id });
      const serviceId = row!.id;
      serviceIds.set(svc.key, serviceId);

      await tx.insert(schema.serviceSegment).values(
        svc.segments.map((segment, i) => ({
          serviceId,
          seq: i + 1,
          kind: segment.kind,
          durationMin: segment.durationMin,
          label: segment.label ?? null,
        })),
      );

      await tx.insert(schema.serviceResourceRequirement).values(
        spec.requirements.map((req) => ({
          serviceId,
          resourceTypeId: typeIds.get(req.typeCode)!,
          quantity: 1,
          holdScope: req.holdScope,
        })),
      );
    }

    // Shop-wide opening hours (resource_id NULL).
    await tx.insert(schema.businessHour).values(
      Object.entries(spec.openHours).flatMap(([weekday, rows]) =>
        rows.map(([open, close]) => ({
          tenantId,
          resourceId: null,
          weekday: Number(weekday),
          openTime: open,
          closeTime: close,
        })),
      ),
    );

    const resourceIds = new Map<string, string>();
    for (const [index, res] of spec.resources.entries()) {
      const [row] = await tx
        .insert(schema.resource)
        .values({
          tenantId,
          resourceTypeId: typeIds.get(res.type)!,
          name: res.name,
          displayOrder: index,
          isBookable: res.type === 'staff' && spec.policy.allowCustomerPickStaff,
        })
        .returning({ id: schema.resource.id });
      const resourceId = row!.id;
      resourceIds.set(res.key, resourceId);

      if (res.skills) {
        await tx.insert(schema.resourceServiceSkill).values(
          res.skills.map((key) => ({
            resourceId,
            serviceId: serviceIds.get(key)!,
            durationFactor: String(res.durationFactor?.[key] ?? 1),
          })),
        );
      }

      if (res.hours) {
        await tx.insert(schema.businessHour).values(
          Object.entries(res.hours).flatMap(([weekday, rows]) =>
            rows.map(([open, close]) => ({
              tenantId,
              resourceId,
              weekday: Number(weekday),
              openTime: open,
              closeTime: close,
            })),
          ),
        );
      }
    }

    await tx.insert(schema.customer).values(
      spec.customers.map((c) => ({
        tenantId,
        name: c.name,
        phone: c.phone,
        note: c.note ?? null,
        birthDate: c.birthDate ?? null,
      })),
    );

    await tx.insert(schema.staffUser).values({
      tenantId,
      email: `owner@${spec.slug}.test`,
      role: 'owner',
    });

    // One stylist takes a day off next week, so the calendar is not uniform.
    const humanKeys = spec.resources.filter((r) => r.type === 'staff').map((r) => r.key);
    const dayOffFor = humanKeys[1];
    if (dayOffFor) {
      const start = DateTime.now().setZone('Asia/Bangkok').plus({ days: 5 }).startOf('day');
      await tx.insert(schema.timeOff).values({
        tenantId,
        resourceId: resourceIds.get(dayOffFor)!,
        period: `[${start.toUTC().toISO()},${start.plus({ days: 1 }).toUTC().toISO()})`,
        reason: 'ลาพักร้อน',
      });
    }
  });

  return tenantId;
}

async function seedBookings(tenantId: string, spec: SeedTenant) {
  const random = makeRandom(hash(spec.slug));
  const zone = 'Asia/Bangkok';
  const today = DateTime.now().setZone(zone).startOf('day');

  const { serviceKeys, customerIds } = await withTenant(tenantId, async (tx) => {
    const services = await tx
      .select({ id: schema.service.id, name: schema.service.name })
      .from(schema.service)
      .where(eq(schema.service.tenantId, tenantId));
    const customers = await tx
      .select({ id: schema.customer.id })
      .from(schema.customer)
      .where(eq(schema.customer.tenantId, tenantId));
    return { serviceKeys: services.map((s) => s.id), customerIds: customers.map((c) => c.id) };
  });

  let past = 0;
  let future = 0;

  for (let offset = -HISTORY_DAYS; offset <= FUTURE_DAYS; offset += 1) {
    const day = today.plus({ days: offset });
    const date = toPlainDate(day, zone);
    // Weekends are busier than weekdays.
    const isWeekend = day.weekday >= 6;
    const target = Math.round((isWeekend ? 9 : 5) * (0.7 + random() * 0.6));

    for (let n = 0; n < target; n += 1) {
      const serviceId = serviceKeys[Math.floor(random() * serviceKeys.length)]!;
      const customerId = customerIds[Math.floor(random() * customerIds.length)]!;

      // Availability is evaluated as if we were standing at the start of that
      // day, so past bookings are not rejected by the lead-time policy.
      const asOf = day.minus({ days: 1 }).set({ hour: 9 });
      const slots = await getAvailability({
        tenantId,
        date,
        serviceIds: [serviceId],
        now: asOf,
      });
      if (slots.length === 0) break;

      const slot = slots[Math.floor(random() * slots.length)]!;
      try {
        await withTenant(tenantId, async (tx) => {
          const booking = await createBookingInTx(tx, {
            tenantId,
            customerId,
            startsAt: slot.start,
            serviceIds: [serviceId],
            source: random() < 0.25 ? 'walk_in' : 'online',
            now: asOf,
          });
          if (offset < 0) {
            await completePastBooking(tx, tenantId, booking.id, slot.end, random);
          }
        });
        if (offset < 0) past += 1;
        else future += 1;
      } catch (error) {
        // The shop was full at that instant. That is the constraint doing its job.
        if (error instanceof SlotTakenError || error instanceof SlotUnavailableError) continue;
        throw error;
      }
    }
  }

  return { past, future };
}

/**
 * History needs finished visits, not just rows. Points are deliberately NOT
 * granted here: earning is Phase 5's job and belongs in lib/loyalty, and iron
 * rule #2 says points are only ever created on completion by that code path.
 */
async function completePastBooking(
  tx: TenantTx,
  tenantId: string,
  bookingId: string,
  endsAt: DateTime,
  random: () => number,
) {
  const roll = random();
  if (roll < 0.08) {
    await tx
      .update(schema.booking)
      .set({ status: 'no_show' })
      .where(and(eq(schema.booking.tenantId, tenantId), eq(schema.booking.id, bookingId)));
    return;
  }
  if (roll < 0.14) {
    await tx
      .update(schema.booking)
      .set({ status: 'cancelled', cancelledAt: endsAt.toJSDate(), cancelReason: 'ลูกค้าติดธุระ' })
      .where(and(eq(schema.booking.tenantId, tenantId), eq(schema.booking.id, bookingId)));
    return;
  }

  await tx
    .update(schema.booking)
    .set({ status: 'completed', completedAt: endsAt.toJSDate(), paymentStatus: 'paid' })
    .where(and(eq(schema.booking.tenantId, tenantId), eq(schema.booking.id, bookingId)));
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const invokedDirectly = process.argv[1]?.includes('seed');
if (invokedDirectly) {
  seed()
    .then(async () => {
      await sqlClient.end();
      console.log('seed complete');
    })
    .catch(async (err) => {
      console.error(err);
      await sqlClient.end();
      process.exit(1);
    });
}
