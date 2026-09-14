import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createBookingInTx } from '@/lib/booking';
import { withTenant } from '@/lib/db/tenant';
import { resolveCustomer } from '@/lib/customer/upsert';
import { BookingPolicyError, SlotTakenError, SlotUnavailableError } from '@/lib/booking/errors';
import { createBookingSchema } from '@/lib/booking/schemas';
import { fetchLineProfile } from '@/lib/line/profile';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings
 *
 * A 409 here is normal traffic, not a bug: two people picked the same slot and
 * the database rejected the second. The client should refresh the slot list.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ข้อมูลไม่ถูกต้อง', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;

  // Resolve the LINE identity from the token before opening the transaction:
  // it is a network call to LINE, and holding a database transaction open
  // across it would pin a connection for the round trip. A token LINE rejects
  // simply yields no id — the booking still goes through on the phone number,
  // because a customer standing in the shop's LIFF page should not lose their
  // appointment over an expired token.
  const lineUserId = input.lineAccessToken
    ? ((await fetchLineProfile(input.lineAccessToken))?.userId ?? null)
    : null;

  try {
    // Customer lookup and booking share one transaction: a booking that fails
    // the exclusion constraint must not leave a half-created customer behind.
    const booking = await withTenant(input.tenantId, async (tx) => {
      const customerId =
        input.customerId ??
        (await resolveCustomer(tx, {
          tenantId: input.tenantId,
          name: input.customerName,
          phone: input.customerPhone,
          lineUserId,
        }));

      return createBookingInTx(tx, {
        tenantId: input.tenantId,
        customerId,
        startsAt: DateTime.fromISO(input.startsAt, { setZone: true }),
        serviceIds: input.serviceIds,
        preferredResourceId: input.resourceId,
        source: input.source,
        customerNote: input.customerNote ?? null,
      });
    });

    return NextResponse.json(
      {
        id: booking.id,
        code: booking.code,
        startsAt: booking.startsAt.toISO(),
        endsAt: booking.endsAt.toISO(),
        staffResourceId: booking.staffResourceId,
        subtotal: booking.subtotal,
        items: booking.items,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SlotTakenError || error instanceof SlotUnavailableError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if (error instanceof BookingPolicyError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    throw error;
  }
}
