/**
 * Asking the customer how the visit went.
 *
 * Queued when the shop presses เสร็จสิ้น, which is the only moment anyone
 * knows the service actually happened — a booking that reaches its end time
 * untouched is not a visit, and `no_show` certainly is not.
 *
 * WHO GETS ASKED, and why it is not everyone:
 *
 * Only a customer with a LINE id, because a push is the only way we can
 * reach anyone unprompted. A walk-in, a booking taken over the phone, or
 * anyone who has simply never linked LINE has no address to send to — for
 * them the shop shows the rating link from the booking drawer instead
 * (lib/feedback/link.ts). Both roads end at the same page, because it is
 * keyed by the booking code, which every booking has whatever its source.
 *
 * Off unless the shop turns it on: the push comes out of the shop's own LINE
 * quota. See the note on `feedbackEnabled` in lib/db/schema.ts.
 */
import { and, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import { enqueue } from '@/lib/notifications/queue';
import { dedupeKey } from '@/lib/notifications/templates';

/**
 * How long after the visit to ask.
 *
 * Not immediately: the customer is usually still in the shop, sometimes still
 * paying, and a rating asked across the counter is a rating given in front of
 * the person being rated. Two hours is long enough to have left and short
 * enough that the visit is still what they were doing today.
 */
export const FEEDBACK_DELAY_HOURS = 2;

export async function queueFeedbackRequest(
  tx: TenantTx,
  input: { tenantId: string; bookingId: string; now: DateTime },
): Promise<'queued' | 'disabled' | 'no-line-id'> {
  const [policy] = await tx
    .select({ enabled: schema.tenantBookingPolicy.feedbackEnabled })
    .from(schema.tenantBookingPolicy)
    .where(eq(schema.tenantBookingPolicy.tenantId, input.tenantId));

  if (!policy?.enabled) return 'disabled';

  const [row] = await tx
    .select({
      customerId: schema.booking.customerId,
      lineUserId: schema.customer.lineUserId,
    })
    .from(schema.booking)
    .leftJoin(schema.customer, eq(schema.customer.id, schema.booking.customerId))
    .where(
      and(eq(schema.booking.tenantId, input.tenantId), eq(schema.booking.id, input.bookingId)),
    );

  // A walk-in with no record at all, or a customer who has never opened the
  // shop's LINE. Not a failure — the shop hands them the link instead.
  if (!row?.customerId || !row.lineUserId) return 'no-line-id';

  await enqueue(tx, {
    tenantId: input.tenantId,
    customerId: row.customerId,
    template: 'feedback_request',
    scheduledAt: input.now.plus({ hours: FEEDBACK_DELAY_HOURS }),
    payload: { bookingId: input.bookingId },
    // Keyed on the booking, so pressing เสร็จสิ้น twice asks once. The status
    // guard in lib/admin/actions.ts already prevents the second call, and
    // this is the layer that does not depend on it being right.
    dedupeKey: dedupeKey('feedback_request', 'booking', input.bookingId),
  });

  return 'queued';
}
