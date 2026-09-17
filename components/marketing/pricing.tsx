'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PLANS, TERM_MONTHS, yearlySavingPercent, type BillingTerm } from '@/lib/billing/catalog';
import { formatBaht } from '@/lib/billing/amount';

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
export function Pricing() {
  const [term, setTerm] = useState<BillingTerm>('monthly');

  return (
    <section id="ราคา" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">ราคาตรงไปตรงมา</h2>
          <p className="mt-3 text-muted">
            จ่ายรายเดือนหรือรายปีก็ได้ ไม่มีค่าติดตั้ง ไม่มีค่าแรกเข้า ไม่มีสัญญาผูกมัด
          </p>
        </div>

        <TermSwitch term={term} onChange={setTerm} />

        <div className="mt-8 grid items-start gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const yearly = term === 'yearly' && plan.priceYearly;
            const price = yearly ? plan.priceYearly! : plan.priceMonthly;
            const saving = yearlySavingPercent(plan);

            return (
              <article
                key={plan.code}
                className={`flex h-full flex-col rounded-2xl border bg-surface p-6 ${
                  plan.recommended ? 'border-brand shadow-sm ring-1 ring-brand/20' : 'border-line'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
                  </div>
                  {plan.recommended ? (
                    <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                      แนะนำ
                    </span>
                  ) : null}
                </div>

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tracking-tight">
                    {Number(price) === 0 ? 'ฟรี' : formatBaht(price).replace(' บาท', '')}
                  </span>
                  <span className="text-sm text-muted">
                    {Number(price) === 0
                      ? `${plan.trialDays} วัน`
                      : yearly
                        ? 'บาท / ปี'
                        : 'บาท / เดือน'}
                  </span>
                </div>

                {yearly && saving ? (
                  <p className="mt-1 text-xs text-brand">
                    ประหยัด {saving}% — เท่ากับจ่าย {TERM_MONTHS.yearly - 2} เดือน ได้ทั้งปี
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted">
                    {plan.priceYearly ? 'จ่ายรายปีถูกกว่า ดูได้จากปุ่มด้านบน' : 'หมดแล้วเลือกแพ็กเกจต่อได้'}
                  </p>
                )}

                <Link
                  href="/auth/start?provider=line"
                  className={`ct-press mt-6 rounded-xl px-5 py-3 text-center text-sm font-medium ${
                    plan.recommended
                      ? 'bg-brand text-brand-contrast hover:bg-brand-strong'
                      : 'border border-line hover:bg-surface-muted'
                  }`}
                >
                  {plan.trialDays > 0 ? 'เริ่มทดลองฟรี' : `เลือก ${plan.name}`}
                </Link>

                <ul className="mt-6 flex flex-col gap-2.5 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature.label} className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className={`mt-0.5 text-xs ${
                          feature.included === false ? 'text-muted' : 'text-brand'
                        }`}
                      >
                        {feature.included === false ? '—' : '✓'}
                      </span>
                      <span className={feature.included === false ? 'text-muted line-through' : ''}>
                        {feature.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted">
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
    <div className="mt-8 flex justify-center">
      <div className="inline-flex rounded-xl border border-line bg-surface-muted p-1">
        {options.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={term === value}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
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
