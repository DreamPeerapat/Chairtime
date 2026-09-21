import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Bucket, StatsRange } from '@/lib/admin/stats';

const TITLES: Record<StatsRange, string> = {
  week: 'รายได้รายวัน',
  month: 'รายได้รายสัปดาห์',
  year: 'รายได้รายเดือน',
};

const HINTS: Record<StatsRange, string | null> = {
  week: null,
  month: 'แตะแท่งเพื่อดูรายวันของสัปดาห์นั้น',
  year: 'แตะแท่งเพื่อดูรายสัปดาห์ของเดือนนั้น',
};

/** Tall enough to tell two good weeks apart, short enough to fit a phone. */
const MAX_BAR = 120;

/**
 * The takings, one column per day, week or month.
 *
 * Bars rather than a line: the question is "which week was good", which is a
 * comparison between discrete buckets, not a trend through a continuum. Each
 * column is a link down a level where there is a level below — a month's
 * columns open that week, a year's open that month — so the same page answers
 * "how was March" and "which day of March" without a second screen.
 *
 * Plain markup, no chart library: twelve divs with a height, which stays
 * server-rendered and adds nothing to the bundle.
 */
export function RevenueChart({
  range,
  buckets,
}: {
  range: StatsRange;
  buckets: Bucket[];
}) {
  if (buckets.length === 0) return null;

  const values = buckets.map((b) => Number(b.revenue));
  const peak = Math.max(...values, 0);
  const best = peak > 0 ? values.indexOf(peak) : -1;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-muted">{TITLES[range]}</h2>
        {HINTS[range] ? <p className="text-xs text-muted">{HINTS[range]}</p> : null}
      </div>

      <div className="ct-scroll-x overflow-x-auto rounded-xl border border-line px-3 py-4">
        <ul className="flex items-end gap-1.5" style={{ minHeight: MAX_BAR + 44 }}>
          {buckets.map((bucket, index) => {
            const value = Number(bucket.revenue);
            // Floored at 3px so a bucket that took money is never drawn as
            // nothing, and a zero bucket is a visible gap rather than a hole.
            const height = peak > 0 && value > 0 ? Math.max(3, Math.round((value / peak) * MAX_BAR)) : 2;
            const label = `${bucket.label}: ${formatBaht(bucket.revenue)} จาก ${bucket.bookings} คิว`;

            const bar = (
              <>
                <span className="text-[10px] tabular-nums text-muted">
                  {value > 0 ? compact(value) : ''}
                </span>
                <span
                  aria-hidden
                  style={{ height }}
                  className={cn(
                    'w-full rounded-t transition-[height]',
                    value === 0
                      ? 'bg-line'
                      : index === best
                        ? 'bg-brand'
                        : 'bg-brand/45',
                  )}
                />
                <span className="text-center text-[10px] leading-tight text-muted">
                  {bucket.label}
                </span>
              </>
            );

            return (
              <li key={bucket.key} className="flex min-w-11 flex-1 flex-col items-center gap-1">
                {bucket.drillTo ? (
                  <Link
                    href={`/dashboard/summary?range=${bucket.drillTo}&at=${bucket.key}`}
                    title={label}
                    aria-label={label}
                    className="ct-press flex w-full flex-col items-center gap-1 rounded-lg hover:bg-surface-muted"
                  >
                    {bar}
                  </Link>
                ) : (
                  <span title={label} aria-label={label} className="flex w-full flex-col items-center gap-1">
                    {bar}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** 12,400 → "12.4k". The axis is the bar; this is only a hint at the size. */
function compact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

function formatBaht(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `฿${amount}`;
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}
