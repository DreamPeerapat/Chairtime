/**
 * Cancelling has to actually give the time back. Flipping `is_released` takes
 * the row out of the EXCLUDE constraint's partial index, which is the only
 * thing that makes the slot bookable again.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { and, eq } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { cancelBooking, createBooking, markNoShow } from '@/lib/booking';
import { BookingPolicyError, SlotUnavailableError } from '@/lib/booking/errors';
import { getAvailability } from '@/lib/availability';
import { createSimpleShop, resetDatabase } from '../support/db';

const ZONE = 'Asia/Bangkok';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

async function firstSlot(dayOffset = 3) {
  const date = DateTime.now().setZone(ZONE).plus({ days: dayOffset }).toISODate()!;
  const slots = await getAvailability({
    tenantId: shop.tenantId,
    date,
    serviceIds: [shop.serviceId],
  });
  return { date, slots };
}

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'lifecycle', staffCount: 1, chairCount: 1 });
});

describe('cancel', () => {
  it('frees the slot for the next customer', async () => {
    const { date, slots } = await firstSlot();
    const start = slots[0]!.start;

    const booking = await createBooking({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      startsAt: start,
      serviceIds: [shop.serviceId],
    });

    // taken
    await expect(
      createBooking({
        tenantId: shop.tenantId,
        customerId: shop.customerId,
        startsAt: start,
        serviceIds: [shop.serviceId],
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);

    await cancelBooking({
      tenantId: shop.tenantId,
      bookingId: booking.id,
      reason: 'ลูกค้าติดธุระ',
    });

    // and available again
    const after = await getAvailability({
      tenantId: shop.tenantId,
      date,
      serviceIds: [shop.serviceId],
    });
    expect(after.some((s) => s.start.toMillis() === start.toMillis())).toBe(true);

    const rebooked = await createBooking({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      startsAt: start,
      serviceIds: [shop.serviceId],
    });
    expect(rebooked.id).not.toBe(booking.id);
  });

  it('marks the allocations released rather than deleting them', async () => {
    const { slots } = await firstSlot();
    const booking = await createBooking({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      startsAt: slots[0]!.start,
      serviceIds: [shop.serviceId],
    });
    await cancelBooking({ tenantId: shop.tenantId, bookingId: booking.id });

    const allocations = await withTenant(shop.tenantId, (tx) =>
      tx
        .select({ isReleased: schema.resourceAllocation.isReleased })
        .from(schema.resourceAllocation)
        .where(eq(schema.resourceAllocation.tenantId, shop.tenantId)),
    );

    // history kept, time given back
    expect(allocations).toHaveLength(2);
    expect(allocations.every((a) => a.isReleased)).toBe(true);
  });

  it('is idempotent', async () => {
    const { slots } = await firstSlot();
    const booking = await createBooking({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      startsAt: slots[0]!.start,
      serviceIds: [shop.serviceId],
    });

    await cancelBooking({ tenantId: shop.tenantId, bookingId: booking.id });
    await expect(
      cancelBooking({ tenantId: shop.tenantId, bookingId: booking.id }),
    ).resolves.toBeUndefined();
  });

  it('refuses once the cutoff has passed, unless an admin overrides', async () => {
    await resetDatabase();
    shop = await createSimpleShop({ slug: 'cutoff', staffCount: 1, chairCount: 1 });
    await withTenant(shop.tenantId, (tx) =>
      tx
        .update(schema.tenantBookingPolicy)
        .set({ cancelCutoffMin: 180 })
        .where(eq(schema.tenantBookingPolicy.tenantId, shop.tenantId)),
    );

    const { slots } = await firstSlot();
    const booking = await createBooking({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      startsAt: slots[0]!.start,
      serviceIds: [shop.serviceId],
    });

    // pretend we are one hour before the appointment
    const tooLate = slots[0]!.start.minus({ minutes: 60 });

    await expect(
      cancelBooking({ tenantId: shop.tenantId, bookingId: booking.id, now: tooLate }),
    ).rejects.toBeInstanceOf(BookingPolicyError);

    await expect(
      cancelBooking({
        tenantId: shop.tenantId,
        bookingId: booking.id,
        now: tooLate,
        bypassCutoff: true,
      }),
    ).resolves.toBeUndefined();
  });

  it('will not cancel a finished visit', async () => {
    const { slots } = await firstSlot();
    const booking = await createBooking({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      startsAt: slots[0]!.start,
      serviceIds: [shop.serviceId],
    });
    await withTenant(shop.tenantId, (tx) =>
      tx
        .update(schema.booking)
        .set({ status: 'completed' })
        .where(eq(schema.booking.id, booking.id)),
    );

    await expect(
      cancelBooking({ tenantId: shop.tenantId, bookingId: booking.id }),
    ).rejects.toThrow(/ทำเสร็จแล้ว/);
  });
});

describe('no-show', () => {
  it('frees the resources and counts against the customer', async () => {
    const { date, slots } = await firstSlot();
    const start = slots[0]!.start;

    const booking = await createBooking({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      startsAt: start,
      serviceIds: [shop.serviceId],
    });

    await markNoShow({ tenantId: shop.tenantId, bookingId: booking.id });

    const [customer] = await withTenant(shop.tenantId, (tx) =>
      tx
        .select({ noShowCount: schema.customer.noShowCount })
        .from(schema.customer)
        .where(eq(schema.customer.id, shop.customerId)),
    );
    expect(customer!.noShowCount).toBe(1);

    const [row] = await withTenant(shop.tenantId, (tx) =>
      tx
        .select({ status: schema.booking.status })
        .from(schema.booking)
        .where(and(eq(schema.booking.tenantId, shop.tenantId), eq(schema.booking.id, booking.id))),
    );
    expect(row!.status).toBe('no_show');

    const after = await getAvailability({
      tenantId: shop.tenantId,
      date,
      serviceIds: [shop.serviceId],
    });
    expect(after.some((s) => s.start.toMillis() === start.toMillis())).toBe(true);
  });
});

describe('booking record', () => {
  it('snapshots the service name and price at booking time', async () => {
    const { slots } = await firstSlot();
    const booking = await createBooking({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      startsAt: slots[0]!.start,
      serviceIds: [shop.serviceId],
    });

    // the shop puts its prices up afterwards
    await withTenant(shop.tenantId, (tx) =>
      tx
        .update(schema.service)
        .set({ name: 'ตัดผม (ราคาใหม่)', basePrice: '900.00' })
        .where(eq(schema.service.id, shop.serviceId)),
    );

    const [item] = await withTenant(shop.tenantId, (tx) =>
      tx
        .select({ serviceName: schema.bookingItem.serviceName, price: schema.bookingItem.price })
        .from(schema.bookingItem)
        .where(eq(schema.bookingItem.bookingId, booking.id)),
    );

    expect(item!.serviceName).toBe('ตัดผม');
    expect(item!.price).toBe('500.00');
  });
});
