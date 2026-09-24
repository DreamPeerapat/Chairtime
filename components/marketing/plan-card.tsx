import Link from 'next/link';
import { TERM_MONTHS, yearlySavingPercent, type BillingTerm, type CatalogPlan } from '@/lib/billing/catalog';
import { formatBaht } from '@/lib/billing/amount';

/**
 * One plan in the pricing row.
 *
 * The recommended card is the only thing on the page wearing the accent, and
 * it is lifted off the row with a shadow rather than a second border colour:
 * three cards with three different outlines reads as three warnings.
 *
 * Below `lg` the card is a slide in a sideways row (plan-carousel.tsx), so its
 * width is set here as a share of the screen — wide enough to read, narrow
 * enough that the next card's edge shows and says there is more.
 */
export function PlanCard({ plan, term }: { plan: CatalogPlan; term: BillingTerm }) {
  const yearly = term === 'yearly' && plan.priceYearly;
  const price = yearly ? plan.priceYearly! : plan.priceMonthly;
  const saving = yearlySavingPercent(plan);

  return (
    <article
      aria-label={plan.name}
      className={`ct-reveal ct-lift relative flex w-[84%] shrink-0 snap-center flex-col rounded-3xl border bg-surface p-7 sm:w-[58%] lg:h-full lg:w-auto ${
        plan.recommended ? 'border-[1.5px] border-brand shadow-raised' : 'border-line shadow-card'
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
          {Number(price) === 0 ? `${plan.trialDays} วัน` : yearly ? 'บาท / ปี' : 'บาท / เดือน'}
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

      <Link
        href="/auth/start?provider=line"
        className={`ct-press mt-7 rounded-2xl px-5 py-3.5 text-center text-sm font-medium ${
          plan.recommended
            ? 'bg-brand text-brand-contrast hover:bg-brand-strong'
            : 'border border-line hover:bg-surface-muted'
        }`}
      >
        {plan.trialDays > 0 ? 'เริ่มทดลองฟรี' : `เลือก ${plan.name}`}
      </Link>

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
}
