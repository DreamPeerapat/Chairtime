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
 *
 * The recommended card is the only thing on this page wearing the accent, and
 * it is lifted off the row with a shadow rather than a second border colour:
 * three cards with three different outlines reads as three warnings.
 */
export function Pricing() {
  const [term, setTerm] = useState<BillingTerm>('monthly');

  return (
    <section id="ราคา" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">ราคา</h2>
        </div>

        <TermSwitch term={term} onChange={setTerm} />

        {/*
          A swipe on a phone, a grid from `lg`.

          Stacked, the three plans were a 2,000px column: the shop scrolled
          past Basic to find Pro and never saw them side by side, which is the
          one thing a price list has to let you do. Below `lg` they lie in a
          snapping row instead — the fourth of the next card left showing at
          the edge is what says there is more to swipe to.

          `ct-stagger` is dropped here: the reveal animates on vertical scroll
          position, and in a horizontal strip the offscreen cards would sit at
          opacity 0 until the page scrolled past, which for a sideways strip
          is never.
        */}
        <div className="ct-scroll-x -mx-5 flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-5 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:items-start lg:gap-5 lg:overflow-visible lg:px-0">
          {PLANS.map((plan) => {
            const yearly = term === 'yearly' && plan.priceYearly;
            const price = yearly ? plan.priceYearly! : plan.priceMonthly;
            const saving = yearlySavingPercent(plan);

            return (
              <article
                key={plan.code}
                className={`ct-lift relative flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-3xl border bg-surface p-7 lg:h-full lg:w-auto lg:max-w-none lg:shrink ${
                  plan.recommended
                    ? 'border-[1.5px] border-brand shadow-raised'
                    : 'border-line shadow-card'
                }`}
              >
                {plan.recommended ? (
                  <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                    แนะนำ
                  </span>
                ) : null}

                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1.5 text-sm text-muted">{plan.tagline}</p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-[2.6rem] leading-none font-semibold">
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
                  <p className="mt-2 text-xs text-brand-strong">
                    ประหยัด {saving}% — เท่ากับจ่าย {TERM_MONTHS.yearly - 2} เดือน ได้ทั้งปี
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted">
                    {plan.priceYearly ? 'จ่ายรายปีถูกกว่า ดูได้จากปุ่มด้านบน' : 'หมดแล้วเลือกแพ็กเกจต่อได้'}
                  </p>
                )}

                {/* Plain <a>, not <Link> — see the note in hero.tsx: this route redirects off-origin and <Link> fails CORS. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                  href="/auth/start?provider=line"
                  className={`ct-press mt-7 rounded-2xl px-5 py-3.5 text-center text-sm font-medium ${
                    plan.recommended
                      ? 'bg-brand text-brand-contrast hover:bg-brand-strong'
                      : 'border border-line hover:bg-surface-muted'
                  }`}
                >
                  {plan.trialDays > 0 ? 'เริ่มทดลองฟรี' : `เลือก ${plan.name}`}
                </a>

                <ul className="mt-7 flex flex-col gap-3 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature.label} className="flex items-start gap-3">
                      {feature.included === false ? (
                        <span aria-hidden className="mt-0.5 w-4 shrink-0 text-center text-muted">
                          —
                        </span>
                      ) : (
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mt-1 size-4 shrink-0 text-brand"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
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
              term === value
                ? 'bg-brand text-brand-contrast'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
