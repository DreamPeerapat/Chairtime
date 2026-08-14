/**
 * docs/logic.md ข้อ 3.1 + docs/prompts.md ข้อ 6: points are only ever
 * created when a booking is marked completed, and pressing "เสร็จงาน" twice
 * must not create them twice.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { earnPointsForBooking } from '@/lib/loyalty/earn';
import { createSimpleShop, resetDatabase } from '../support/db';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'loyalty-earn-shop', pointRule: { bahtPerPoint: 100, rounding: 'floor' } });
});

async function makeBooking(overrides: Partial<typeof schema.booking.$inferInsert> = {}) {
  return withTenant(shop.tenantId, async (tx) => {
    const [row] = await tx
      .insert(schema.booking)
      .values({
        tenantId: shop.tenantId,
        customerId: shop.customerId,
        code: `T${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        status: 'completed',
        startsAt: new Date(),
        endsAt: new Date(),
        total: '500.00',
        pointDiscount: '0',
        ...overrides,
      })
      .returning();
    return row!;
  });
}

let itemSeq = 0;

async function addItem(bookingId: string, serviceId: string, price: string) {
  itemSeq += 1;
  await withTenant(shop.tenantId, (tx) =>
    tx.insert(schema.bookingItem).values({
      bookingId,
      serviceId,
      seq: itemSeq,
      serviceName: 'test',
      price,
      durationMin: 60,
      startsAt: new Date(),
      endsAt: new Date(),
    }),
  );
}

describe('earning points', () => {
  it('awards floor(total / baht_per_point) points and updates the customer', async () => {
    const booking = await makeBooking({ total: '555.00' });
    await addItem(booking.id, shop.serviceId, '555.00');

    const result = await withTenant(shop.tenantId, (tx) => earnPointsForBooking(tx, shop.tenantId, booking.id));
    expect(result.pointsEarned).toBe(5); // floor(555/100)

    const [customer] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.customer).where(eq(schema.customer.id, shop.customerId)),
    );
    expect(customer!.pointBalance).toBe(5);
    expect(customer!.lifetimePoints).toBe(5);

    const [lot] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.pointLot).where(eq(schema.pointLot.customerId, shop.customerId)),
    );
    expect(lot!.pointsTotal).toBe(5);
    expect(lot!.pointsRemaining).toBe(5);
    expect(lot!.sourceId).toBe(booking.id);

    const [queued] = await withTenant(shop.tenantId, (tx) =>
      tx
        .select()
        .from(schema.notificationQueue)
        .where(eq(schema.notificationQueue.template, 'points_earned')),
    );
    expect(queued).toBeDefined();
    expect(queued!.customerId).toBe(shop.customerId);
    expect(queued!.payload).toMatchObject({ points: 5, balance: 5 });
  });

  it('presses "เสร็จงาน" twice — points appear once', async () => {
    const booking = await makeBooking({ total: '500.00' });
    await addItem(booking.id, shop.serviceId, '500.00');

    const first = await withTenant(shop.tenantId, (tx) => earnPointsForBooking(tx, shop.tenantId, booking.id));
    const second = await withTenant(shop.tenantId, (tx) => earnPointsForBooking(tx, shop.tenantId, booking.id));

    expect(first.pointsEarned).toBe(5);
    expect(second.pointsEarned).toBe(0);

    const [customer] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.customer).where(eq(schema.customer.id, shop.customerId)),
    );
    expect(customer!.pointBalance).toBe(5);

    const lots = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.pointLot).where(eq(schema.pointLot.customerId, shop.customerId)),
    );
    expect(lots).toHaveLength(1);
  });

  it('never earns points from the portion already paid with points', async () => {
    const booking = await makeBooking({ total: '500.00', pointDiscount: '200.00' });
    await addItem(booking.id, shop.serviceId, '500.00');

    const result = await withTenant(shop.tenantId, (tx) => earnPointsForBooking(tx, shop.tenantId, booking.id));
    expect(result.pointsEarned).toBe(3); // floor((500-200)/100)
  });

  it('excludes services with point_earn_mode = none from the base', async () => {
    const [nonEarning] = await withTenant(shop.tenantId, (tx) =>
      tx
        .insert(schema.service)
        .values({ tenantId: shop.tenantId, name: 'ของแถม', basePrice: '100.00', pointEarnMode: 'none' })
        .returning({ id: schema.service.id }),
    );

    const booking = await makeBooking({ total: '600.00' });
    await addItem(booking.id, shop.serviceId, '500.00');
    await addItem(booking.id, nonEarning!.id, '100.00');

    const result = await withTenant(shop.tenantId, (tx) => earnPointsForBooking(tx, shop.tenantId, booking.id));
    expect(result.pointsEarned).toBe(5); // floor((600-100)/100), not floor(600/100)
  });

  it('applies the customer tier point multiplier', async () => {
    const [tier] = await withTenant(shop.tenantId, (tx) =>
      tx
        .insert(schema.membershipTier)
        .values({ tenantId: shop.tenantId, name: 'Gold', level: 1, pointMultiplier: '1.50' })
        .returning({ id: schema.membershipTier.id }),
    );
    await withTenant(shop.tenantId, (tx) =>
      tx.insert(schema.customerTier).values({ customerId: shop.customerId, tierId: tier!.id }),
    );

    const booking = await makeBooking({ total: '600.00' });
    await addItem(booking.id, shop.serviceId, '600.00');

    const result = await withTenant(shop.tenantId, (tx) => earnPointsForBooking(tx, shop.tenantId, booking.id));
    expect(result.pointsEarned).toBe(9); // floor(floor(600/100) * 1.5) = floor(6 * 1.5) = 9
  });

  it('does nothing for a booking with no customer on record', async () => {
    const booking = await makeBooking({ total: '500.00', customerId: null });
    await addItem(booking.id, shop.serviceId, '500.00');

    const result = await withTenant(shop.tenantId, (tx) => earnPointsForBooking(tx, shop.tenantId, booking.id));
    expect(result.pointsEarned).toBe(0);
  });

  it('sets the lot to expire per the rule’s expiry_months', async () => {
    const shortLived = await createSimpleShop({
      slug: 'loyalty-expiry-shop',
      pointRule: { bahtPerPoint: 100, expiryMonths: 6 },
    });
    const booking = await withTenant(shortLived.tenantId, async (tx) => {
      const [row] = await tx
        .insert(schema.booking)
        .values({
          tenantId: shortLived.tenantId,
          customerId: shortLived.customerId,
          code: 'EXP001',
          status: 'completed',
          startsAt: new Date(),
          endsAt: new Date(),
          total: '500.00',
        })
        .returning();
      await tx.insert(schema.bookingItem).values({
        bookingId: row!.id,
        serviceId: shortLived.serviceId,
        seq: 1,
        serviceName: 'test',
        price: '500.00',
        durationMin: 60,
        startsAt: new Date(),
        endsAt: new Date(),
      });
      return row!;
    });

    await withTenant(shortLived.tenantId, (tx) => earnPointsForBooking(tx, shortLived.tenantId, booking.id));

    const [lot] = await withTenant(shortLived.tenantId, (tx) =>
      tx.select().from(schema.pointLot).where(eq(schema.pointLot.customerId, shortLived.customerId)),
    );
    expect(lot!.expiresAt).not.toBeNull();
  });
});
