import Link from 'next/link';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import type { ServiceSales, StaffSales, StatsRange } from '@/lib/admin/stats';

export interface SummaryStats {
  periodLabel: string;
  completed: number;
  cancelled: number;
  noShow: number;
  revenue: string;
  averageTicket: string;
  services: ServiceSales[];
  staff: StaffSales[];
  daily: Array<{ date: string; revenue: string }>;
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
  back,
  timezone,
  stats,
}: {
  range: StatsRange;
  back: number;
  timezone: string;
  stats: SummaryStats;
}) {
  const topService = stats.services[0];
  const peak = Math.max(...stats.daily.map((d) => Number(d.revenue)), 0);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">สรุปยอด</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {RANGE_LABELS.map((option) => (
            <Link
              key={option.value}
              href={`/dashboard/summary?range=${option.value}`}
              className={cn(
                'ct-press rounded-lg px-3 py-1.5 text-sm',
                range === option.value
                  ? 'bg-teal-700 font-medium text-white'
                  : 'border border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400',
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/dashboard/summary?range=${range}&back=${back + 1}`}
            aria-label="ช่วงก่อนหน้า"
            className="ct-press rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-800"
          >
            ‹
          </Link>
          <span className="min-w-40 text-center font-medium">{stats.periodLabel}</span>
          {back > 0 ? (
            <Link
              href={`/dashboard/summary?range=${range}&back=${back - 1}`}
              aria-label="ช่วงถัดไป"
              className="ct-press rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-800"
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
        <p className="rounded-xl border border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800">
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
            <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">
              บริการที่ขายได้
            </h2>
            <ul className="flex flex-col gap-1.5">
              {stats.services.map((row) => (
                <li
                  key={row.serviceName}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-800"
                >
                  <span className="min-w-0 truncate">{row.serviceName}</span>
                  <span className="shrink-0 text-right">
                    <span className="font-medium">{formatBaht(row.revenue)}</span>
                    <span className="ml-2 text-xs text-slate-500">{row.bookings} ครั้ง</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {stats.staff.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">รายช่าง</h2>
              <ul className="flex flex-col gap-1.5">
                {stats.staff.map((row) => (
                  <li
                    key={row.staffName}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-800"
                  >
                    <span className="min-w-0 truncate">{row.staffName}</span>
                    <span className="shrink-0 text-right">
                      <span className="font-medium">{formatBaht(row.revenue)}</span>
                      <span className="ml-2 text-xs text-slate-500">{row.bookings} คิว</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {stats.daily.length > 1 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">รายวัน</h2>
              <ul className="ct-scroll-x flex items-end gap-1.5 overflow-x-auto rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                {stats.daily.map((day) => {
                  const value = Number(day.revenue);
                  // Percentage of the best day, floored so a day with takings
                  // never draws as nothing at all.
                  const height = peak > 0 ? Math.max(8, Math.round((value / peak) * 96)) : 8;
                  const when = DateTime.fromISO(day.date, { zone: timezone });
                  return (
                    <li key={day.date} className="flex w-9 shrink-0 flex-col items-center gap-1">
                      <span
                        aria-hidden
                        style={{ height }}
                        className="w-full rounded-t bg-teal-600/80 dark:bg-teal-500/80"
                      />
                      <span className="text-[10px] text-slate-500">{when.day}</span>
                      <span className="sr-only">
                        {day.date}: {formatBaht(day.revenue)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
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
    <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
      <dt className="text-xs text-slate-500">{label}</dt>
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
