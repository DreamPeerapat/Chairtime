/**
 * Iron rule #3 is only real if the database enforces it. These tests talk to
 * postgres as the application role and check that a query scoped to shop A
 * cannot see shop B, even when it asks for everything.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { SQLSTATE, createSimpleShop, resetDatabase, sqlStateOf } from '../support/db';

afterAll(async () => {
  await sqlClient.end();
});

describe('row-level security', () => {
  let shopA: Awaited<ReturnType<typeof createSimpleShop>>;
  let shopB: Awaited<ReturnType<typeof createSimpleShop>>;

  beforeAll(async () => {
    await resetDatabase();
    shopA = await createSimpleShop({ slug: 'iso-a' });
    shopB = await createSimpleShop({ slug: 'iso-b' });
  });

  it('hides another shop customers, even from an unfiltered query', async () => {
    const seenByA = await withTenant(shopA.tenantId, (tx) =>
      tx.select({ id: schema.customer.id }).from(schema.customer),
    );
    const seenByB = await withTenant(shopB.tenantId, (tx) =>
      tx.select({ id: schema.customer.id }).from(schema.customer),
    );

    expect(seenByA.map((r) => r.id)).toEqual([shopA.customerId]);
    expect(seenByB.map((r) => r.id)).toEqual([shopB.customerId]);
  });

  it('hides another shop services and resources', async () => {
    const services = await withTenant(shopA.tenantId, (tx) =>
      tx.select({ id: schema.service.id }).from(schema.service),
    );
    expect(services.map((r) => r.id)).toEqual([shopA.serviceId]);

    const resources = await withTenant(shopA.tenantId, (tx) =>
      tx.select({ id: schema.resource.id }).from(schema.resource),
    );
    expect(resources).toHaveLength(shopA.staffIds.length + shopA.chairIds.length);
  });

  it('returns nothing at all when app.tenant_id was never set', async () => {
    const rows = await db.select({ id: schema.customer.id }).from(schema.customer);
    expect(rows).toEqual([]);
  });

  it('refuses to write a row belonging to another tenant', async () => {
    const state = await sqlStateOf(() =>
      withTenant(shopA.tenantId, (tx) =>
        tx.insert(schema.customer).values({
          tenantId: shopB.tenantId, // pretending to be the other shop
          name: 'ลูกค้าปลอม',
          phone: '0999999999',
        }),
      ),
    );
    expect(state).toBe(SQLSTATE.insufficientPrivilege);
  });

  it('rejects a tenant id that is not a uuid before it reaches SQL', async () => {
    await expect(withTenant("' OR 1=1 --", async () => 'nope')).rejects.toThrow(/invalid tenant id/i);
  });
});

describe('point_ledger is append-only', () => {
  let shop: Awaited<ReturnType<typeof createSimpleShop>>;

  beforeAll(async () => {
    await resetDatabase();
    shop = await createSimpleShop({ slug: 'ledger-guard' });
    await withTenant(shop.tenantId, (tx) =>
      tx.insert(schema.pointLedger).values({
        tenantId: shop.tenantId,
        customerId: shop.customerId,
        entryType: 'adjust',
        points: 10,
        balanceAfter: 10,
        sourceType: 'manual',
      }),
    );
  });

  it('refuses an UPDATE', async () => {
    const state = await sqlStateOf(() =>
      withTenant(shop.tenantId, (tx) => tx.execute(sql`UPDATE point_ledger SET points = 999`)),
    );
    expect(state).toBe(SQLSTATE.restrictViolation);
  });

  it('refuses a DELETE', async () => {
    const state = await sqlStateOf(() =>
      withTenant(shop.tenantId, (tx) => tx.execute(sql`DELETE FROM point_ledger`)),
    );
    expect(state).toBe(SQLSTATE.restrictViolation);
  });

  it('still allows an INSERT', async () => {
    await withTenant(shop.tenantId, (tx) =>
      tx.insert(schema.pointLedger).values({
        tenantId: shop.tenantId,
        customerId: shop.customerId,
        entryType: 'adjust',
        points: -5,
        balanceAfter: 5,
        sourceType: 'manual',
      }),
    );

    const rows = await withTenant(shop.tenantId, (tx) =>
      tx.select({ points: schema.pointLedger.points }).from(schema.pointLedger),
    );
    expect(rows).toHaveLength(2);
  });
});

describe('point_ledger idempotency index', () => {
  it('allows one earn row per booking and rejects the second', async () => {
    await resetDatabase();
    const shop = await createSimpleShop({ slug: 'idem-guard' });
    const sourceId = '11111111-2222-4333-8444-555555555555';

    const insertEarn = () =>
      withTenant(shop.tenantId, (tx) =>
        tx.insert(schema.pointLedger).values({
          tenantId: shop.tenantId,
          customerId: shop.customerId,
          entryType: 'earn',
          points: 25,
          balanceAfter: 25,
          sourceType: 'booking',
          sourceId,
        }),
      );

    await insertEarn();
    expect(await sqlStateOf(insertEarn)).toBe(SQLSTATE.uniqueViolation);
  });
});
