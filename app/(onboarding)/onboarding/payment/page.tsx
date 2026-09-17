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
import { formatBaht } from '@/lib/billing/amount';
import { PLATFORM_PAYEE } from '@/lib/billing/platform';
import { promptPayFor } from '@/lib/billing/promptpay';
import { qrSvg } from '@/lib/billing/qr';

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
      // The first month is what this page is asking for, so the QR can carry
      // the exact figure — unlike the renewal page, nothing here is chosen yet.
      planName: schema.subscriptionPlan.name,
      priceMonthly: schema.subscriptionPlan.priceMonthly,
    })
    .from(schema.tenant)
    .leftJoin(schema.subscriptionPlan, eq(schema.subscriptionPlan.id, schema.tenant.planId))
    .where(eq(schema.tenant.id, tenantId));
  if (!tenant) redirect('/onboarding/plan');
  if (tenant.status === 'active') redirect('/onboarding/setup');

  const payload = promptPayFor(PLATFORM_PAYEE.promptPayId, tenant.priceMonthly);
  const qr = payload ? qrSvg(payload, { width: 220 }) : null;

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
        <p className="mt-1 text-sm text-muted">โอนเงินตามช่องทางด้านล่าง แล้วกดยืนยัน ระบบจะเปิดใช้งานร้านทันที</p>
      </div>

      {qr ? (
        <figure className="flex flex-col items-center gap-2 self-center rounded-xl bg-white p-4">
          {/*
            The markup is built on this request by `qrSvg` out of the payee id
            in the code and a numeric(10,2) column — no request data reaches
            it, and every character it emits is a digit or a tag this file's
            dependency wrote. Inline rather than a data URI so it stays crisp.
          */}
          <div dangerouslySetInnerHTML={{ __html: qr }} />
          <figcaption className="text-center text-sm text-slate-700">
            สแกนจ่ายพร้อมเพย์
            {tenant.priceMonthly ? (
              <span className="block font-medium">{formatBaht(tenant.priceMonthly)}</span>
            ) : null}
          </figcaption>
        </figure>
      ) : null}

      <div className="rounded-xl border border-line p-4 text-sm">
        <p className="text-xs text-muted">หรือโอนเข้าบัญชี</p>
        <p className="mt-1 font-medium">{PLATFORM_PAYEE.bank}</p>
        <p className="text-muted">เลขบัญชี {PLATFORM_PAYEE.accountNumber}</p>
        <p className="text-muted">ชื่อบัญชี {PLATFORM_PAYEE.accountName}</p>
      </div>

      <form action={confirm}>
        <button type="submit" className="w-full ct-press rounded-xl bg-brand py-3 text-sm font-medium text-brand-contrast hover:bg-brand-strong active:bg-brand-strong">
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
