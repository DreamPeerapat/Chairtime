/**
 * Asking to be paid, and being paid.
 *
 * The cases that matter are the ones where money and time interact: a QR that
 * outlives its window, and a confirmation that arrives twice. A gateway
 * retrying a webhook, or a shop double-tapping a button on a slow phone, must
 * buy one month rather than two — that is not a nicety, it is the difference
 * between a correct ledger and a refund conversation.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/lib/db/client';
import { confirmIntent, createIntent, expireStale, intentByReference } from '@/lib/billing/intent';
import { listPayments } from '@/lib/billing/renew';
import { createSimpleShop, resetDatabase } from '../support/db';

const ZONE = 'Asia/Bangkok';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;
let planId: string;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'intent-shop', staffCount: 1, chairCount: 1 });

  // Plans are platform data, not a shop's, so resetDatabase leaves them where
  // they are — upsert rather than insert, or the second test in a run fails.
  const [plan] = await db
    .insert(schema.subscriptionPlan)
    .values({ code: 'basic-test', name: 'Basic', priceMonthly: '590.00' })
    .onConflictDoUpdate({
      target: schema.subscriptionPlan.code,
      set: { name: 'Basic', priceMonthly: '590.00' },
    })
    .returning({ id: schema.subscriptionPlan.id });
  planId = plan!.id;
});

async function paidUntil(): Promise<Date | null> {
  const [row] = await db
    .select({ paidUntil: schema.tenant.paidUntil })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, shop.tenantId));
  return row?.paidUntil ?? null;
}

describe('createIntent', () => {
  it('opens a fifteen-minute window with a QR that carries the amount', async () => {
    const now = DateTime.now().setZone(ZONE);
    const intent = await createIntent({
      tenantId: shop.tenantId,
      planId,
      months: 3,
      amount: '1770.00',
      now,
    });

    expect(intent.reference).toMatch(/^CT-[A-Z2-9]{8}$/);
    expect(intent.status).toBe('pending');
    expect(intent.amount).toBe('1770.00');
    // The amount is inside the payload, formatted to two decimals.
    expect(intent.qrPayload).toContain('54071770.00');

    const minutes = DateTime.fromJSDate(intent.expiresAt).diff(now, 'minutes').minutes;
    expect(Math.round(minutes)).toBe(15);
  });

  it('gives every intent its own reference', async () => {
    const first = await createIntent({ tenantId: shop.tenantId, planId, months: 1, amount: '590.00' });
    const second = await createIntent({ tenantId: shop.tenantId, planId, months: 1, amount: '590.00' });
    expect(first.reference).not.toBe(second.reference);
  });
});

describe('confirmIntent', () => {
  it('extends the period once, however many times it is confirmed', async () => {
    const now = DateTime.now().setZone(ZONE);
    const intent = await createIntent({
      tenantId: shop.tenantId,
      planId,
      months: 1,
      amount: '590.00',
      now,
    });

    const first = await confirmIntent(intent, { now });
    expect(first).not.toBeNull();

    const after = await paidUntil();
    expect(after).not.toBeNull();

    // A retried webhook, or a second tap on a slow connection.
    const second = await confirmIntent(intent, { now });
    expect(second).toBeNull();

    expect(await paidUntil()).toEqual(after);
    expect(await listPayments(shop.tenantId)).toHaveLength(1);
  });

  it('records the payment as awaiting review unless a slip was verified', async () => {
    const unverified = await createIntent({
      tenantId: shop.tenantId,
      planId,
      months: 1,
      amount: '590.00',
    });
    await confirmIntent(unverified);
    expect((await listPayments(shop.tenantId))[0]?.status).toBe('pending_review');

    const verified = await createIntent({
      tenantId: shop.tenantId,
      planId,
      months: 1,
      amount: '590.00',
    });
    await confirmIntent(verified, { verified: true });
    expect((await listPayments(shop.tenantId))[0]?.status).toBe('verified');
  });

  it('points the intent at the payment it became', async () => {
    const intent = await createIntent({
      tenantId: shop.tenantId,
      planId,
      months: 2,
      amount: '1180.00',
    });
    const confirmed = await confirmIntent(intent);

    const stored = await intentByReference(shop.tenantId, intent.reference);
    expect(stored?.status).toBe('paid');
    expect(stored?.tenantPaymentId).toBe(confirmed?.tenantPaymentId);
    expect(stored?.paidAt).not.toBeNull();
  });
});

describe('expireStale', () => {
  it('closes the window on anything past its time, and nothing else', async () => {
    const now = DateTime.now().setZone(ZONE);

    const old = await createIntent({
      tenantId: shop.tenantId,
      planId,
      months: 1,
      amount: '590.00',
      now: now.minus({ minutes: 20 }),
    });
    const fresh = await createIntent({
      tenantId: shop.tenantId,
      planId,
      months: 1,
      amount: '590.00',
      now,
    });

    await expireStale(shop.tenantId, now);

    expect((await intentByReference(shop.tenantId, old.reference))?.status).toBe('expired');
    expect((await intentByReference(shop.tenantId, fresh.reference))?.status).toBe('pending');
  });

  it('leaves a paid intent alone even when its window has closed', async () => {
    const now = DateTime.now().setZone(ZONE);
    const intent = await createIntent({
      tenantId: shop.tenantId,
      planId,
      months: 1,
      amount: '590.00',
      now: now.minus({ minutes: 20 }),
    });
    await confirmIntent(intent, { now });

    await expireStale(shop.tenantId, now);

    expect((await intentByReference(shop.tenantId, intent.reference))?.status).toBe('paid');
  });
});
