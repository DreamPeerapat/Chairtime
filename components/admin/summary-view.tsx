import Link from 'next/link';
import { RevenueChart } from './revenue-chart';
import { SummaryPeriodNav } from './summary-period-nav';
import { Card, EmptyState, PageBody, PageHeader, Rows, Stat } from '@/components/ui/page';
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
    <PageBody>
      <PageHeader
        title="สรุปยอด"
        description={
          reports
            ? 'รายได้และคิวของร้าน เลือกช่วงเวลาได้ กดแท่งในกราฟเพื่อเจาะดูช่วงนั้น'
            : 'รายได้และคิวของร้านในสัปดาห์นี้'
        }
      />

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

      <SummaryPeriodNav
        range={range}
        periodLabel={stats.periodLabel}
        previousAt={previousAt}
        nextAt={nextAt}
        reports={reports}
      />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="รายได้" value={formatBaht(stats.revenue)} tone="brand" />
        <Stat label="คิวที่ทำเสร็จ" value={stats.completed} />
        <Stat label="เฉลี่ยต่อคิว" value={formatBaht(stats.averageTicket)} />
        <Stat
          label="ยกเลิก / ไม่มา"
          value={`${stats.cancelled} / ${stats.noShow}`}
          tone={stats.noShow > 0 ? 'warn' : undefined}
        />
      </dl>

      {stats.completed === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="ช่วงนี้ยังไม่มีคิวที่ทำเสร็จ"
            description="ตัวเลขจะขึ้นเมื่อกดปุ่ม “เสร็จแล้ว” ที่คิวในปฏิทิน — คิวที่ยังไม่ปิดจะไม่นับเป็นรายได้"
          />
        </Card>
      ) : (
        <>
          {topService ? (
            <p className="rounded-2xl bg-brand-soft px-4 py-3.5 text-sm text-brand">
              บริการที่ขายดีที่สุดคือ <span className="font-semibold">{topService.serviceName}</span>{' '}
              — {topService.bookings} ครั้ง คิดเป็น {formatBaht(topService.revenue)}
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="บริการที่ขายได้" padded={false}>
              <Rows>
                {stats.services.map((row) => (
                  <li
                    key={row.serviceName}
                    className="flex items-center gap-4 px-4 py-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{row.serviceName}</span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-medium tabular-nums">
                        {formatBaht(row.revenue)}
                      </span>
                      <span className="block text-xs text-muted">{row.bookings} ครั้ง</span>
                    </span>
                  </li>
                ))}
              </Rows>
            </Card>

            {stats.staff.length > 0 ? (
              <Card title="รายช่าง" padded={false}>
                <Rows>
                  {stats.staff.map((row) => (
                    <li key={row.staffName} className="flex items-center gap-4 px-4 py-3">
                      <span className="min-w-0 flex-1 truncate text-sm">{row.staffName}</span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-medium tabular-nums">
                          {formatBaht(row.revenue)}
                        </span>
                        <span className="block text-xs text-muted">{row.bookings} คิว</span>
                      </span>
                    </li>
                  ))}
                </Rows>
              </Card>
            ) : null}
          </div>

          {reports ? <RevenueChart range={range} buckets={stats.buckets} /> : null}
        </>
      )}
    </PageBody>
  );
}

/** numeric(10,2) in, grouped baht out. Display only. */
function formatBaht(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `฿${amount}`;
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}
