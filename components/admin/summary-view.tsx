import Link from 'next/link';
import { cn } from '@/lib/utils';
import { RevenueChart } from './revenue-chart';
import type { Bucket, ServiceSales, StaffSales, StatsRange } from '@/lib/admin/stats';

export interface SummaryStats {
  periodLabel: string;
  completed: number;
  cancelled: number;
  noShow: number;
  revenue: string;
  averageTicket: string;
  services: ServiceSales[];
  staff: StaffSales[];
  buckets: Bucket[];
}

const RANGE_LABELS: Array<{ value: StatsRange; label: string }> = [
  { value: 'week', label: 'รายสัปดาห์' },
  { value: 'month', label: 'รายเดือน' },
  { value: 'year', label: 'รายปี' },
];

/**
 * The numbers a shop owner asks for out loud: what came in, and from what.
 *
 * A server component with links rather than a client component with state —
 * the range and how far back both live in the URL, so a figure can be sent to
 * an accountant as a link and still say the same thing next week.
 */
export function SummaryView({
  range,
  timezone,
  previousAt,
  nextAt,
  stats,
  reports = true,
}: {
  range: StatsRange;
  timezone: string;
  /**
   * Whether the plan includes the reporting half of this page: the range
   * switch, moving between periods, and the chart. Without it the shop still
   * sees this week's numbers, which is what Basic is sold as.
   */
  reports?: boolean;
  previousAt: string;
  /** null while looking at the current period — there is nothing ahead of it */
  nextAt: string | null;
  stats: SummaryStats;
}) {
  const topService = stats.services[0];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">สรุปยอด</h1>

      {!reports ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3">
          <p className="text-sm">
            <span className="font-medium">{stats.periodLabel}</span>
            <span className="ml-2 text-muted">
              แพ็กเกจ Basic ดูได้เฉพาะสัปดาห์นี้ — กราฟรายได้และย้อนหลังอยู่ในแพ็กเกจ Pro
            </span>
          </p>
          <Link
            href="/dashboard/billing"
            className="ct-press shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-contrast"
          >
            อัปเกรดเป็น Pro
          </Link>
        </div>
      ) : null}

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
          <span className="min-w-40 text-center font-medium">{stats.periodLabel}</span>
          {nextAt ? (
            <Link
              href={`/dashboard/summary?range=${range}&at=${nextAt}`}
              aria-label="ช่วงถัดไป"
              className="ct-press rounded-lg border border-line px-2.5 py-1.5"
            >
              ›
            </Link>
          ) : (
            <span className="rounded-lg border border-transparent px-2.5 py-1.5 text-slate-300 dark:text-slate-700">
              ›
            </span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="รายได้" value={formatBaht(stats.revenue)} big />
        <Stat label="คิวที่ทำเสร็จ" value={String(stats.completed)} />
        <Stat label="เฉลี่ยต่อคิว" value={formatBaht(stats.averageTicket)} />
        <Stat
          label="ยกเลิก / ไม่มา"
          value={`${stats.cancelled} / ${stats.noShow}`}
          tone={stats.noShow > 0 ? 'warn' : undefined}
        />
      </dl>

      {stats.completed === 0 ? (
        <p className="rounded-xl border border-line px-4 py-6 text-center text-sm text-muted">
          ช่วงนี้ยังไม่มีคิวที่ทำเสร็จ — ตัวเลขจะขึ้นเมื่อกดปุ่ม “เสร็จแล้ว” ที่คิว
        </p>
      ) : (
        <>
          {topService ? (
            <p className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
              บริการที่ขายดีที่สุดคือ <span className="font-semibold">{topService.serviceName}</span>{' '}
              — {topService.bookings} ครั้ง คิดเป็น {formatBaht(topService.revenue)}
            </p>
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted">
              บริการที่ขายได้
            </h2>
            <ul className="flex flex-col gap-1.5">
              {stats.services.map((row) => (
                <li
                  key={row.serviceName}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate">{row.serviceName}</span>
                  <span className="shrink-0 text-right">
                    <span className="font-medium">{formatBaht(row.revenue)}</span>
                    <span className="ml-2 text-xs text-muted">{row.bookings} ครั้ง</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {stats.staff.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted">รายช่าง</h2>
              <ul className="flex flex-col gap-1.5">
                {stats.staff.map((row) => (
                  <li
                    key={row.staffName}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5 text-sm"
                  >
                    <span className="min-w-0 truncate">{row.staffName}</span>
                    <span className="shrink-0 text-right">
                      <span className="font-medium">{formatBaht(row.revenue)}</span>
                      <span className="ml-2 text-xs text-muted">{row.bookings} คิว</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {reports ? <RevenueChart range={range} buckets={stats.buckets} /> : null}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  big,
  tone,
}: {
  label: string;
  value: string;
  big?: boolean;
  tone?: 'warn';
}) {
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 font-semibold tabular-nums',
          big ? 'text-xl' : 'text-lg',
          tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : undefined,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** numeric(10,2) in, grouped baht out. Display only. */
function formatBaht(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `฿${amount}`;
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}
