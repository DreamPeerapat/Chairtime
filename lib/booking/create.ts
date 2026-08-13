/**
 * Creating a booking — docs/logic.md §2.
 *
 * Iron rule #1: the database decides, not this code. We re-plan the requested
 * start time against fresh data (the customer has been staring at a form for
 * two minutes), then INSERT the allocations and let the EXCLUDE constraint on
 * `resource_allocation` reject anything that overlaps. There is no
 * SELECT-then-INSERT check and no application lock, because either would lose
 * the race under concurrency.
 *
 * A 23P01 is not retried: the customer should see the current options and pick
 * again rather than be silently moved to a different slot or stylist.
 */
import { sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';
import { toPlainDate, toTstzRange } from '@/lib/time';
import { findSlots, loadAvailabilityContext } from '@/lib/availability';
import type { AvailableSlot } from '@/lib/availability/types';
import { generateBookingCode } from './code';
import { BookingPolicyError, SlotTakenError, SlotUnavailableError, isExclusionViolation } from './errors';

export interface CreateBookingInput {
  tenantId: string;
  customerId?: string | null;
  /** the exact instant the customer picked, as returned by the availability API */
  startsAt: DateTime;
  serviceIds: string[];
  preferredResourceId?: string | undefined;
  source?: 'online' | 'walk_in' | 'phone' | 'admin';
  customerNote?: string | null;
  priorityBookingDays?: number;
  now?: DateTime;
}

export interface CreatedBooking {
  id: string;
  code: string;
  startsAt: DateTime;
  endsAt: DateTime;
  staffResourceId: string | null;
  subtotal: string;
  items: Array<{ id: string; serviceId: string; serviceName: string; price: string }>;
}

export async function createBooking(input: CreateBookingInput): Promise<CreatedBooking> {
  return withTenant(input.tenantId, (tx) => createBookingInTx(tx, input));
}

export async function createBookingInTx(
  tx: TenantTx,
  input: CreateBookingInput,
): Promise<CreatedBooking> {
  if (input.serviceIds.length === 0) throw new BookingPolicyError('ต้องเลือกบริการอย่างน้อย 1 อย่าง');

  const ctx = await loadAvailabilityContext(
    tx,
    input.tenantId,
    toPlainDate(input.startsAt, await tenantZone(tx, input.tenantId)),
    input.serviceIds,
  );
  const startsAt = input.startsAt.setZone(ctx.timezone);

  // Re-plan rather than trust what the browser sent: the plan carries the
  // resource assignment, and stale plans are exactly what the constraint exists
  // to catch.
  const slots = findSlots(ctx, {
    date: toPlainDate(startsAt, ctx.timezone),
    serviceIds: input.serviceIds,
    preferredResourceId: input.preferredResourceId,
    priorityBookingDays: input.priorityBookingDays ?? 0,
    now: input.now,
  });

  const slot = slots.find((s) => s.start.toMillis() === startsAt.toMillis());
  if (!slot) throw new SlotUnavailableError();

  return insertBooking(tx, input, ctx, slot);
}

async function tenantZone(tx: TenantTx, tenantId: string): Promise<string> {
  const rows = await tx.execute<{ timezone: string }>(
    sql`SELECT timezone FROM tenant WHERE id = ${tenantId}`,
  );
  const zone = [...rows][0]?.timezone;
  if (!zone) throw new Error(`unknown tenant: ${tenantId}`);
  return zone;
}

async function insertBooking(
  tx: TenantTx,
  input: CreateBookingInput,
  ctx: Awaited<ReturnType<typeof loadAvailabilityContext>>,
  slot: AvailableSlot,
): Promise<CreatedBooking> {
  const priceOf = (serviceId: string): string => {
    const svc = ctx.services.find((s) => s.id === serviceId)!;
    if (!slot.staffResourceId) return svc.basePrice;
    const staff = ctx.resources.find((r) => r.id === slot.staffResourceId);
    return staff?.skills.get(serviceId)?.priceOverride ?? svc.basePrice;
  };

  const subtotal = input.serviceIds.reduce((sum, id) => sum + toSatang(priceOf(id)), 0);

  const [bookingRow] = await tx
    .insert(schema.booking)
    .values({
      tenantId: input.tenantId,
      customerId: input.customerId ?? null,
      code: generateBookingCode(),
      status: ctx.policy.allowCustomerPickStaff === false ? 'pending' : 'confirmed',
      startsAt: slot.start.toJSDate(),
      endsAt: slot.end.toJSDate(),
      source: input.source ?? 'online',
      subtotal: fromSatang(subtotal),
      total: fromSatang(subtotal),
      customerNote: input.customerNote ?? null,
    })
    .returning({ id: schema.booking.id, code: schema.booking.code });

  if (!bookingRow) throw new Error('booking insert returned no row');

  // Item boundaries come from the plan, so the stored times already include
  // buffers and passive stretches.
  const itemSpans = new Map<string, { start: DateTime; end: DateTime }>();
  for (const hold of slot.holds) {
    const current = itemSpans.get(hold.serviceId);
    if (!current) {
      itemSpans.set(hold.serviceId, { start: hold.start, end: hold.end });
    } else {
      if (hold.start < current.start) current.start = hold.start;
      if (hold.end > current.end) current.end = hold.end;
    }
  }

  const items: CreatedBooking['items'] = [];
  const itemIdByService = new Map<string, string>();

  for (const [index, serviceId] of input.serviceIds.entries()) {
    const svc = ctx.services.find((s) => s.id === serviceId)!;
    const span = itemSpans.get(serviceId);
    if (!span) throw new Error(`plan produced no holds for service ${serviceId}`);

    const [itemRow] = await tx
      .insert(schema.bookingItem)
      .values({
        bookingId: bookingRow.id,
        serviceId,
        seq: index + 1,
        serviceName: svc.name,
        price: priceOf(serviceId),
        durationMin: Math.round(span.end.diff(span.start, 'minutes').minutes),
        startsAt: span.start.toJSDate(),
        endsAt: span.end.toJSDate(),
      })
      .returning({ id: schema.bookingItem.id });

    if (!itemRow) throw new Error('booking_item insert returned no row');
    itemIdByService.set(serviceId, itemRow.id);
    items.push({ id: itemRow.id, serviceId, serviceName: svc.name, price: priceOf(serviceId) });
  }

  // The line that actually reserves the time. Anything overlapping is rejected
  // here by `resource_no_overlap`.
  try {
    await tx.insert(schema.resourceAllocation).values(
      slot.holds.map((hold) => ({
        tenantId: input.tenantId,
        bookingItemId: itemIdByService.get(hold.serviceId)!,
        resourceId: hold.resourceId,
        period: toTstzRange({ start: hold.start, end: hold.end }),
        isActiveHold: hold.isActiveHold,
      })),
    );
  } catch (error) {
    if (isExclusionViolation(error)) throw new SlotTakenError();
    throw error;
  }

  return {
    id: bookingRow.id,
    code: bookingRow.code,
    startsAt: slot.start,
    endsAt: slot.end,
    staffResourceId: slot.staffResourceId,
    subtotal: fromSatang(subtotal),
    items,
  };
}

/** Iron rule #5: money is integer satang in code, numeric(10,2) in the DB. */
export function toSatang(amount: string): number {
  const [whole = '0', frac = ''] = amount.split('.');
  const satang = `${frac}00`.slice(0, 2);
  const sign = whole.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number(satang));
}

export function fromSatang(satang: number): string {
  const sign = satang < 0 ? '-' : '';
  const abs = Math.abs(Math.round(satang));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
