'use client';

/**
 * Choosing what to buy, before any money moves.
 *
 * It used to be the whole payment: a shop typed what it had transferred and
 * the period was extended on that word. Now it only opens a payment — the QR,
 * the countdown and the slip live on the page that follows, because a fixed
 * amount has to be decided before a code can carry it.
 *
 * Interactive for one reason: the total follows the plan and the months, and
 * a shop should see what it is about to owe before it commits to a screen with
 * a clock on it.
 */
import { useState } from 'react';
import { formatBaht, totalForMonths } from '@/lib/billing/amount';
import type { PurchasablePlan } from '@/lib/billing/access';

const field =
  'rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900';

export function RenewalForm({
  plans,
  defaultPlanId,
  maxMonths,
  slipChecking,
  onSubmit,
}: {
  plans: PurchasablePlan[];
  defaultPlanId: string;
  maxMonths: number;
  /** whether an attached slip is checked against the bank */
  slipChecking: boolean;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const [planId, setPlanId] = useState(defaultPlanId);
  const [months, setMonths] = useState(1);

  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const total = plan ? totalForMonths(plan.priceMonthly, months) : '';

  return (
    <form
      action={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          แพ็กเกจ
          <select
            name="planId"
            required
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
            className={field}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatBaht(p.priceMonthly)} / เดือน
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          ต่อกี่เดือน
          <select
            name="months"
            value={months}
            onChange={(event) => setMonths(Number(event.target.value))}
            className={field}
          >
            {Array.from({ length: maxMonths }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m} เดือน
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-baseline justify-between rounded-lg bg-slate-100 px-3 py-2.5 dark:bg-slate-900">
        <span className="text-sm text-slate-600 dark:text-slate-400">ยอดที่ต้องชำระ</span>
        <span className="text-base font-semibold">{total ? formatBaht(total) : '—'}</span>
      </div>

      <button
        type="submit"
        className="ct-press w-full rounded-xl bg-teal-700 py-3 text-sm font-medium text-white"
      >
        สร้าง QR ชำระเงิน
      </button>

      <p className="text-xs text-slate-500">
        QR มีอายุ 15 นาที และใส่ยอดไว้ให้แล้ว ไม่ต้องพิมพ์เอง
        {slipChecking
          ? ' — แนบสลิปในหน้าถัดไปแล้วระบบตรวจยอดกับธนาคารให้ทันที'
          : ' — โอนแล้วกดยืนยันในหน้าถัดไป ต่ออายุให้ทันที'}
        {' '}ถ้าต่อก่อนหมดอายุ วันที่เหลือจะถูกบวกต่อ ไม่หายไป
      </p>
    </form>
  );
}
