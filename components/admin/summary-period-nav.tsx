import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { StatsRange } from '@/lib/admin/stats';

const RANGE_LABELS: Array<{ value: StatsRange; label: string }> = [
  { value: 'week', label: 'รายสัปดาห์' },
  { value: 'month', label: 'รายเดือน' },
  { value: 'year', label: 'รายปี' },
];

/**
 * The range switch and the previous/next arrows above the summary. Both are
 * plain links so the period stays in the URL. Split out of summary-view.tsx
 * for the 200-line rule in CLAUDE.md.
 */
export function SummaryPeriodNav({
  range,
  periodLabel,
  previousAt,
  nextAt,
  reports,
}: {
  range: StatsRange;
  periodLabel: string;
  previousAt: string;
  /** null while looking at the current period — there is nothing ahead of it */
  nextAt: string | null;
  /** false on a plan without reports: the row is hidden rather than left out */
  reports: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', !reports && 'hidden')}>
      <div className="flex gap-1">
        {RANGE_LABELS.map((option) => (
          <Link
            key={option.value}
            href={`/dashboard/summary?range=${option.value}`}
            className={cn(
              'ct-press rounded-lg px-3 py-1.5 text-sm',
              range === option.value
                ? 'bg-brand font-medium text-brand-contrast'
                : 'border border-line text-muted',
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Link
          href={`/dashboard/summary?range=${range}&at=${previousAt}`}
          aria-label="ช่วงก่อนหน้า"
          className="ct-press rounded-lg border border-line px-2.5 py-1.5"
        >
          ‹
        </Link>
        <span className="min-w-40 text-center font-medium">{periodLabel}</span>
        {nextAt ? (
          <Link
            href={`/dashboard/summary?range=${range}&at=${nextAt}`}
            aria-label="ช่วงถัดไป"
            className="ct-press rounded-lg border border-line px-2.5 py-1.5"
          >
            ›
          </Link>
        ) : (
          <span className="rounded-lg border border-transparent px-2.5 py-1.5 text-[#a8b4b2]">
            ›
          </span>
        )}
      </div>
    </div>
  );
}
