import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { currentSession, mintSessionToken, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth';
import { completeOnboarding } from '@/lib/onboarding/complete-setup';
import { onboardingSetupSchema } from '@/lib/onboarding/validation';

export const dynamic = 'force-dynamic';

export default async function OnboardingSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await currentSession();
  if (!session) redirect('/login');
  if (session.onboarded) redirect('/dashboard');

  const { error } = await searchParams;

  // One transaction for both reads — withTenant opens one per call.
  const { services, resourceTypes } = await withTenant(session.tenantId, async (tx) => ({
    services: await tx
      .select({ id: schema.service.id, name: schema.service.name, basePrice: schema.service.basePrice })
      .from(schema.service)
      .where(eq(schema.service.tenantId, session.tenantId))
      .orderBy(schema.service.displayOrder),
    resourceTypes: await tx
      .select({ name: schema.resourceType.name, isHuman: schema.resourceType.isHuman })
      .from(schema.resourceType)
      .where(eq(schema.resourceType.tenantId, session.tenantId)),
  }));

  // The business template decides what these are called — "ช่างทำเล็บ / โต๊ะ"
  // for a nail shop, "หมอนวด / เตียงนวด" for a massage shop.
  const staffLabel = resourceTypes.find((t) => t.isHuman)?.name ?? 'ช่าง';
  const seatLabel = resourceTypes.find((t) => !t.isHuman)?.name ?? 'ที่นั่ง';

  async function submit(formData: FormData) {
    'use server';
    const activeSession = await currentSession();
    if (!activeSession) redirect('/login');

    const parsed = onboardingSetupSchema.safeParse({
      openTime: formData.get('openTime'),
      closeTime: formData.get('closeTime'),
      serviceIds: formData.getAll('serviceId'),
      servicePrices: formData.getAll('servicePrice'),
      staffCount: formData.get('staffCount'),
      seatCount: formData.get('seatCount'),
    });
    if (!parsed.success) redirect('/onboarding/setup?error=invalid');

    await completeOnboarding({
      tenantId: activeSession.tenantId,
      openTime: parsed.data.openTime,
      closeTime: parsed.data.closeTime,
      servicePrices: parsed.data.serviceIds.map((serviceId, i) => ({
        serviceId,
        price: parsed.data.servicePrices[i]!,
      })),
      staffCount: parsed.data.staffCount,
      seatCount: parsed.data.seatCount,
    });

    const token = await mintSessionToken(activeSession.staffUserId, {
      tenantId: activeSession.tenantId,
      tenantSlug: activeSession.tenantSlug,
      tenantName: activeSession.tenantSlug,
      tenantStatus: 'active',
      tenantOnboardedAt: new Date(),
      role: activeSession.role,
      resourceId: activeSession.resourceId,
      isActive: true,
    });
    const store = await cookies();
    store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 py-10">
      <div>
        <h1 className="text-xl font-semibold">ตั้งค่าร้านครั้งแรก</h1>
        <p className="mt-1 text-sm text-muted">เวลาทำการและราคาบริการ แก้ไขเพิ่มเติมได้ทีหลังในหลังบ้าน</p>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง
        </p>
      ) : null}

      <form action={submit} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-muted">เวลาทำการ (ทุกวัน)</legend>
          <div className="flex items-center gap-2">
            <input
              type="time"
              name="openTime"
              defaultValue="10:00"
              required
              className="rounded-lg border border-line px-3 py-2 text-sm dark:bg-slate-900"
            />
            <span className="text-sm text-muted">ถึง</span>
            <input
              type="time"
              name="closeTime"
              defaultValue="20:00"
              required
              className="rounded-lg border border-line px-3 py-2 text-sm dark:bg-slate-900"
            />
          </div>
        </fieldset>

        {/* Without these the shop finishes the wizard unbookable: every
            service needs a person and a seat, and the template creates only
            the categories, never anything to put in them. */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-muted">
            ร้านมีเท่าไหร่
          </legend>
          <div className="flex items-center justify-between gap-3 text-sm">
            <label htmlFor="staffCount">{staffLabel} (คน)</label>
            <input
              id="staffCount"
              type="number"
              name="staffCount"
              min="1"
              max="50"
              defaultValue={1}
              required
              className="w-24 rounded-lg border border-line px-3 py-1.5 text-right text-sm dark:bg-slate-900"
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <label htmlFor="seatCount">{seatLabel}</label>
            <input
              id="seatCount"
              type="number"
              name="seatCount"
              min="1"
              max="50"
              defaultValue={1}
              required
              className="w-24 rounded-lg border border-line px-3 py-1.5 text-right text-sm dark:bg-slate-900"
            />
          </div>
          <p className="text-xs text-slate-400">
            ใส่คร่าวๆ ก่อนได้ แก้ชื่อและเพิ่มลดทีหลังได้ในหลังบ้าน
          </p>
        </fieldset>

        {services.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-medium text-muted">ราคาบริการ</legend>
            {services.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <input type="hidden" name="serviceId" value={s.id} />
                <span>{s.name}</span>
                <input
                  type="number"
                  name="servicePrice"
                  step="1"
                  min="1"
                  defaultValue={Number(s.basePrice)}
                  required
                  className="w-28 rounded-lg border border-line px-3 py-1.5 text-right text-sm dark:bg-slate-900"
                />
              </div>
            ))}
          </fieldset>
        ) : (
          <p className="text-sm text-muted">ยังไม่มีบริการ — เพิ่มได้ในหลังบ้านหลังเข้าใช้งาน</p>
        )}

        <button type="submit" className="ct-press rounded-xl bg-brand py-3 text-sm font-medium text-brand-contrast hover:bg-brand-strong active:bg-brand-strong">
          เสร็จสิ้น เข้าใช้งาน
        </button>
      </form>
    </main>
  );
}
