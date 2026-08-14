/**
 * docs/logic.md ข้อ 3.4 (expiry) + ข้อ 4 (reconciliation) + docs/prompts.md
 * ข้อ 6: "แต้มหมดอายุแล้วยอดต้องตรงกันทั้ง balance, lot, ledger".
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eq, sql } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { expirePointsForTenant } from '@/lib/loyalty/expire';
import { reconcileTenant } from '@/lib/loyalty/reconcile';
import { enqueuePointsExpiringForTenant } from '@/lib/loyalty/notifications';
import { createSimpleShop, resetDatabase } from '../support/db';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'loyalty-expire-shop' });
});

async function grantLot(points: number, expiresAt: Date | null) {
  const [lot] = await withTenant(shop.tenantId, (tx) =>
    tx
      .insert(schema.pointLot)
      .values({
        tenantId: shop.tenantId,
        customerId: shop.customerId,
        pointsTotal: points,
        pointsRemaining: points,
        expiresAt,
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
  await withTenant(shop.tenantId, (tx) =>
    tx.insert(schema.pointLedger).values({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      entryType: 'earn',
      points,
      balanceAfter: points,
      lotId: lot!.id,
      sourceType: 'manual',
      sourceId: null,
    }),
  );
  return lot!.id;
}

describe('expiry', () => {
  it('zeroes an expired lot and keeps balance, lot, and ledger in agreement', async () => {
    await grantLot(40, new Date(Date.now() - 1000)); // already expired
    await grantLot(20, new Date(Date.now() + 24 * 60 * 60 * 1000)); // not yet

    const result = await withTenant(shop.tenantId, (tx) => expirePointsForTenant(tx, shop.tenantId));
    expect(result).toEqual({ lotsExpired: 1, pointsLost: 40 });

    const [customer] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.customer).where(eq(schema.customer.id, shop.customerId)),
    );
    expect(customer!.pointBalance).toBe(20); // 60 granted - 40 expired

    const mismatches = await withTenant(shop.tenantId, (tx) => reconcileTenant(tx, shop.tenantId));
    expect(mismatches).toEqual([]);
  });

  it('never expires the same lot twice', async () => {
    await grantLot(40, new Date(Date.now() - 1000));

    const first = await withTenant(shop.tenantId, (tx) => expirePointsForTenant(tx, shop.tenantId));
    const second = await withTenant(shop.tenantId, (tx) => expirePointsForTenant(tx, shop.tenantId));

    expect(first.pointsLost).toBe(40);
    expect(second).toEqual({ lotsExpired: 0, pointsLost: 0 });
  });

  it('leaves a lot with no expiry untouched', async () => {
    await grantLot(40, null);
    const result = await withTenant(shop.tenantId, (tx) => expirePointsForTenant(tx, shop.tenantId));
    expect(result).toEqual({ lotsExpired: 0, pointsLost: 0 });
  });
});

describe('reconciliation', () => {
  it('finds nothing wrong in the ordinary case', async () => {
    await grantLot(30, null);
    const mismatches = await withTenant(shop.tenantId, (tx) => reconcileTenant(tx, shop.tenantId));
    expect(mismatches).toEqual([]);
  });

  it('catches a customer.point_balance that has drifted from the lots', async () => {
    await grantLot(30, null);
    // Simulate the exact corruption iron rule #2 forbids: something wrote to
    // point_balance directly instead of going through earn/redeem/expire.
    await withTenant(shop.tenantId, (tx) =>
      tx.update(schema.customer).set({ pointBalance: 999 }).where(eq(schema.customer.id, shop.customerId)),
    );

    const mismatches = await withTenant(shop.tenantId, (tx) => reconcileTenant(tx, shop.tenantId));
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ customerId: shop.customerId, balance: 999, lotSum: 30, ledgerSum: 30 });
  });
});

describe('points_expiring notification', () => {
  it('queues one notice for a lot expiring within 30 days, and only once', async () => {
    await grantLot(20, DateTime.now().plus({ days: 10 }).toJSDate());
    await grantLot(20, DateTime.now().plus({ days: 90 }).toJSDate()); // outside the window
    await grantLot(20, null); // never expires

    const first = await withTenant(shop.tenantId, (tx) => enqueuePointsExpiringForTenant(tx, shop.tenantId));
    expect(first).toBe(1);

    const second = await withTenant(shop.tenantId, (tx) => enqueuePointsExpiringForTenant(tx, shop.tenantId));
    expect(second).toBe(1); // still "queues" a row, but the dedupe key stops a duplicate

    const rows = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.notificationQueue).where(eq(schema.notificationQueue.template, 'points_expiring')),
    );
    expect(rows).toHaveLength(1);
  });
});
