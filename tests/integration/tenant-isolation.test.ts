/**
 * Iron rule #3 is only real if the database enforces it. These tests talk to
 * postgres as the application role and check that a query scoped to shop A
 * cannot see shop B, even when it asks for everything.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { findOrCreateStaffUser, listStaffTenants, readSessionToken, routeAfterLogin } from '@/lib/auth';
import type { OAuthProfile } from '@/lib/auth/oauth';
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

describe('self-serve signup (OAuth identity)', () => {
  const lineProfile = (uid: string): OAuthProfile => ({
    provider: 'line',
    providerUid: uid,
    email: 'owner@example.test',
    displayName: 'เจ้าของร้าน',
    avatarUrl: null,
  });

  it('provisions a brand-new staff_user for a first-time LINE login', async () => {
    await resetDatabase();
    const { staffUserId, isNew } = await findOrCreateStaffUser(lineProfile('U_new_owner'));
    expect(isNew).toBe(true);
    expect(staffUserId).toBeTruthy();
  });

  it('routes a person with no shop yet to onboarding', async () => {
    const { staffUserId } = await findOrCreateStaffUser(lineProfile('U_no_shop'));
    const route = await routeAfterLogin(staffUserId);
    expect(route.kind).toBe('onboarding');
  });

  /**
   * Regression: `staff_tenant` is under FORCE RLS, so listing "which shops is
   * this person in" could not see its own rows before a tenant is chosen. It
   * goes through the `staff_tenant_lookup` SECURITY DEFINER function.
   */
  it('logging in a second time with the same identity reaches the same tenant', async () => {
    const shop = await createSimpleShop({ slug: 'oauth-repeat' });
    const first = await findOrCreateStaffUser(lineProfile('U_repeat_login'));
    await withTenant(shop.tenantId, (tx) =>
      tx.insert(schema.staffTenant).values({ staffId: first.staffUserId, tenantId: shop.tenantId, role: 'owner' }),
    );

    const second = await findOrCreateStaffUser(lineProfile('U_repeat_login'));
    expect(second.staffUserId).toBe(first.staffUserId);
    expect(second.isNew).toBe(false);

    const route = await routeAfterLogin(second.staffUserId);
    expect(route).toMatchObject({ kind: 'dashboard', tenantSlug: 'oauth-repeat' });

    const session = readSessionToken(route.kind === 'dashboard' ? route.token : undefined);
    expect(session?.tenantId).toBe(shop.tenantId);
    expect(session?.role).toBe('owner');
  });

  it('sends someone who owns two shops to /select-store instead of guessing', async () => {
    const shopA = await createSimpleShop({ slug: 'multi-a' });
    const shopB = await createSimpleShop({ slug: 'multi-b' });
    const { staffUserId } = await findOrCreateStaffUser(lineProfile('U_multi_shop'));

    await withTenant(shopA.tenantId, (tx) =>
      tx.insert(schema.staffTenant).values({ staffId: staffUserId, tenantId: shopA.tenantId, role: 'owner' }),
    );
    await withTenant(shopB.tenantId, (tx) =>
      tx.insert(schema.staffTenant).values({ staffId: staffUserId, tenantId: shopB.tenantId, role: 'staff' }),
    );

    const route = await routeAfterLogin(staffUserId);
    expect(route.kind).toBe('select-store');

    const tenants = await listStaffTenants(staffUserId);
    expect(tenants.map((t) => t.tenantSlug).sort()).toEqual(['multi-a', 'multi-b']);
  });

  it('never auto-merges a second provider onto an existing account, even with the same email', async () => {
    const line = await findOrCreateStaffUser(lineProfile('U_same_person_line'));
    const google = await findOrCreateStaffUser({
      provider: 'google',
      providerUid: 'G_same_person',
      // same email as the LINE profile above — must NOT be treated as the same person
      email: 'owner@example.test',
      displayName: 'เจ้าของร้าน',
      avatarUrl: null,
    });

    expect(google.isNew).toBe(true);
    expect(google.staffUserId).not.toBe(line.staffUserId);
  });

  it('still refuses to read staff_tenant outside a tenant scope', async () => {
    const rows = await db.select({ staffId: schema.staffTenant.staffId }).from(schema.staffTenant);
    expect(rows).toEqual([]);
  });
});
