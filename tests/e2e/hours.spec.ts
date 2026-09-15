/**
 * Opening hours with more than one range a day.
 *
 * This is the regression test for the bug that made the editor dangerous: it
 * read one row per weekday and wrote back only what it had shown, so a shop
 * that closes over lunch lost every afternoon as soon as anyone opened the tab
 * and pressed save. The shop on production keeps two ranges on all seven days,
 * so nothing about this is hypothetical.
 *
 * The check that matters is the round trip - save, reload, and find both
 * ranges still there.
 */
import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { loadEnv } from '../../lib/env.ts';

loadEnv();

import { db, schema } from '../../lib/db/client.ts';
import { withTenant } from '../../lib/db/tenant.ts';
import { mintSessionToken } from '../../lib/auth/identity.ts';
import { SESSION_COOKIE } from '../../lib/auth/session.ts';

// The seeded salon that already closes over lunch.
const SHOP = 'thehair-thonglor';

async function login(page: Page) {
  const [tenant] = await db
    .select({
      id: schema.tenant.id,
      slug: schema.tenant.slug,
      name: schema.tenant.name,
      status: schema.tenant.status,
      onboardedAt: schema.tenant.onboardedAt,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.slug, SHOP));
  if (!tenant) throw new Error(`no seeded shop with slug ${SHOP}`);

  const [membership] = await withTenant(tenant.id, (tx) =>
    tx
      .select({
        staffId: schema.staffTenant.staffId,
        role: schema.staffTenant.role,
        resourceId: schema.staffTenant.resourceId,
      })
      .from(schema.staffTenant)
      .where(eq(schema.staffTenant.tenantId, tenant.id)),
  );
  if (!membership) throw new Error(`no seeded staff for ${SHOP}`);

  const token = await mintSessionToken(membership.staffId, {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    tenantStatus: tenant.status,
    tenantOnboardedAt: tenant.onboardedAt,
    role: 'owner',
    resourceId: membership.resourceId,
    isActive: true,
  });

  await page.goto('/login');
  await page.context().addCookies([{ name: SESSION_COOKIE, value: token, url: page.url() }]);
  await page.goto('/dashboard/resources');
  await page.getByRole('button', { name: 'เวลาทำการ' }).click();
}

test.describe('opening hours', () => {
  test('shows every range a day already has, and keeps them after saving', async ({ page }) => {
    await login(page);

    // Tuesday to Friday carry a lunch break in the seed, so the editor must
    // arrive showing two ranges. The old one showed the morning and dropped
    // the afternoon on save.
    const openDay = page.getByRole('listitem').filter({ hasText: 'อังคาร' });
    await expect(openDay.locator('input[type="time"]')).toHaveCount(4, { timeout: 15_000 });

    // Save without touching anything: the afternoon has to survive a round trip.
    await page.getByRole('button', { name: 'บันทึกเวลาทำการ' }).click();
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.getByRole('button', { name: 'เวลาทำการ' }).click();

    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: 'อังคาร' })
        .locator('input[type="time"]'),
    ).toHaveCount(4, { timeout: 15_000 });
  });

  test('refuses two ranges that overlap', async ({ page }) => {
    await login(page);

    const openDay = page.getByRole('listitem').filter({ hasText: 'อังคาร' });
    const times = openDay.locator('input[type="time"]');
    await expect(times).toHaveCount(4, { timeout: 15_000 });

    // Drag the afternoon back so it starts before the morning ends. Nothing in
    // the database stops this - the CHECK constraint only sees one row.
    await times.nth(0).fill('10:00');
    await times.nth(1).fill('15:00');
    await times.nth(2).fill('14:00');
    await times.nth(3).fill('20:00');

    await page.getByRole('button', { name: 'บันทึกเวลาทำการ' }).click();
    await expect(page.getByText(/ทับกัน/)).toBeVisible();
  });
});
