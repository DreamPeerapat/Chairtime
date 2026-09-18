'use client';

/**
 * Choosing what to buy, before any money moves.
 *
 * One decision, not two. Asking for the plan and the billing term as two
 * equal rows of tiles read as two separate things to pick. The term is not a
 * second product — it is a switch on the prices of the one product — so it is
 * a switch, above the plans, and the plans show the price for whichever side
 * of it is on.
 *
 * The total shown here is the shop's, not the source of truth. The server
 * works the same figure out again from the plan's own row before it builds a
 * QR: a number that arrived from a browser must never decide what a banking
 * app is told to pay.
 */
import { useState } from 'react';
import { formatBaht, fromSatang, toSatang } from '@/lib/billing/amount';
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
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="term" value={yearly ? 'yearly' : 'monthly'} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">แพ็กเกจ</span>
        <TermSwitch term={term} onSelect={setTerm} saving={saving} />
      </div>

      {/*
        Tiles rather than a dropdown. There are two plans and the difference
        between them is the reason a shop is on this page — a `<select>` hides
        the alternative behind a tap and shows one price at a time, which is
        the one thing a person choosing between two prices needs not to happen.
      */}
      <div role="group" aria-label="แพ็กเกจ" className="grid gap-2 sm:grid-cols-2">
        {plans.map((p) => {
          const asYearly = term === 'yearly' && Boolean(p.priceYearly);
          return (
            <Tile
              key={p.id}
              selected={p.id === planId}
              onSelect={() => setPlanId(p.id)}
              title={p.name}
              note={
                asYearly
                  ? `${formatBaht(p.priceYearly!)} / ปี`
                  : `${formatBaht(p.priceMonthly)} / เดือน`
              }
              foot={
                asYearly
                  ? `เฉลี่ยเดือนละ ${formatBaht(perMonth(p.priceYearly!))}`
                  : term === 'yearly'
                    ? 'แพ็กเกจนี้ไม่มีรายปี — คิดเป็นรายเดือน'
                    : undefined
              }
            />
          );
        })}
      </div>

      <div className="flex items-baseline justify-between rounded-lg bg-surface-muted px-3 py-2.5">
        <span className="text-sm text-muted">
          ยอดที่ต้องชำระ{yearly ? ' (1 ปี)' : ' (1 เดือน)'}
        </span>
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
 * Monthly or yearly, level with the word "แพ็กเกจ" so it reads as a setting
 * on the prices below it. It carries what the year saves, which is the only
 * reason anybody would touch it.
 */
function TermSwitch({
  term,
  onSelect,
  saving,
}: {
  term: BillingTerm;
  onSelect: (term: BillingTerm) => void;
  /** percent off the twelve-month price, when there is one */
  saving: number | null;
}) {
  return (
    <div
      role="group"
      aria-label="รอบการชำระ"
      className="flex rounded-full border border-line p-0.5 text-xs"
    >
      <Segment selected={term === 'monthly'} onSelect={() => onSelect('monthly')}>
        รายเดือน
      </Segment>
      <Segment selected={term === 'yearly'} onSelect={() => onSelect('yearly')}>
        รายปี{saving ? ` · ประหยัด ${saving}%` : ''}
      </Segment>
    </div>
  );
}

function Segment({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-full px-3 py-1.5 whitespace-nowrap transition ${
        selected ? 'bg-brand font-medium text-brand-contrast' : 'text-muted'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One plan. The selected tile carries the brand border and a ring, so which
 * one is chosen survives being looked at quickly on a phone — a border alone
 * at this size does not.
 */
function Tile({
  selected,
  onSelect,
  title,
  note,
  foot,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  note: string;
  foot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-xl border px-4 py-3.5 text-left transition ${
        selected ? 'border-brand bg-brand-soft ring-1 ring-brand/30' : 'border-line hover:bg-surface-muted'
      }`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-sm">{note}</span>
      {foot ? <span className="mt-0.5 block text-xs text-muted">{foot}</span> : null}
    </button>
  );
}

/** A year's price divided twelve ways, in satang — iron rule #5, no floats. */
function perMonth(priceYearly: string): string {
  return fromSatang(Math.round(toSatang(priceYearly) / 12));
}
