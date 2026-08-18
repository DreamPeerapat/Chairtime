/**
 * docs/roadmap.md Phase 6 "โบนัสวันเกิด" — once per calendar year per
 * customer, never for anyone else, never twice on the same run.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { awardBirthdayBonusesForTenant } from '@/lib/loyalty/birthday';
import { createSimpleShop, resetDatabase } from '../support/db';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'birthday-shop' });
  await withTenant(shop.tenantId, (tx) =>
    tx.update(schema.pointRule).set({ birthdayBonus: 100 }).where(eq(schema.pointRule.tenantId, shop.tenantId)),
  );
});

async function setBirthday(dateStr: string) {
  await withTenant(shop.tenantId, (tx) =>
    tx.update(schema.customer).set({ birthDate: dateStr }).where(eq(schema.customer.id, shop.customerId)),
  );
}

async function balance() {
  const [row] = await withTenant(shop.tenantId, (tx) =>
    tx.select().from(schema.customer).where(eq(schema.customer.id, shop.customerId)),
  );
  return row!.pointBalance;
}

describe('birthday bonus', () => {
  it('awards the bonus on the customer’s birthday', async () => {
    const today = DateTime.now();
    await setBirthday(`1990-${today.toFormat('MM-dd')}`);

    const result = await withTenant(shop.tenantId, (tx) => awardBirthdayBonusesForTenant(tx, shop.tenantId, today));
    expect(result.awarded).toBe(1);
    expect(await balance()).toBe(100);

    const [notification] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.notificationQueue).where(eq(schema.notificationQueue.template, 'birthday')),
    );
    expect(notification?.payload).toMatchObject({ points: 100 });
  });

  it('does not award on any other day', async () => {
    const today = DateTime.now();
    const notToday = today.plus({ days: 5 });
    await setBirthday(`1990-${notToday.toFormat('MM-dd')}`);

    const result = await withTenant(shop.tenantId, (tx) => awardBirthdayBonusesForTenant(tx, shop.tenantId, today));
    expect(result.awarded).toBe(0);
    expect(await balance()).toBe(0);
  });

  it('does not award twice if the cron runs twice on the same day', async () => {
    const today = DateTime.now();
    await setBirthday(`1990-${today.toFormat('MM-dd')}`);

    await withTenant(shop.tenantId, (tx) => awardBirthdayBonusesForTenant(tx, shop.tenantId, today));
    const second = await withTenant(shop.tenantId, (tx) => awardBirthdayBonusesForTenant(tx, shop.tenantId, today));

    expect(second.awarded).toBe(0);
    expect(await balance()).toBe(100);
  });

  it('awards again the following year', async () => {
    const thisYear = DateTime.now();
    await setBirthday(`1990-${thisYear.toFormat('MM-dd')}`);
    await withTenant(shop.tenantId, (tx) => awardBirthdayBonusesForTenant(tx, shop.tenantId, thisYear));

    const nextYear = thisYear.plus({ years: 1 });
    const result = await withTenant(shop.tenantId, (tx) => awardBirthdayBonusesForTenant(tx, shop.tenantId, nextYear));

    expect(result.awarded).toBe(1);
    expect(await balance()).toBe(200);
  });

  it('does nothing when the rule has no birthday bonus configured', async () => {
    await withTenant(shop.tenantId, (tx) =>
      tx.update(schema.pointRule).set({ birthdayBonus: 0 }).where(eq(schema.pointRule.tenantId, shop.tenantId)),
    );
    const today = DateTime.now();
    await setBirthday(`1990-${today.toFormat('MM-dd')}`);

    const result = await withTenant(shop.tenantId, (tx) => awardBirthdayBonusesForTenant(tx, shop.tenantId, today));
    expect(result.awarded).toBe(0);
  });
});
