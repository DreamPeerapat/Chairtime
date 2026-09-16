import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { requireSession } from '@/lib/auth';
import { db, schema } from '@/lib/db/client';
import { loadPeriodStats, type StatsRange } from '@/lib/admin/stats';
import { SummaryView } from '@/components/admin/summary-view';

export const dynamic = 'force-dynamic';

const RANGES: StatsRange[] = ['week', 'month', 'year'];

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; back?: string }>;
}) {
  // 'manager', not 'owner': the person who runs the floor needs to know which
  // service sells, and it is the billing page that is the owner's alone.
  const session = await requireSession('manager');
  const params = await searchParams;

  const range = RANGES.includes(params.range as StatsRange)
    ? (params.range as StatsRange)
    : 'month';

  // How many periods back, clamped: the query is cheap but an unbounded number
  // from the URL is still a number from the URL.
  const back = Math.min(Math.max(Number(params.back ?? 0) || 0, 0), 60);

  const [tenant] = await db
    .select({ timezone: schema.tenant.timezone })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, session.tenantId));

  const timezone = tenant?.timezone ?? 'Asia/Bangkok';
  const stats = await loadPeriodStats(
    session.tenantId,
    range,
    timezone,
    DateTime.now(),
    -back,
  );

  return (
    <SummaryView
      range={range}
      back={back}
      timezone={timezone}
      stats={{
        periodLabel: stats.period.label,
        completed: stats.completed,
        cancelled: stats.cancelled,
        noShow: stats.noShow,
        revenue: stats.revenue,
        averageTicket: stats.averageTicket,
        services: stats.services,
        staff: stats.staff,
        daily: stats.daily,
      }}
    />
  );
}
