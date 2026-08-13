/**
 * Cancelling a booking.
 *
 * Releasing means flipping `is_released`, which takes the row out of the
 * EXCLUDE constraint's partial index and frees the time for somebody else. The
 * row itself stays — the history of who held what is worth keeping, and this is
 * a status change rather than the soft delete CLAUDE.md warns about.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';
import { cancelBookingNotifications, enqueue } from '@/lib/notifications/queue';
import { dedupeKey } from '@/lib/notifications/templates';
import { BookingPolicyError } from './errors';

export interface CancelBookingInput {
  tenantId: string;
  bookingId: string;
  reason?: string | null;
  /** admin cancellations ignore the customer-facing cutoff */
  bypassCutoff?: boolean;
  now?: DateTime;
}

export async function cancelBooking(input: CancelBookingInput): Promise<void> {
  return withTenant(input.tenantId, (tx) => cancelBookingInTx(tx, input));
}

export async function cancelBookingInTx(tx: TenantTx, input: CancelBookingInput): Promise<void> {
  const [bookingRow] = await tx
    .select({
      id: schema.booking.id,
      status: schema.booking.status,
      startsAt: schema.booking.startsAt,
    })
    .from(schema.booking)
    .where(and(eq(schema.booking.tenantId, input.tenantId), eq(schema.booking.id, input.bookingId)));

  if (!bookingRow) throw new BookingPolicyError('ไม่พบรายการจองนี้');
  if (bookingRow.status === 'cancelled') return; // idempotent
  if (bookingRow.status === 'completed') {
    throw new BookingPolicyError('รายการนี้ทำเสร็จแล้ว ยกเลิกไม่ได้');
  }

  if (!input.bypassCutoff) {
    const [policy] = await tx
      .select({ cancelCutoffMin: schema.tenantBookingPolicy.cancelCutoffMin })
      .from(schema.tenantBookingPolicy)
      .where(eq(schema.tenantBookingPolicy.tenantId, input.tenantId));

    const cutoffMin = policy?.cancelCutoffMin ?? 0;
    const now = input.now ?? DateTime.now();
    const startsAt = DateTime.fromJSDate(bookingRow.startsAt);
    if (startsAt.diff(now, 'minutes').minutes < cutoffMin) {
      throw new BookingPolicyError(
        `ยกเลิกได้ก่อนเวลานัดอย่างน้อย ${cutoffMin} นาที กรุณาติดต่อร้านโดยตรง`,
      );
    }
  }

  const itemIds = await tx
    .select({ id: schema.bookingItem.id })
    .from(schema.bookingItem)
    .where(eq(schema.bookingItem.bookingId, input.bookingId));

  if (itemIds.length > 0) {
    await tx
      .update(schema.resourceAllocation)
      .set({ isReleased: true })
      .where(
        and(
          eq(schema.resourceAllocation.tenantId, input.tenantId),
          inArray(
            schema.resourceAllocation.bookingItemId,
            itemIds.map((i) => i.id),
          ),
        ),
      );
  }

  const now = input.now ?? DateTime.now();

  await tx
    .update(schema.booking)
    .set({
      status: 'cancelled',
      cancelledAt: now.toJSDate(),
      cancelReason: input.reason ?? null,
      updatedAt: now.toJSDate(),
    })
    .where(and(eq(schema.booking.tenantId, input.tenantId), eq(schema.booking.id, input.bookingId)));

  // Retract the reminders before telling the customer it is off, or they get a
  // "see you tomorrow" for a booking that no longer exists.
  await cancelBookingNotifications(tx, input.tenantId, input.bookingId);

  const [customer] = await tx
    .select({ id: schema.booking.customerId })
    .from(schema.booking)
    .where(eq(schema.booking.id, input.bookingId));

  if (customer?.id) {
    await enqueue(tx, {
      tenantId: input.tenantId,
      customerId: customer.id,
      template: 'booking_cancelled',
      scheduledAt: now,
      payload: { bookingId: input.bookingId },
      dedupeKey: dedupeKey('booking_cancelled', 'booking', input.bookingId),
    });
  }
}

/** Marking a no-show also frees the resources and bumps the customer counter. */
export async function markNoShow(input: { tenantId: string; bookingId: string; now?: DateTime }) {
  return withTenant(input.tenantId, async (tx) => {
    const [bookingRow] = await tx
      .select({ customerId: schema.booking.customerId })
      .from(schema.booking)
      .where(
        and(eq(schema.booking.tenantId, input.tenantId), eq(schema.booking.id, input.bookingId)),
      );
    if (!bookingRow) throw new BookingPolicyError('ไม่พบรายการจองนี้');

    const itemIds = await tx
      .select({ id: schema.bookingItem.id })
      .from(schema.bookingItem)
      .where(eq(schema.bookingItem.bookingId, input.bookingId));

    if (itemIds.length > 0) {
      await tx
        .update(schema.resourceAllocation)
        .set({ isReleased: true })
        .where(
          inArray(
            schema.resourceAllocation.bookingItemId,
            itemIds.map((i) => i.id),
          ),
        );
    }

    await tx
      .update(schema.booking)
      .set({ status: 'no_show', updatedAt: (input.now ?? DateTime.now()).toJSDate() })
      .where(eq(schema.booking.id, input.bookingId));

    await cancelBookingNotifications(tx, input.tenantId, input.bookingId);

    if (bookingRow.customerId) {
      await tx
        .update(schema.customer)
        // Incremented in SQL: a read-modify-write in JS would lose a
        // concurrent update from another till.
        .set({ noShowCount: sql`${schema.customer.noShowCount} + 1` })
        .where(eq(schema.customer.id, bookingRow.customerId));
    }
  });
}
