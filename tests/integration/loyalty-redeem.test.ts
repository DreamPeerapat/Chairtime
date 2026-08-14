/**
 * docs/logic.md ข้อ 3.2 + docs/prompts.md ข้อ 6: FIFO by expiry, and two
 * screens redeeming for the same customer at once must leave exactly one
 * winner rather than a negative balance.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { redeemPoints } from '@/lib/loyalty/redeem';
import {
  BelowMinimumRedeemError,
  ExceedsMaxRedeemPercentError,
  InsufficientPointsError,
} from '@/lib/loyalty/errors';
import { createSimpleShop, resetDatabase } from '../support/db';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({
    slug: 'loyalty-redeem-shop',
    pointRule: { pointValueBaht: 1, minRedeemPoints: 10, maxRedeemPercent: 90 },
  });
});

async function grantLot(points: number, expiresAt: Date | null, earnedOffsetMs = 0) {
  const [lot] = await withTenant(shop.tenantId, (tx) =>
    tx
      .insert(schema.pointLot)
      .values({
        tenantId: shop.tenantId,
        customerId: shop.customerId,
        pointsTotal: points,
        pointsRemaining: points,
        expiresAt,
        earnedAt: new Date(Date.now() - earnedOffsetMs),
        sourceType: 'manual',
      })
      .returning({ id: schema.pointLot.id }),
  );
  await withTenant(shop.tenantId, (tx) =>
    tx
      .update(schema.customer)
      .set({ pointBalance: sql`${schema.customer.pointBalance} + ${points}` })
      .where(eq(schema.customer.id, shop.customerId)),
  );
  return lot!.id;
}

describe('FIFO redemption', () => {
  it('takes from the soonest-expiring lot first, across three lots', async () => {
    const day = 24 * 60 * 60 * 1000;
    const lotSoon = await grantLot(30, new Date(Date.now() + 1 * day));
    const lotMid = await grantLot(30, new Date(Date.now() + 5 * day));
    const lotLate = await grantLot(30, new Date(Date.now() + 10 * day));

    const result = await withTenant(shop.tenantId, (tx) =>
      redeemPoints(tx, {
        tenantId: shop.tenantId,
        customerId: shop.customerId,
        pointsWanted: 40,
        billTotalSatang: 100_000,
        sourceType: 'manual',
        sourceId: null,
      }),
    );
    expect(result.pointsRedeemed).toBe(40);

    const lots = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.pointLot).where(eq(schema.pointLot.customerId, shop.customerId)),
    );
    const byId = new Map(lots.map((l) => [l.id, l.pointsRemaining]));
    expect(byId.get(lotSoon)).toBe(0); // fully spent first
    expect(byId.get(lotMid)).toBe(20); // topped up the remaining 10
    expect(byId.get(lotLate)).toBe(30); // untouched
  });

  it('never spends a lot that has already expired', async () => {
    await grantLot(50, new Date(Date.now() - 1000)); // already expired
    await grantLot(50, new Date(Date.now() + 24 * 60 * 60 * 1000));

    // The already-expired lot inflated point_balance beyond what the cron
    // would have left it at — the pre-check would otherwise let a spend of
    // the expired 50 through, so redeem only what the live lot actually has.
    const result = await withTenant(shop.tenantId, (tx) =>
      redeemPoints(tx, {
        tenantId: shop.tenantId,
        customerId: shop.customerId,
        pointsWanted: 50,
        billTotalSatang: 100_000,
        sourceType: 'manual',
        sourceId: null,
      }),
    );
    expect(result.pointsRedeemed).toBe(50);

    const lots = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.pointLot).where(eq(schema.pointLot.customerId, shop.customerId)),
    );
    const expired = lots.find((l) => l.expiresAt && l.expiresAt.getTime() < Date.now());
    expect(expired!.pointsRemaining).toBe(50); // untouched
  });
});

describe('validation', () => {
  it('refuses a redemption below the minimum', async () => {
    await grantLot(100, null);
    await expect(
      withTenant(shop.tenantId, (tx) =>
        redeemPoints(tx, {
          tenantId: shop.tenantId,
          customerId: shop.customerId,
          pointsWanted: 5,
          billTotalSatang: 100_000,
          sourceType: 'manual',
          sourceId: null,
        }),
      ),
    ).rejects.toBeInstanceOf(BelowMinimumRedeemError);
  });

  it('refuses a redemption worth more than max_redeem_percent of the bill', async () => {
    await grantLot(1000, null);
    await expect(
      withTenant(shop.tenantId, (tx) =>
        redeemPoints(tx, {
          tenantId: shop.tenantId,
          customerId: shop.customerId,
          pointsWanted: 950, // 950 baht value vs. 1000*90% = 900 max
          billTotalSatang: 100_000,
          sourceType: 'manual',
          sourceId: null,
        }),
      ),
    ).rejects.toBeInstanceOf(ExceedsMaxRedeemPercentError);
  });

  it('refuses to redeem more points than the customer has', async () => {
    await grantLot(20, null);
    await expect(
      withTenant(shop.tenantId, (tx) =>
        redeemPoints(tx, {
          tenantId: shop.tenantId,
          customerId: shop.customerId,
          pointsWanted: 50,
          billTotalSatang: 100_000,
          sourceType: 'manual',
          sourceId: null,
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientPointsError);
  });
});

describe('concurrent redemption', () => {
  it('leaves exactly one winner, never a negative balance', async () => {
    await grantLot(60, null);

    const attempt = () =>
      withTenant(shop.tenantId, (tx) =>
        redeemPoints(tx, {
          tenantId: shop.tenantId,
          customerId: shop.customerId,
          pointsWanted: 50,
          billTotalSatang: 100_000,
          sourceType: 'manual',
          sourceId: null,
        }),
      );

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const [customer] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.customer).where(eq(schema.customer.id, shop.customerId)),
    );
    expect(customer!.pointBalance).toBe(10);
    expect(customer!.pointBalance).toBeGreaterThanOrEqual(0);
  });
});
