/**
 * A shop that has stopped paying stops taking bookings.
 *
 * The trial-expiry cron has been writing `status = 'suspended'` every night
 * since the first release and nothing read it, so a lapsed shop kept working
 * exactly as before. These are the teeth.
 *
 * What is deliberately *not* here: a suspended shop being locked out. It
 * still has customers booked for this afternoon, and a salon that cannot open
 * its own calendar phones in a panic rather than pays.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { cancelBooking, createBooking } from '@/lib/booking';
import { BookingPolicyError } from '@/lib/booking/errors';
import { getAvailability } from '@/lib/availability';
import { createSimpleShop, resetDatabase } from '../support/db';

const ZONE = 'Asia/Bangkok';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'gate-shop', staffCount: 1, chairCount: 1 });
});

async function setStatus(status: string) {
  await db.update(schema.tenant).set({ status }).where(eq(schema.tenant.id, shop.tenantId));
}

async function book(source: 'online' | 'walk_in' = 'online', dayOffset = 3) {
  const date = DateTime.now().setZone(ZONE).plus({ days: dayOffset }).toISODate()!;
  const slots = await getAvailability({
    tenantId: shop.tenantId,
    date,
    serviceIds: [shop.serviceId],
  });
  return createBooking({
    tenantId: shop.tenantId,
    customerId: shop.customerId,
    startsAt: slots[0]!.start,
    serviceIds: [shop.serviceId],
    source,
  });
}

describe('taking bookings', () => {
  it('works while the shop is active', async () => {
    const booking = await book();
    expect(booking.code).toBeTruthy();
  });

  it('is refused once the shop is suspended', async () => {
    await setStatus('suspended');
    await expect(book()).rejects.toBeInstanceOf(BookingPolicyError);
  });

  it('is refused for a shop that signed up and never paid', async () => {
    await setStatus('pending_payment');
    await expect(book()).rejects.toBeInstanceOf(BookingPolicyError);
  });

  it('is refused at the till as well as online', async () => {
    // The gate sits in createBookingInTx, so the walk-in form cannot route
    // around it — that is why it is there and not in the API handler.
    await setStatus('suspended');
    await expect(book('walk_in')).rejects.toBeInstanceOf(BookingPolicyError);
  });

  it('never tells the customer the shop has not paid its bill', async () => {
    await setStatus('suspended');

    const online = await book('online').catch((e: BookingPolicyError) => e);
    const till = await book('walk_in').catch((e: BookingPolicyError) => e);

    expect((online as BookingPolicyError).message).not.toContain('แพ็กเกจ');
    expect((online as BookingPolicyError).message).toContain('ติดต่อร้าน');
    // Staff can fix it, so they are told what is actually wrong.
    expect((till as BookingPolicyError).message).toContain('แพ็กเกจ');
    expect((online as BookingPolicyError).code).toBe('subscription_inactive');
  });
});

describe('what a suspended shop can still do', () => {
  it('cancels a booking it already had', async () => {
    const booking = await book();
    await setStatus('suspended');

    // No throw: the customer who booked last week must still be able to call
    // and get their slot released.
    await cancelBooking({ tenantId: shop.tenantId, bookingId: booking.id, actor: 'staff' });

    const [row] = await withTenant(shop.tenantId, (tx) =>
      tx
        .select({ status: schema.booking.status })
        .from(schema.booking)
        .where(eq(schema.booking.id, booking.id)),
    );
    expect(row!.status).toBe('cancelled');
  });

});
