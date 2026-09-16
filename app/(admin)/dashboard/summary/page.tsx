import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { requireSession } from '@/lib/auth';
import { db, schema } from '@/lib/db/client';
import { loadPeriodStats, periodFor, type StatsRange } from '@/lib/admin/stats';
import { SummaryView } from '@/components/admin/summary-view';

export const dynamic = 'force-dynamic';

const RANGES: StatsRange[] = ['week', 'month', 'year'];

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; at?: string }>;
}) {
  // 'manager', not 'owner': the person who runs the floor needs to know which
  // service sells, and it is the billing page that is the owner's alone.
  const session = await requireSession('manager');
  const params = await searchParams;

  const range = RANGES.includes(params.range as StatsRange)
    ? (params.range as StatsRange)
    : 'month';

  const [tenant] = await db
    .select({ timezone: schema.tenant.timezone })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, session.tenantId));

  const timezone = tenant?.timezone ?? 'Asia/Bangkok';

  // The period is named by a date rather than by "N periods back", so a link
  // to one week still means that week tomorrow — which is what makes drilling
  // from a month into one of its weeks a plain link.
  const anchor =
    params.at && /^\d{4}-\d{2}-\d{2}$/.test(params.at)
      ? DateTime.fromISO(params.at, { zone: timezone })
      : DateTime.now().setZone(timezone);

  const valid = anchor.isValid ? anchor : DateTime.now().setZone(timezone);
  const stats = await loadPeriodStats(session.tenantId, range, timezone, valid);

  const previous = periodFor(range, stats.period.start.minus({ days: 1 }));
  const next = periodFor(range, stats.period.end);
  const isCurrent = stats.period.end > DateTime.now().setZone(timezone);

  return (
    <SummaryView
      range={range}
      timezone={timezone}
      previousAt={previous.start.toISODate()!}
      nextAt={isCurrent ? null : next.start.toISODate()!}
      stats={{
        periodLabel: stats.period.label,
        completed: stats.completed,
        cancelled: stats.cancelled,
        noShow: stats.noShow,
        revenue: stats.revenue,
        averageTicket: stats.averageTicket,
        services: stats.services,
        staff: stats.staff,
        buckets: stats.buckets,
      }}
    />
  );
}
