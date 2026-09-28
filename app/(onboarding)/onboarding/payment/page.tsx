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
import { startTrialForPendingTenant } from '@/lib/onboarding/create-tenant';

export const dynamic = 'force-dynamic';

/**
 * Where a shop left at `pending_payment` by the old paid signup lands.
 *
 * This page used to take the owner's word for a transfer: "ยืนยันว่าโอนเงินแล้ว"
 * turned the shop on with no end date, which the expiry cron never touches.
 * New signups no longer come here — every one starts on a trial — so all that
 * is left is to give a shop that stopped halfway the same trial, and send it
 * to the billing page to pay, where the slip is checked.
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
      planName: schema.subscriptionPlan.name,
    })
    .from(schema.tenant)
    .leftJoin(schema.subscriptionPlan, eq(schema.subscriptionPlan.id, schema.tenant.planId))
    .where(eq(schema.tenant.id, tenantId));
  if (!tenant) redirect('/onboarding/plan');
  if (tenant.status === 'active') redirect('/onboarding/setup');

  async function start() {
    'use server';
    const currentStaffUserId = await requirePendingStaffUserId();
    const owns = await verifyOwnership(tenantId!, currentStaffUserId);
    if (!owns) redirect('/onboarding/plan');

    await startTrialForPendingTenant(tenantId!, tenant!.businessType);

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
        <h1 className="text-xl font-semibold">เริ่มใช้งาน {tenant.name}</h1>
        <p className="mt-1 text-sm text-muted">
          เริ่มจากทดลองใช้ฟรีก่อน ยังไม่ต้องโอนเงินตอนนี้
          {tenant.planName ? ` เมื่อพร้อมแล้วชำระแพ็กเกจ ${tenant.planName} ได้ที่หน้า "แพ็กเกจ" ในหลังบ้าน` : null}
        </p>
      </div>

      <form action={start}>
        <button type="submit" className="w-full ct-press rounded-xl bg-brand py-3 text-sm font-medium text-brand-contrast hover:bg-brand-strong active:bg-brand-strong">
          เริ่มทดลองใช้
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
