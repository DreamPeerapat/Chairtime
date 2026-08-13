/**
 * Development-only shortcut into a seeded shop.
 *
 * Iron rule #7 makes production auth OAuth-only, and there is no password to
 * fall back to for local testing — that is the point. This page mints a
 * session exactly the way `/auth/callback` would (`mintSessionToken`), for a
 * staff row `pnpm db:seed` already created, so a developer without a real
 * LINE Login / Google OAuth app registered can still reach the dashboard.
 * It 404s outside development; nothing here is reachable in production.
 */
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { mintSessionToken, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DevLoginPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const tenants = await db
    .select({
      id: schema.tenant.id,
      slug: schema.tenant.slug,
      name: schema.tenant.name,
      status: schema.tenant.status,
      onboardedAt: schema.tenant.onboardedAt,
    })
    .from(schema.tenant);

  const rows = await Promise.all(
    tenants.map(async (tenant) => {
      const [owner] = await withTenant(tenant.id, (tx) =>
        tx
          .select({ staffId: schema.staffTenant.staffId, role: schema.staffTenant.role })
          .from(schema.staffTenant)
          .where(eq(schema.staffTenant.tenantId, tenant.id)),
      );
      return { tenant, owner };
    }),
  );

  async function loginAs(formData: FormData) {
    'use server';
    if (process.env.NODE_ENV === 'production') notFound();

    const tenantId = String(formData.get('tenantId') ?? '');
    const staffId = String(formData.get('staffId') ?? '');
    const [tenant] = await db
      .select({
        id: schema.tenant.id,
        slug: schema.tenant.slug,
        name: schema.tenant.name,
        status: schema.tenant.status,
        onboardedAt: schema.tenant.onboardedAt,
      })
      .from(schema.tenant)
      .where(eq(schema.tenant.id, tenantId));
    if (!tenant) redirect('/dev-login');

    const [membership] = await withTenant(tenantId, (tx) =>
      tx
        .select({ role: schema.staffTenant.role, resourceId: schema.staffTenant.resourceId })
        .from(schema.staffTenant)
        .where(eq(schema.staffTenant.staffId, staffId)),
    );
    if (!membership) redirect('/dev-login');

    const token = await mintSessionToken(staffId, {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      tenantStatus: tenant.status,
      tenantOnboardedAt: tenant.onboardedAt,
      role: membership.role === 'owner' || membership.role === 'manager' ? membership.role : 'staff',
      resourceId: membership.resourceId,
      isActive: true,
    });

    const store = await cookies();
    store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-5 py-10">
      <div>
        <h1 className="text-lg font-semibold">Dev login</h1>
        <p className="mt-1 text-sm text-slate-500">
          ทางลัดสำหรับ dev เท่านั้น — ของจริงล็อกอินผ่าน LINE/Google ที่ /login
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">ยังไม่มีร้านที่ seed ไว้ — รัน `pnpm db:seed` ก่อน</p>
      ) : (
        rows.map(({ tenant, owner }) =>
          owner ? (
            <form key={tenant.id} action={loginAs}>
              <input type="hidden" name="tenantId" value={tenant.id} />
              <input type="hidden" name="staffId" value={owner.staffId} />
              <button
                type="submit"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm dark:border-slate-800"
              >
                <span className="font-medium">{tenant.name}</span>
                <span className="ml-2 text-xs text-slate-500">
                  /{tenant.slug} · {owner.role}
                </span>
              </button>
            </form>
          ) : null,
        )
      )}
    </main>
  );
}
