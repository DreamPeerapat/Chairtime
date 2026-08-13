import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  PENDING_IDENTITY_COOKIE,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  listStaffTenants,
  mintSessionToken,
  requirePendingStaffUserId,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** For a staff member who belongs to more than one shop — docs/logic.md ข้อ 1.5. */
export default async function SelectStorePage() {
  const staffUserId = await requirePendingStaffUserId();
  const tenants = await listStaffTenants(staffUserId);

  if (tenants.length === 0) redirect('/onboarding/plan');

  async function enterTenant(currentStaffUserId: string, tenantId: string) {
    'use server';
    const list = await listStaffTenants(currentStaffUserId);
    const chosen = list.find((t) => t.tenantId === tenantId);
    if (!chosen) redirect('/select-store');

    const token = await mintSessionToken(currentStaffUserId, chosen);
    const store = await cookies();
    store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    store.delete(PENDING_IDENTITY_COOKIE);
    redirect(chosen.tenantOnboardedAt ? '/dashboard' : '/onboarding/setup');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-5 py-10">
      <div>
        <h1 className="text-lg font-semibold">เลือกร้าน</h1>
        <p className="mt-1 text-sm text-slate-500">คุณอยู่ในหลายร้าน เลือกร้านที่ต้องการเข้าใช้งาน</p>
      </div>

      {tenants.map((t) => (
        <form key={t.tenantId} action={enterTenant.bind(null, staffUserId, t.tenantId)}>
          <button
            type="submit"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm dark:border-slate-800"
          >
            <span className="font-medium">{t.tenantName}</span>
            <span className="ml-2 text-xs text-slate-500">
              /{t.tenantSlug} · {t.role}
            </span>
          </button>
        </form>
      ))}
    </main>
  );
}
