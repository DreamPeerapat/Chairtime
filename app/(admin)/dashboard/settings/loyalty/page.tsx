import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { savePointRule } from '@/lib/admin/actions';

export const dynamic = 'force-dynamic';

export default async function LoyaltySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession('manager'); // page is viewable by managers; saving requires owner
  const { error, ok } = await searchParams;

  const [rule] = await withTenant(session.tenantId, (tx) =>
    tx.select().from(schema.pointRule).where(eq(schema.pointRule.tenantId, session.tenantId)),
  );

  async function submit(formData: FormData) {
    'use server';
    const result = await savePointRule({
      bahtPerPoint: formData.get('bahtPerPoint'),
      rounding: formData.get('rounding'),
      pointValueBaht: formData.get('pointValueBaht'),
      minRedeemPoints: formData.get('minRedeemPoints'),
      maxRedeemPercent: formData.get('maxRedeemPercent'),
      expiryMonths: formData.get('expiryMonths'),
      signupBonus: formData.get('signupBonus'),
      birthdayBonus: formData.get('birthdayBonus'),
      referralBonus: formData.get('referralBonus'),
      isActive: formData.get('isActive') === 'on',
    });
    redirect(result.ok ? '/dashboard/settings/loyalty?ok=1' : '/dashboard/settings/loyalty?error=1');
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">กติกาแต้มสะสม</h1>

      {ok ? (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-700 dark:bg-teal-950 dark:text-teal-300">
          บันทึกแล้ว
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          บันทึกไม่สำเร็จ ตรวจสอบข้อมูลอีกครั้ง
        </p>
      ) : null}

      <form action={submit} className="flex flex-col gap-4 text-sm">
        <Field label="ใช้กี่บาทถึงได้ 1 แต้ม" name="bahtPerPoint" defaultValue={rule?.bahtPerPoint ?? '100'} suffix="บาท" />

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">การปัดเศษแต้ม</span>
          <select
            name="rounding"
            defaultValue={rule?.rounding ?? 'floor'}
            className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
          >
            <option value="floor">ปัดลง</option>
            <option value="round">ปัดใกล้เคียง</option>
            <option value="ceil">ปัดขึ้น</option>
          </select>
        </label>

        <Field label="1 แต้มมีมูลค่ากี่บาท" name="pointValueBaht" defaultValue={rule?.pointValueBaht ?? '1'} suffix="บาท" />
        <Field label="ใช้แต้มขั้นต่ำ" name="minRedeemPoints" defaultValue={rule?.minRedeemPoints ?? 50} suffix="แต้ม" />
        <Field label="ใช้แต้มได้ไม่เกิน" name="maxRedeemPercent" defaultValue={rule?.maxRedeemPercent ?? '50'} suffix="% ของบิล" />
        <Field
          label="แต้มหมดอายุใน (เว้นว่าง = ไม่หมดอายุ)"
          name="expiryMonths"
          defaultValue={rule?.expiryMonths ?? ''}
          suffix="เดือน"
        />
        <Field label="โบนัสสมัครสมาชิก" name="signupBonus" defaultValue={rule?.signupBonus ?? 0} suffix="แต้ม" />
        <Field label="โบนัสวันเกิด" name="birthdayBonus" defaultValue={rule?.birthdayBonus ?? 0} suffix="แต้ม" />
        <Field label="โบนัสแนะนำเพื่อน" name="referralBonus" defaultValue={rule?.referralBonus ?? 0} suffix="แต้ม" />

        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
          <input type="checkbox" name="isActive" defaultChecked={rule?.isActive ?? true} />
          เปิดใช้งานระบบแต้ม
        </label>

        <button type="submit" className="rounded-xl bg-teal-700 py-3 text-sm font-medium text-white">
          บันทึก
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  suffix,
}: {
  label: string;
  name: string;
  defaultValue: string | number;
  suffix: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          name={name}
          step="any"
          min={0}
          defaultValue={defaultValue}
          className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-right text-sm dark:border-slate-800 dark:bg-slate-900"
        />
        <span className="w-16 text-xs text-slate-500">{suffix}</span>
      </span>
    </label>
  );
}
