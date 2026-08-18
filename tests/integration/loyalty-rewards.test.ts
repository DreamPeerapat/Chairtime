/**
 * docs/roadmap.md Phase 6: a customer spends points on a catalog reward and
 * gets a code back; a staff member types the code in to mark it used.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eq, sql } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { expireRewardCodesForTenant, listRewardsForCustomer, redeemReward, useRewardCode } from '@/lib/loyalty/rewards';
import {
  InsufficientPointsError,
  RewardCodeAlreadyUsedError,
  RewardCodeExpiredError,
  RewardCodeNotFoundError,
  RewardNotEligibleError,
  RewardOutOfStockError,
} from '@/lib/loyalty/errors';
import { createSimpleShop, resetDatabase } from '../support/db';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'rewards-shop' });
});

async function grantPoints(points: number) {
  await withTenant(shop.tenantId, (tx) =>
    tx.insert(schema.pointLot).values({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      pointsTotal: points,
      pointsRemaining: points,
      expiresAt: null,
      sourceType: 'manual',
    }),
  );
  await withTenant(shop.tenantId, (tx) =>
    tx
      .update(schema.customer)
      .set({ pointBalance: sql`${schema.customer.pointBalance} + ${points}` })
      .where(eq(schema.customer.id, shop.customerId)),
  );
}

async function createReward(overrides: Partial<typeof schema.reward.$inferInsert> = {}) {
  const [row] = await withTenant(shop.tenantId, (tx) =>
    tx
      .insert(schema.reward)
      .values({
        tenantId: shop.tenantId,
        name: 'ส่วนลด 50 บาท',
        rewardType: 'discount_amount',
        pointCost: 100,
        valueAmount: '50.00',
        ...overrides,
      })
      .returning({ id: schema.reward.id }),
  );
  return row!.id;
}

describe('listRewardsForCustomer', () => {
  it('hides rewards the customer has not reached the tier for', async () => {
    const rewardId = await createReward({ minTierLevel: 2 });
    const list = await withTenant(shop.tenantId, (tx) =>
      listRewardsForCustomer(tx, shop.tenantId, shop.customerId),
    );
    expect(list.find((r) => r.id === rewardId)).toBeUndefined();
  });

  it('hides rewards outside their active date window', async () => {
    const today = DateTime.now();
    const notYet = await createReward({ validFrom: today.plus({ days: 5 }).toISODate() });
    const expired = await createReward({ validUntil: today.minus({ days: 1 }).toISODate() });
    const list = await withTenant(shop.tenantId, (tx) =>
      listRewardsForCustomer(tx, shop.tenantId, shop.customerId, today),
    );
    expect(list.find((r) => r.id === notYet)).toBeUndefined();
    expect(list.find((r) => r.id === expired)).toBeUndefined();
  });

  it('hides out-of-stock rewards but shows unlimited ones', async () => {
    const outOfStock = await createReward({ stock: 1, stockUsed: 1 });
    const unlimited = await createReward({ stock: null });
    const inStock = await createReward({ stock: 5, stockUsed: 4 });
    const list = await withTenant(shop.tenantId, (tx) =>
      listRewardsForCustomer(tx, shop.tenantId, shop.customerId),
    );
    const ids = list.map((r) => r.id);
    expect(ids).not.toContain(outOfStock);
    expect(ids).toContain(unlimited);
    expect(ids).toContain(inStock);
  });
});

describe('redeemReward', () => {
  it('deducts points and issues a usable code', async () => {
    await grantPoints(150);
    const rewardId = await createReward({ pointCost: 100 });

    const result = await withTenant(shop.tenantId, (tx) =>
      redeemReward(tx, { tenantId: shop.tenantId, customerId: shop.customerId, rewardId }),
    );
    expect(result.code).toHaveLength(6);

    const [customer] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.customer).where(eq(schema.customer.id, shop.customerId)),
    );
    expect(customer!.pointBalance).toBe(50);

    const [redemption] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.rewardRedemption).where(eq(schema.rewardRedemption.code, result.code)),
    );
    expect(redemption?.status).toBe('issued');
  });

  it('refuses when the customer does not have enough points', async () => {
    await grantPoints(50);
    const rewardId = await createReward({ pointCost: 100 });
    await expect(
      withTenant(shop.tenantId, (tx) =>
        redeemReward(tx, { tenantId: shop.tenantId, customerId: shop.customerId, rewardId }),
      ),
    ).rejects.toBeInstanceOf(InsufficientPointsError);
  });

  it('refuses a reward the tier does not qualify for', async () => {
    await grantPoints(500);
    const rewardId = await createReward({ pointCost: 100, minTierLevel: 3 });
    await expect(
      withTenant(shop.tenantId, (tx) =>
        redeemReward(tx, { tenantId: shop.tenantId, customerId: shop.customerId, rewardId }),
      ),
    ).rejects.toBeInstanceOf(RewardNotEligibleError);
  });

  it('refuses once stock runs out', async () => {
    await grantPoints(500);
    const rewardId = await createReward({ pointCost: 100, stock: 1, stockUsed: 1 });
    await expect(
      withTenant(shop.tenantId, (tx) =>
        redeemReward(tx, { tenantId: shop.tenantId, customerId: shop.customerId, rewardId }),
      ),
    ).rejects.toBeInstanceOf(RewardOutOfStockError);
  });

  it('refuses a reward past its valid_until date', async () => {
    await grantPoints(500);
    const rewardId = await createReward({
      pointCost: 100,
      validUntil: DateTime.now().minus({ days: 1 }).toISODate(),
    });
    await expect(
      withTenant(shop.tenantId, (tx) =>
        redeemReward(tx, { tenantId: shop.tenantId, customerId: shop.customerId, rewardId }),
      ),
    ).rejects.toBeInstanceOf(RewardNotEligibleError);
  });
});

describe('useRewardCode', () => {
  async function issueCode(pointCost = 100) {
    await grantPoints(pointCost);
    const rewardId = await createReward({ pointCost });
    return withTenant(shop.tenantId, (tx) =>
      redeemReward(tx, { tenantId: shop.tenantId, customerId: shop.customerId, rewardId }),
    );
  }

  it('marks an issued code used and returns the reward and customer names', async () => {
    const { code } = await issueCode();
    const result = await withTenant(shop.tenantId, (tx) => useRewardCode(tx, { tenantId: shop.tenantId, code }));
    expect(result.rewardName).toBe('ส่วนลด 50 บาท');
    expect(result.customerName).toBe('ลูกค้าทดสอบ');

    const [redemption] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.rewardRedemption).where(eq(schema.rewardRedemption.code, code)),
    );
    expect(redemption?.status).toBe('used');
    expect(redemption?.usedAt).not.toBeNull();
  });

  it('accepts the code case-insensitively and trims whitespace', async () => {
    const { code } = await issueCode();
    const result = await withTenant(shop.tenantId, (tx) =>
      useRewardCode(tx, { tenantId: shop.tenantId, code: ` ${code.toLowerCase()} ` }),
    );
    expect(result.rewardName).toBe('ส่วนลด 50 บาท');
  });

  it('refuses an unknown code', async () => {
    await expect(
      withTenant(shop.tenantId, (tx) => useRewardCode(tx, { tenantId: shop.tenantId, code: 'NOPE12' })),
    ).rejects.toBeInstanceOf(RewardCodeNotFoundError);
  });

  it('refuses a code that has already been used', async () => {
    const { code } = await issueCode();
    await withTenant(shop.tenantId, (tx) => useRewardCode(tx, { tenantId: shop.tenantId, code }));
    await expect(
      withTenant(shop.tenantId, (tx) => useRewardCode(tx, { tenantId: shop.tenantId, code })),
    ).rejects.toBeInstanceOf(RewardCodeAlreadyUsedError);
  });

  it('refuses a code past its expiry, without touching other data in that transaction', async () => {
    const { code } = await issueCode();
    await withTenant(shop.tenantId, (tx) =>
      tx
        .update(schema.rewardRedemption)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.rewardRedemption.code, code)),
    );
    await expect(
      withTenant(shop.tenantId, (tx) => useRewardCode(tx, { tenantId: shop.tenantId, code })),
    ).rejects.toBeInstanceOf(RewardCodeExpiredError);

    // useRewardCode() throws from inside the caller's transaction, so it
    // deliberately does not try to persist status:'expired' itself — that
    // write would just get rolled back along with the throw. The status is
    // still 'issued' until the daily sweep runs.
    const [beforeSweep] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.rewardRedemption).where(eq(schema.rewardRedemption.code, code)),
    );
    expect(beforeSweep?.status).toBe('issued');
  });

  it('the daily sweep flips overdue issued codes to expired', async () => {
    const { code } = await issueCode();
    await withTenant(shop.tenantId, (tx) =>
      tx
        .update(schema.rewardRedemption)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.rewardRedemption.code, code)),
    );

    const result = await withTenant(shop.tenantId, (tx) => expireRewardCodesForTenant(tx, shop.tenantId));
    expect(result.expired).toBe(1);

    const [redemption] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.rewardRedemption).where(eq(schema.rewardRedemption.code, code)),
    );
    expect(redemption?.status).toBe('expired');
  });
});
