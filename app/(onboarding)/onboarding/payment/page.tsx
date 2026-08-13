import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import {
  PENDING_IDENTITY_COOKIE,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  mintSessionToken,
  requirePendingStaffUserId,
} from '@/lib/auth';
import { activatePaidTenant } from '@/lib/onboarding/create-tenant';

export const dynamic = 'force-dynamic';

/**
 * A paid plan is not activated by any automated slip check yet
 * (docs/roadmap.md Phase 2.5: "แนบสลิปธรรมดาไปก่อน ยังไม่ต้อง SlipOK") — the
 * owner transfers, then confirms, and the shop goes live immediately. Real
 * verification (SlipOK/Slip2Go) is Phase 8 work.
 */
export default async function OnboardingPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const staffUserId = await requirePendingStaffUserId();
  const { tenant: tenantId } = await searchParams;
  if (!tenantId) redirect('/onboarding/plan');

  const membership = await verifyOwnership(tenantId, staffUserId);
  if (!membership) redirect('/onboarding/plan');

  const [tenant] = await db
    .select({
      id: schema.tenant.id,
      slug: schema.tenant.slug,
      name: schema.tenant.name,
      businessType: schema.tenant.businessType,
      status: schema.tenant.status,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId));
  if (!tenant) redirect('/onboarding/plan');
  if (tenant.status === 'active') redirect('/onboarding/setup');

  async function confirm() {
    'use server';
    const currentStaffUserId = await requirePendingStaffUserId();
    const owns = await verifyOwnership(tenantId!, currentStaffUserId);
    if (!owns) redirect('/onboarding/plan');

    await activatePaidTenant(tenantId!, tenant!.businessType);

    const token = await mintSessionToken(currentStaffUserId, {
      tenantId: tenant!.id,
      tenantSlug: tenant!.slug,
      tenantName: tenant!.name,
      tenantStatus: 'active',
      tenantOnboardedAt: null,
      role: 'owner',
      resourceId: null,
      isActive: true,
    });

    const store = await cookies();
    store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    store.delete(PENDING_IDENTITY_COOKIE);
    redirect('/onboarding/setup');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 py-10">
      <div>
        <h1 className="text-xl font-semibold">ชำระเงินเพื่อเริ่มใช้งาน {tenant.name}</h1>
        <p className="mt-1 text-sm text-slate-500">โอนเงินตามช่องทางด้านล่าง แล้วกดยืนยัน ระบบจะเปิดใช้งานร้านทันที</p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800">
        <p className="font-medium">ธนาคารกสิกรไทย</p>
        <p className="text-slate-600 dark:text-slate-400">เลขบัญชี xxx-x-xxxxx-x</p>
        <p className="text-slate-600 dark:text-slate-400">ชื่อบัญชี Chairtime Co., Ltd.</p>
      </div>

      <form action={confirm}>
        <button type="submit" className="w-full rounded-xl bg-teal-700 py-3 text-sm font-medium text-white">
          ยืนยันว่าโอนเงินแล้ว
        </button>
      </form>
    </main>
  );
}

async function verifyOwnership(tenantId: string, staffUserId: string): Promise<boolean> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({ staffId: schema.staffTenant.staffId })
      .from(schema.staffTenant)
      .where(and(eq(schema.staffTenant.tenantId, tenantId), eq(schema.staffTenant.staffId, staffUserId))),
  );
  return !!row;
}
