/**
 * The revenue figure, against real bookings.
 *
 * The number a shop owner reads off this page is the one they will compare
 * against the cash in the till, so the rule it follows has to be exact: only
 * a booking somebody marked "เสร็จแล้ว" is money. A confirmed booking is a
 * promise and a cancelled one is a hole in the day.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { createBooking } from '@/lib/booking';
import { getAvailability } from '@/lib/availability';
import { loadPeriodStats } from '@/lib/admin/stats';
import { createSimpleShop, resetDatabase } from '../support/db';

const ZONE = 'Asia/Bangkok';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'stats-shop', staffCount: 1, chairCount: 1 });
});

/** Books on the given day and leaves the booking in the given status. */
async function bookOn(dayOffset: number, status: string) {
  const date = DateTime.now().setZone(ZONE).plus({ days: dayOffset }).toISODate()!;
  const slots = await getAvailability({
    tenantId: shop.tenantId,
    date,
    serviceIds: [shop.serviceId],
  });
  const booking = await createBooking({
    tenantId: shop.tenantId,
    customerId: shop.customerId,
    startsAt: slots[0]!.start,
    serviceIds: [shop.serviceId],
  });

  if (status !== 'confirmed') {
    // Through withTenant, not the bare client: `booking` has FORCE ROW LEVEL
    // SECURITY, so an update without app.tenant_id set matches nothing and
    // says so by changing nothing at all.
    await withTenant(shop.tenantId, (tx) =>
      tx.update(schema.booking).set({ status }).where(eq(schema.booking.id, booking.id)),
    );
  }
  return booking;
}

async function statsForMonth() {
  return loadPeriodStats(shop.tenantId, 'month', ZONE, DateTime.now().setZone(ZONE));
}

describe('revenue', () => {
  it('counts only what was finished', async () => {
    const done = await bookOn(1, 'completed');
    await bookOn(2, 'confirmed');
    await bookOn(3, 'cancelled');
    await bookOn(4, 'no_show');

    const stats = await statsForMonth();

    expect(stats.completed).toBe(1);
    expect(stats.cancelled).toBe(1);
    expect(stats.noShow).toBe(1);
    expect(stats.revenue).toBe(done.subtotal);
  });

  it('is zero, not blank, for a period with nothing in it', async () => {
    const stats = await statsForMonth();
    expect(stats.revenue).toBe('0.00');
    expect(stats.averageTicket).toBe('0.00');
    expect(stats.services).toEqual([]);
  });

  it('averages over finished bookings only', async () => {
    await bookOn(1, 'completed');
    await bookOn(2, 'completed');
    await bookOn(3, 'cancelled');

    const stats = await statsForMonth();
    // Two identical bookings: the average is one of them, and the cancelled
    // one must not drag it down.
    expect(stats.averageTicket).toBe((Number(stats.revenue) / 2).toFixed(2));
  });

  it('leaves out a booking in a different month', async () => {
    await bookOn(1, 'completed');

    const nextMonth = await loadPeriodStats(
      shop.tenantId,
      'month',
      ZONE,
      DateTime.now().setZone(ZONE),
      1,
    );
    expect(nextMonth.completed).toBe(0);
    expect(nextMonth.revenue).toBe('0.00');
  });
});

describe('what sold', () => {
  it('ranks the services by how often they were bought', async () => {
    await bookOn(1, 'completed');
    await bookOn(2, 'completed');

    const stats = await statsForMonth();
    expect(stats.services).toHaveLength(1);
    expect(stats.services[0]!.bookings).toBe(2);
    expect(Number(stats.services[0]!.revenue)).toBe(Number(stats.revenue));
  });

  it('credits the stylist once per booking, not once per held span', async () => {
    // A service with a passive stretch holds its stylist across more than one
    // allocation row; counting rows would double both tallies.
    await bookOn(1, 'completed');

    const stats = await statsForMonth();
    expect(stats.staff).toHaveLength(1);
    expect(stats.staff[0]!.bookings).toBe(1);
  });

  it('keeps one shop out of another\'s figures', async () => {
    const other = await createSimpleShop({ slug: 'stats-other', staffCount: 1, chairCount: 1 });
    await bookOn(1, 'completed');

    const theirs = await loadPeriodStats(other.tenantId, 'month', ZONE, DateTime.now().setZone(ZONE));
    expect(theirs.completed).toBe(0);
    expect(theirs.revenue).toBe('0.00');
  });
});
