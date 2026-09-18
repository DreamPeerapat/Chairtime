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
      {/*
        Tiles rather than a dropdown. There are two plans and the difference
        between them is the reason a shop is on this page — a `<select>` hides
        the alternative behind a tap and shows one price at a time, which is
        the one thing a person choosing between two prices needs not to happen.
      */}
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1">แพ็กเกจ</legend>
        <input type="hidden" name="planId" value={planId} />
        <div className="grid gap-2 sm:grid-cols-2">
          {plans.map((p) => (
            <Tile
              key={p.id}
              selected={p.id === planId}
              onSelect={() => setPlanId(p.id)}
              title={p.name}
              note={`${formatBaht(p.priceMonthly)} / เดือน`}
              foot={p.priceYearly ? `หรือ ${formatBaht(p.priceYearly)} / ปี` : undefined}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1">รอบการชำระ</legend>
        <input type="hidden" name="term" value={yearly ? 'yearly' : 'monthly'} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Tile
            selected={!yearly}
            onSelect={() => setTerm('monthly')}
            title="รายเดือน"
            note={plan ? `${formatBaht(plan.priceMonthly)} / เดือน` : ''}
          />
          <Tile
            selected={yearly}
            disabled={!yearlyOffered}
            onSelect={() => setTerm('yearly')}
            title="รายปี"
            note={
              plan?.priceYearly
                ? `${formatBaht(plan.priceYearly)} / ปี`
                : 'แพ็กเกจนี้ไม่มีรายปี'
            }
            badge={saving && yearlyOffered ? `ประหยัด ${saving}%` : undefined}
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

/**
 * One choice, as a tile.
 *
 * Both rows on this form are the same shape on purpose: pick a plan, pick a
 * term. A selected tile carries the brand border and a ring, so which one is
 * chosen survives being looked at quickly on a phone — a border alone at
 * this size does not.
 */
function Tile({
  selected,
  disabled,
  onSelect,
  title,
  note,
  foot,
  badge,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  note: string;
  foot?: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-xl border px-4 py-3.5 text-left transition disabled:opacity-40 ${
        selected
          ? 'border-brand bg-brand-soft ring-1 ring-brand/30'
          : 'border-line hover:bg-surface-muted'
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {badge ? (
          <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-medium text-brand-contrast">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="mt-1 block text-sm">{note}</span>
      {foot ? <span className="mt-0.5 block text-xs text-muted">{foot}</span> : null}
    </button>
  );
}
