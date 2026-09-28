'use client';

import { useState } from 'react';
import { PLANS, type BillingTerm } from '@/lib/billing/catalog';
import { PlanCard } from './plan-card';
import { PlanCarousel } from './plan-carousel';

/**
 * What it costs.
 *
 * Interactive for one reason: a shop deciding between paying monthly and
 * paying for a year wants to see both numbers, and a page that shows one and
 * explains the other in a footnote makes them do arithmetic to decide.
 *
 * The trial card sits in the row rather than above it, because "ทดลองใช้" is
 * one of the three things a shop is choosing between today — not a banner.
 */
const START_AT = Math.max(
  0,
  PLANS.findIndex((plan) => plan.recommended),
);

export function Pricing() {
  const [term, setTerm] = useState<BillingTerm>('monthly');

  return (
    <section id="ราคา" className="scroll-mt-16 overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="ct-heading mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">ราคา</h2>
        </div>

        <TermSwitch term={term} onChange={setTerm} />

        <PlanCarousel labels={PLANS.map((plan) => plan.name)} startAt={START_AT}>
          {PLANS.map((plan) => (
            <PlanCard key={plan.code} plan={plan} term={term} />
          ))}
        </PlanCarousel>

        <p className="mx-auto mt-9 max-w-2xl text-center text-xs leading-relaxed text-muted">
          ราคานี้ไม่มีภาษีมูลค่าเพิ่ม — ผู้ให้บริการเป็นบุคคลธรรมดา ยังไม่ได้จดทะเบียน VAT
          จึงออกใบเสร็จรับเงินให้ แต่ออกใบกำกับภาษีไม่ได้
        </p>
      </div>
    </section>
  );
}

function TermSwitch({ term, onChange }: { term: BillingTerm; onChange: (t: BillingTerm) => void }) {
  const options: [BillingTerm, string][] = [
    ['monthly', 'รายเดือน'],
    ['yearly', 'รายปี — ถูกกว่า'],
  ];

  return (
    <div className="mt-9 flex justify-center">
      <div className="inline-flex rounded-2xl border border-line bg-surface p-1.5">
        {options.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={term === value}
            className={`ct-press rounded-xl px-5 py-2.5 text-sm font-medium ${
              term === value ? 'bg-brand text-brand-contrast' : 'text-muted hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
