/**
 * docs/logic.md ข้อ 3.5: promotion is immediate, demotion gets a 30-day
 * grace period, and a manually-set tier is never touched by the cron.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { recalculateTiersForTenant } from '@/lib/loyalty/tier';
import { createSimpleShop, resetDatabase } from '../support/db';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;
let silverId: string;
let goldId: string;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'tier-shop' });

  const tiers = await withTenant(shop.tenantId, (tx) =>
    tx
      .insert(schema.membershipTier)
      .values([
        {
          tenantId: shop.tenantId,
          name: 'Silver',
          level: 1,
          qualifySpend: '1000',
          qualifyVisits: 1,
          qualifyWindowMonths: 12,
        },
        {
          tenantId: shop.tenantId,
          name: 'Gold',
          level: 2,
          qualifySpend: '5000',
          qualifyVisits: 3,
          qualifyWindowMonths: 6,
        },
      ])
      .returning({ id: schema.membershipTier.id, name: schema.membershipTier.name }),
  );
  silverId = tiers.find((t) => t.name === 'Silver')!.id;
  goldId = tiers.find((t) => t.name === 'Gold')!.id;
});

async function completedBooking(total: string, completedAt: DateTime) {
  await withTenant(shop.tenantId, (tx) =>
    tx.insert(schema.booking).values({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      code: `T${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: 'completed',
      startsAt: completedAt.toJSDate(),
      endsAt: completedAt.toJSDate(),
      total,
      completedAt: completedAt.toJSDate(),
    }),
  );
}

async function currentTier(customerId: string) {
  const [row] = await withTenant(shop.tenantId, (tx) =>
    tx.select().from(schema.customerTier).where(eq(schema.customerTier.customerId, customerId)),
  );
  return row ?? null;
}

describe('promotion', () => {
  it('promotes immediately once spend and visits both clear a tier', async () => {
    const now = DateTime.now();
    await completedBooking('600', now.minus({ days: 1 }));
    await completedBooking('600', now.minus({ days: 2 }));

    const result = await withTenant(shop.tenantId, (tx) => recalculateTiersForTenant(tx, shop.tenantId, now));
    expect(result.promoted).toBe(1);

    const tier = await currentTier(shop.customerId);
    expect(tier?.tierId).toBe(silverId);
    expect(tier?.validUntil).toBeNull();

    const [notification] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.notificationQueue).where(eq(schema.notificationQueue.template, 'tier_up')),
    );
    expect(notification?.payload).toMatchObject({ tierName: 'Silver' });
  });

  it('does not promote on spend alone without enough visits', async () => {
    // Silver requires 1000 spend AND at least 2 visits.
    await withTenant(shop.tenantId, (tx) =>
      tx.update(schema.membershipTier).set({ qualifyVisits: 2 }).where(eq(schema.membershipTier.id, silverId)),
    );

    const now = DateTime.now();
    await completedBooking('1500', now.minus({ days: 1 })); // spend clears 1000, but this is only one visit

    const result = await withTenant(shop.tenantId, (tx) => recalculateTiersForTenant(tx, shop.tenantId, now));
    expect(result.promoted).toBe(0);
    expect(await currentTier(shop.customerId)).toBeNull();
  });

  it('jumps straight to the highest tier a customer already qualifies for', async () => {
    const now = DateTime.now();
    for (let i = 0; i < 3; i += 1) await completedBooking('2000', now.minus({ days: i + 1 }));

    const result = await withTenant(shop.tenantId, (tx) => recalculateTiersForTenant(tx, shop.tenantId, now));
    expect(result.promoted).toBe(1);
    expect((await currentTier(shop.customerId))?.tierId).toBe(goldId);
  });

  it('respects each tier’s own qualify_window_months', async () => {
    const now = DateTime.now();
    // Gold needs a 6-month window; these visits are 8 months old, so they
    // count for Silver's 12-month window but not Gold's.
    for (let i = 0; i < 3; i += 1) {
      await completedBooking('2000', now.minus({ months: 8, days: i }));
    }

    const result = await withTenant(shop.tenantId, (tx) => recalculateTiersForTenant(tx, shop.tenantId, now));
    expect(result.promoted).toBe(1);
    expect((await currentTier(shop.customerId))?.tierId).toBe(silverId);
  });
});

describe('demotion grace period', () => {
  async function promoteToGold(now: DateTime) {
    for (let i = 0; i < 3; i += 1) await completedBooking('2000', now.minus({ days: i + 1 }));
    await withTenant(shop.tenantId, (tx) => recalculateTiersForTenant(tx, shop.tenantId, now));
  }

  it('warns and starts a 30-day grace period on the first slip, without demoting yet', async () => {
    const now = DateTime.now();
    await promoteToGold(now);

    // No new spend — a week later Gold's 6-month window still shows the old
    // spend, so use a date far enough out that the window genuinely empties.
    const laterButStillGold = now.plus({ months: 7 });
    const result = await withTenant(shop.tenantId, (tx) =>
      recalculateTiersForTenant(tx, shop.tenantId, laterButStillGold),
    );
    expect(result.demotionWarned).toBe(1);

    const tier = await currentTier(shop.customerId);
    expect(tier?.tierId).toBe(goldId); // not demoted yet
    expect(tier?.validUntil).toBe(laterButStillGold.plus({ days: 30 }).toISODate());

    const [notification] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.notificationQueue).where(eq(schema.notificationQueue.template, 'tier_at_risk')),
    );
    expect(notification?.payload).toMatchObject({ tierName: 'Gold' });
  });

  it('actually demotes once the grace deadline passes with no requalification', async () => {
    const now = DateTime.now();
    await promoteToGold(now);

    const warnDay = now.plus({ months: 7 });
    await withTenant(shop.tenantId, (tx) => recalculateTiersForTenant(tx, shop.tenantId, warnDay));

    const pastDeadline = warnDay.plus({ days: 31 });
    const result = await withTenant(shop.tenantId, (tx) => recalculateTiersForTenant(tx, shop.tenantId, pastDeadline));
    expect(result.demoted).toBe(1);

    // Silver's 12-month window still sees the old spend, so they land there
    // rather than losing tier status altogether.
    const tier = await currentTier(shop.customerId);
    expect(tier?.tierId).toBe(silverId);
    expect(tier?.validUntil).toBeNull();
  });

  it('clears the grace period if the customer requalifies before the deadline', async () => {
    const now = DateTime.now();
    await promoteToGold(now);

    const warnDay = now.plus({ months: 7 });
    await withTenant(shop.tenantId, (tx) => recalculateTiersForTenant(tx, shop.tenantId, warnDay));
    expect((await currentTier(shop.customerId))?.validUntil).not.toBeNull();

    // Spends again, back above Gold's threshold.
    for (let i = 0; i < 3; i += 1) await completedBooking('2000', warnDay.minus({ days: i + 1 }));

    const result = await withTenant(shop.tenantId, (tx) => recalculateTiersForTenant(tx, shop.tenantId, warnDay));
    expect(result.requalified).toBe(1);
    const tier = await currentTier(shop.customerId);
    expect(tier?.tierId).toBe(goldId);
    expect(tier?.validUntil).toBeNull();
  });

  it('never touches a manually-assigned tier', async () => {
    await withTenant(shop.tenantId, (tx) =>
      tx.insert(schema.customerTier).values({
        customerId: shop.customerId,
        tierId: goldId,
        isManual: true,
      }),
    );

    const result = await withTenant(shop.tenantId, (tx) =>
      recalculateTiersForTenant(tx, shop.tenantId, DateTime.now()),
    );
    expect(result).toEqual({ promoted: 0, demotionWarned: 0, demoted: 0, requalified: 0 });
    expect((await currentTier(shop.customerId))?.tierId).toBe(goldId);
  });
});
