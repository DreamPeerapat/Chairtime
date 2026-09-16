/**
 * Renewing, and what it does to the period.
 *
 * The two cases that decide whether a shop trusts the page: paying early must
 * not throw away the days already bought, and paying late must not backdate
 * into a gap nobody could use. Both are arithmetic that is easy to get subtly
 * wrong and impossible to notice until a shop complains a month later.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/lib/db/client';
import { BillingError, listPayments, recordPayment } from '@/lib/billing/renew';
import { loadBillingState } from '@/lib/billing/access';
import { suspendExpiredTrials } from '@/lib/onboarding/trial-expiry';
import { createBooking } from '@/lib/booking';
import { getAvailability } from '@/lib/availability';
import { createSimpleShop, resetDatabase } from '../support/db';

const ZONE = 'Asia/Bangkok';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'billing-shop', staffCount: 1, chairCount: 1 });
});

async function setPeriod(fields: {
  status?: string;
  trialEndsAt?: Date | null;
  paidUntil?: Date | null;
}) {
  await db.update(schema.tenant).set(fields).where(eq(schema.tenant.id, shop.tenantId));
}

async function tenantRow() {
  const [row] = await db
    .select({
      status: schema.tenant.status,
      paidUntil: schema.tenant.paidUntil,
      trialEndsAt: schema.tenant.trialEndsAt,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, shop.tenantId));
  return row!;
}

describe('recordPayment', () => {
  it('adds to the days already bought when renewing early', async () => {
    const now = DateTime.now().setZone(ZONE);
    const endsIn10Days = now.plus({ days: 10 });
    await setPeriod({ paidUntil: endsIn10Days.toJSDate() });

    const { periodEnd } = await recordPayment({
      tenantId: shop.tenantId,
      amount: '900.00',
      paidAt: now,
      months: 1,
      now,
    });

    // One month on top of the ten days, not one month from today.
    expect(periodEnd.toISODate()).toBe(endsIn10Days.plus({ months: 1 }).toISODate());
  });

  it('starts from today when the period already lapsed', async () => {
    const now = DateTime.now().setZone(ZONE);
    await setPeriod({ status: 'suspended', paidUntil: now.minus({ days: 20 }).toJSDate() });

    const { periodStart, periodEnd } = await recordPayment({
      tenantId: shop.tenantId,
      amount: '900.00',
      paidAt: now,
      months: 1,
      now,
    });

    // Not backdated into the twenty days the shop could not use.
    expect(periodStart.toISODate()).toBe(now.toISODate());
    expect(periodEnd.toISODate()).toBe(now.plus({ months: 1 }).toISODate());
  });

  it('brings a suspended shop back the moment it is recorded', async () => {
    const now = DateTime.now().setZone(ZONE);
    await setPeriod({ status: 'suspended', trialEndsAt: now.minus({ days: 3 }).toJSDate() });

    await recordPayment({ tenantId: shop.tenantId, amount: '900', paidAt: now, months: 1, now });

    expect((await tenantRow()).status).toBe('active');

    // And the thing the shop is actually paying for works again.
    const date = now.plus({ days: 3 }).toISODate()!;
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
    expect(booking.code).toBeTruthy();
  });

  it('files the claim as pending review rather than as settled', async () => {
    const now = DateTime.now().setZone(ZONE);
    await recordPayment({ tenantId: shop.tenantId, amount: '1200.50', paidAt: now, months: 2, now });

    const [payment] = await listPayments(shop.tenantId);
    expect(payment!.status).toBe('pending_review');
    expect(payment!.amount).toBe('1200.50'); // numeric(10,2), not a float
  });

  it('refuses a transfer dated in the future or a nonsense term', async () => {
    const now = DateTime.now().setZone(ZONE);
    await expect(
      recordPayment({
        tenantId: shop.tenantId,
        amount: '900',
        paidAt: now.plus({ days: 5 }),
        months: 1,
        now,
      }),
    ).rejects.toBeInstanceOf(BillingError);

    await expect(
      recordPayment({ tenantId: shop.tenantId, amount: '900', paidAt: now, months: 99, now }),
    ).rejects.toBeInstanceOf(BillingError);
  });

  it('keeps one shop from reading another\'s receipts', async () => {
    const other = await createSimpleShop({ slug: 'billing-other', staffCount: 1, chairCount: 1 });
    const now = DateTime.now().setZone(ZONE);
    await recordPayment({ tenantId: other.tenantId, amount: '900', paidAt: now, months: 1, now });

    expect(await listPayments(shop.tenantId)).toHaveLength(0);
    expect(await listPayments(other.tenantId)).toHaveLength(1);
  });
});

describe('the nightly expiry sweep', () => {
  it('suspends a shop whose trial ran out', async () => {
    await setPeriod({ trialEndsAt: DateTime.now().minus({ days: 1 }).toJSDate() });
    await suspendExpiredTrials();
    expect((await tenantRow()).status).toBe('suspended');
  });

  it('leaves a paid shop alone even though its trial date has passed', async () => {
    // The bug this guards: comparing only trial_ends_at would suspend a
    // paying shop on the night its free month would have ended.
    await setPeriod({
      trialEndsAt: DateTime.now().minus({ days: 1 }).toJSDate(),
      paidUntil: DateTime.now().plus({ months: 1 }).toJSDate(),
    });
    await suspendExpiredTrials();
    expect((await tenantRow()).status).toBe('active');
  });

  it('leaves a shop with no end date alone', async () => {
    await setPeriod({ trialEndsAt: null, paidUntil: null });
    await suspendExpiredTrials();
    expect((await tenantRow()).status).toBe('active');
  });
});

describe('loadBillingState', () => {
  it('counts the days from the paid date once there is one', async () => {
    const paidUntil = DateTime.now().setZone(ZONE).plus({ days: 5 }).endOf('day');
    await setPeriod({
      trialEndsAt: DateTime.now().minus({ days: 30 }).toJSDate(),
      paidUntil: paidUntil.toJSDate(),
    });

    const state = await loadBillingState(shop.tenantId);
    expect(state!.onTrial).toBe(false);
    expect(state!.daysLeft).toBe(5);
    expect(state!.expiringSoon).toBe(true);
  });

  it('does not nag a shop with a month still to run', async () => {
    await setPeriod({ paidUntil: DateTime.now().plus({ days: 30 }).toJSDate() });
    const state = await loadBillingState(shop.tenantId);
    expect(state!.expiringSoon).toBe(false);
  });
});
