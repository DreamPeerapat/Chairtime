/**
 * Letting an operator work inside a shop's own dashboard.
 *
 * The alternative was rebuilding every management screen a second time, for
 * an audience of one, and watching the copy drift from the real one. Instead
 * the operator's session is re-pointed at the shop: every screen they already
 * maintain works, on that shop's data, through the same RLS as the shop's own
 * staff.
 *
 * Two things make it safe to keep. The session is marked `impersonating`,
 * which the package page refuses and the dashboard announces in a banner, so
 * nobody is ever unsure whose shop is on screen. And leaving is one click,
 * which re-mints the operator's own session from their real membership rather
 * than trusting anything in the old cookie.
 */
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, createSessionToken } from '@/lib/auth/session';
import { listStaffTenants } from '@/lib/auth/identity';
import { isPlatformAdmin } from './platform';

export class ImpersonationError extends Error {}

/** Put the operator inside `tenantId`'s dashboard. */
export async function enterShop(staffUserId: string, tenantId: string): Promise<string> {
  if (!isPlatformAdmin(staffUserId)) {
    throw new ImpersonationError('ไม่มีสิทธิ์เข้าดูร้านอื่น');
  }

  const [tenant] = await db
    .select({
      id: schema.tenant.id,
      slug: schema.tenant.slug,
      onboardedAt: schema.tenant.onboardedAt,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId));

  if (!tenant) throw new ImpersonationError('ไม่พบร้านนี้');

  const [staff] = await db
    .select({ displayName: schema.staffUser.displayName })
    .from(schema.staffUser)
    .where(eq(schema.staffUser.id, staffUserId));

  const token = createSessionToken({
    staffUserId,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    displayName: staff?.displayName ?? null,
    // 'owner' because the screens gate on role and an operator sent in to fix
    // something must not hit a permission wall halfway. The narrowing is done
    // by `impersonating`, not by pretending they are less than they are.
    role: 'owner',
    resourceId: null,
    // A shop that never finished onboarding is exactly the one an operator
    // needs to look at, and the proxy would bounce them to the wizard. Marked
    // onboarded so they land on the dashboard; nothing is written either way.
    onboarded: true,
    impersonating: true,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return tenant.slug;
}

/**
 * Back to the operator's own shop, or to the admin list if they have none.
 *
 * Re-read from `staff_tenant` rather than restored from anything the old
 * cookie carried — the way out must not depend on state the impersonated
 * session could have influenced.
 */
export async function leaveShop(staffUserId: string): Promise<'own' | 'none'> {
  const memberships = await listStaffTenants(staffUserId);
  const store = await cookies();

  const own = memberships[0];
  if (!own) {
    store.delete(SESSION_COOKIE);
    return 'none';
  }

  const [staff] = await db
    .select({ displayName: schema.staffUser.displayName })
    .from(schema.staffUser)
    .where(eq(schema.staffUser.id, staffUserId));

  store.set(
    SESSION_COOKIE,
    createSessionToken({
      staffUserId,
      tenantId: own.tenantId,
      tenantSlug: own.tenantSlug,
      displayName: staff?.displayName ?? null,
      role: own.role,
      resourceId: own.resourceId,
      onboarded: own.tenantOnboardedAt !== null,
    }),
    SESSION_COOKIE_OPTIONS,
  );
  return 'own';
}
