'use client';

/**
 * Telling us a transfer happened.
 *
 * Interactive for one reason: the QR has to carry the right amount. A shop
 * that picks a year of the middle plan owes something this form can work out
 * and they should not have to, and a QR built from a number they typed wrong
 * is a transfer that fails the slip check afterwards.
 *
 * The amount follows the plan and the months, and stays editable — a shop
 * that agreed a different figure with us by phone is still able to say so.
 */
import { useState } from 'react';
import { formatBaht, totalForMonths } from '@/lib/billing/amount';
import type { PurchasablePlan } from '@/lib/billing/access';
import { SlipUploader } from './slip-uploader';

const field =
  'rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900';

/** What the QR route accepts; anything else and the picture is left off. */
const AMOUNT = /^\d{1,6}(\.\d{1,2})?$/;

export function RenewalForm({
  tenantId,
  plans,
  defaultPlanId,
  today,
  maxMonths,
  slipChecking,
  onSubmit,
}: {
  tenantId: string;
  plans: PurchasablePlan[];
  defaultPlanId: string;
  today: string;
  maxMonths: number;
  /** whether a slip is checked against the bank, or only filed for a human */
  slipChecking: boolean;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const [planId, setPlanId] = useState(defaultPlanId);
  const [months, setMonths] = useState(1);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];

  const suggested = plan ? totalForMonths(plan.priceMonthly, months) : '';
  const [amount, setAmount] = useState(suggested);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);

  // Changing what is being bought changes the bill. Done here rather than in
  // an effect so the input and the QR never disagree for a frame.
  function reprice(nextPlanId: string, nextMonths: number): void {
    setPlanId(nextPlanId);
    setMonths(nextMonths);
    const next = plans.find((p) => p.id === nextPlanId);
    if (next) setAmount(totalForMonths(next.priceMonthly, nextMonths));
  }

  const qrSrc = AMOUNT.test(amount)
    ? `/api/admin/billing/promptpay?amount=${encodeURIComponent(amount)}`
    : '/api/admin/billing/promptpay';

  return (
    <form
      action={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            แพ็กเกจ
            <select
              name="planId"
              required
              value={planId}
              onChange={(event) => reprice(event.target.value, months)}
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
              onChange={(event) => reprice(planId, Number(event.target.value))}
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

        <figure className="flex flex-col items-center gap-1 rounded-xl bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="QR พร้อมเพย์สำหรับโอนค่าบริการ" width={160} height={160} />
          <figcaption className="text-center text-xs text-slate-600">
            สแกนจ่ายพร้อมเพย์
            <br />
            {AMOUNT.test(amount) ? formatBaht(amount) : 'ใส่ยอดเอง'}
          </figcaption>
        </figure>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          ยอดที่โอน (บาท)
          <input
            name="amount"
            required
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="900"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          วันที่โอน
          <input
            type="date"
            name="paidAt"
            required
            defaultValue={today}
            max={today}
            className={field}
          />
        </label>
      </div>

      <SlipUploader tenantId={tenantId} value={slipUrl} onChange={setSlipUrl} />
      <input type="hidden" name="slipUrl" value={slipUrl ?? ''} />

      <label className="flex flex-col gap-1 text-sm">
        หมายเหตุ (ถ้ามี)
        <input
          name="note"
          maxLength={300}
          placeholder="เช่น โอนจากบัญชีชื่ออื่น"
          className={field}
        />
      </label>

      <p className="text-xs text-slate-500">
        {slipChecking
          ? 'แนบสลิปแล้วระบบตรวจยอดกับธนาคารให้ทันที — ถ้าตรวจไม่ผ่านจะยังไม่ต่ออายุให้ และจะบอกเหตุผล'
          : 'ระบบต่ออายุให้ทันทีที่กดแจ้ง ไม่ต้องรอตรวจสอบ'}{' '}
        ถ้าโอนก่อนหมดอายุ วันที่เหลือจะถูกบวกต่อ ไม่หายไป
      </p>

      <button
        type="submit"
        className="ct-press w-fit rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-medium text-white"
      >
        แจ้งชำระเงิน
      </button>
    </form>
  );
}
