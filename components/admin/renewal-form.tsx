'use client';

/**
 * Choosing what to buy, before any money moves.
 *
 * Two decisions, not twelve: which plan, and monthly or yearly. It used to
 * offer 1–12 months and multiply, which was arithmetic pretending to be a
 * choice — nobody buys seven months, and the year has its own price rather
 * than twelve times the monthly one.
 *
 * The total shown here is the shop's, not the source of truth. The server
 * works the same figure out again from the plan's own row before it builds a
 * QR, because a number that arrived from a browser must never decide what a
 * banking app is told to pay.
 */
import { useState } from 'react';
import { formatBaht } from '@/lib/billing/amount';
import type { PurchasablePlan } from '@/lib/billing/access';
import type { BillingTerm } from '@/lib/billing/catalog';

const field =
  'rounded-lg border border-line bg-surface px-3 py-2 text-sm dark:bg-surface-muted';

export function RenewalForm({
  plans,
  defaultPlanId,
  slipChecking,
  onSubmit,
}: {
  plans: PurchasablePlan[];
  defaultPlanId: string;
  /** whether an attached slip is checked against the bank */
  slipChecking: boolean;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const [planId, setPlanId] = useState(defaultPlanId);
  const [term, setTerm] = useState<BillingTerm>('monthly');

  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const yearlyOffered = Boolean(plan?.priceYearly);
  const yearly = term === 'yearly' && yearlyOffered;
  const total = yearly ? plan!.priceYearly! : (plan?.priceMonthly ?? '');

  const saving =
    plan?.priceYearly && Number(plan.priceMonthly) > 0
      ? Math.round(
          ((Number(plan.priceMonthly) * 12 - Number(plan.priceYearly)) /
            (Number(plan.priceMonthly) * 12)) *
            100,
        )
      : null;

  return (
    <form
      action={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-4 py-4"
    >
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

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1">รอบการชำระ</legend>
        <input type="hidden" name="term" value={yearly ? 'yearly' : 'monthly'} />
        <div className="grid grid-cols-2 gap-2">
          <TermOption
            selected={!yearly}
            onSelect={() => setTerm('monthly')}
            title="รายเดือน"
            note={plan ? `${formatBaht(plan.priceMonthly)} / เดือน` : ''}
          />
          <TermOption
            selected={yearly}
            disabled={!yearlyOffered}
            onSelect={() => setTerm('yearly')}
            title="รายปี"
            note={
              plan?.priceYearly
                ? `${formatBaht(plan.priceYearly)} / ปี${saving ? ` · ประหยัด ${saving}%` : ''}`
                : 'แพ็กเกจนี้ไม่มีรายปี'
            }
          />
        </div>
      </fieldset>

      <div className="flex items-baseline justify-between rounded-lg bg-surface-muted px-3 py-2.5">
        <span className="text-sm text-muted">ยอดที่ต้องชำระ</span>
        <span className="text-base font-semibold">{total ? formatBaht(total) : '—'}</span>
      </div>

      <button
        type="submit"
        className="ct-press w-full rounded-xl bg-brand py-3 text-sm font-medium text-brand-contrast hover:bg-brand-strong"
      >
        สร้าง QR ชำระเงิน
      </button>

      <p className="text-xs text-muted">
        QR มีอายุ 15 นาที และใส่ยอดไว้ให้แล้ว ไม่ต้องพิมพ์เอง
        {slipChecking
          ? ' — แนบสลิปในหน้าถัดไปแล้วระบบตรวจยอดกับธนาคารให้ทันที'
          : ' — โอนแล้วกดยืนยันในหน้าถัดไป ต่ออายุให้ทันที'}{' '}
        ถ้าต่อก่อนหมดอายุ วันที่เหลือจะถูกบวกต่อ ไม่หายไป
      </p>
    </form>
  );
}

function TermOption({
  selected,
  disabled,
  onSelect,
  title,
  note,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  note: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-xl border px-3 py-3 text-left transition disabled:opacity-40 ${
        selected ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-muted'
      }`}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-xs text-muted">{note}</span>
    </button>
  );
}
