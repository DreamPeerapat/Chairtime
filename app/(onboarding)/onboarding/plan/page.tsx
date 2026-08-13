import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import {
  PENDING_IDENTITY_COOKIE,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  mintSessionToken,
  requirePendingStaffUserId,
} from '@/lib/auth';
import { createTenantForStaff, InvalidPlanError } from '@/lib/onboarding/create-tenant';
import { onboardingPlanSchema } from '@/lib/onboarding/validation';

export const dynamic = 'force-dynamic';

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  nail: 'ร้านทำเล็บ',
  hair: 'ร้านทำผม',
  massage: 'ร้านนวด',
  clinic: 'คลินิก',
  other: 'อื่นๆ',
};

export default async function OnboardingPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePendingStaffUserId();
  const { error } = await searchParams;

  const [plans, templates] = await Promise.all([
    db
      .select()
      .from(schema.subscriptionPlan)
      .where(eq(schema.subscriptionPlan.isActive, true))
      .orderBy(asc(schema.subscriptionPlan.priceMonthly)),
    db.select().from(schema.businessTypeTemplate),
  ]);

  async function submit(formData: FormData) {
    'use server';
    const staffUserId = await requirePendingStaffUserId();

    const parsed = onboardingPlanSchema.safeParse({
      shopName: formData.get('shopName'),
      businessType: formData.get('businessType'),
      planCode: formData.get('planCode'),
    });
    if (!parsed.success) redirect('/onboarding/plan?error=invalid');

    let result;
    try {
      result = await createTenantForStaff({ staffUserId, ...parsed.data });
    } catch (err) {
      if (err instanceof InvalidPlanError) redirect('/onboarding/plan?error=invalid');
      throw err;
    }

    if (result.needsPayment) {
      redirect(`/onboarding/payment?tenant=${result.tenantId}`);
    }

    const token = await mintSessionToken(staffUserId, {
      tenantId: result.tenantId,
      tenantSlug: result.tenantSlug,
      tenantName: parsed.data.shopName,
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
        <h1 className="text-xl font-semibold">เริ่มต้นใช้งาน Chairtime</h1>
        <p className="mt-1 text-sm text-slate-500">ตั้งชื่อร้าน เลือกประเภทธุรกิจ และแพ็กเกจ</p>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          กรอกข้อมูลไม่ครบ กรุณาลองใหม่
        </p>
      ) : null}

      <form action={submit} className="flex flex-col gap-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">ชื่อร้าน</span>
          <input
            name="shopName"
            required
            maxLength={120}
            placeholder="เช่น Nail Bar อารีย์"
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">ประเภทธุรกิจ</legend>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t, i) => (
              <label
                key={t.businessType}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 dark:border-slate-800 dark:has-[:checked]:bg-teal-950"
              >
                <input
                  type="radio"
                  name="businessType"
                  value={t.businessType}
                  required
                  defaultChecked={i === 0}
                />
                {BUSINESS_TYPE_LABELS[t.businessType] ?? t.displayName}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">แพ็กเกจ</legend>
          <div className="flex flex-col gap-2">
            {plans.map((plan, i) => (
              <label
                key={plan.code}
                className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 dark:border-slate-800 dark:has-[:checked]:bg-teal-950"
              >
                <span className="flex items-start gap-2">
                  <input type="radio" name="planCode" value={plan.code} required defaultChecked={i === 0} className="mt-0.5" />
                  <span>
                    <span className="block font-medium">{plan.name}</span>
                    {plan.trialDays > 0 ? (
                      <span className="block text-xs text-slate-500">ทดลองใช้ฟรี {plan.trialDays} วัน</span>
                    ) : (
                      <span className="block text-xs text-slate-500">
                        {plan.priceMonthly ? `${Number(plan.priceMonthly).toLocaleString('th-TH')} บาท/เดือน` : 'ติดต่อฝ่ายขาย'}
                      </span>
                    )}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="rounded-xl bg-teal-700 py-3 text-sm font-medium text-white">
          เริ่มใช้งาน
        </button>
      </form>
    </main>
  );
}
