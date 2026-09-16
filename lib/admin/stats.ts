/**
 * What the shop actually made, and from what.
 *
 * Only `completed` bookings count. A confirmed booking is a promise, and a
 * cancelled or no-show one is a hole in the day — counting either as revenue
 * makes the number flattering and useless. Iron rule #5: totals are summed in
 * satang as integers and only turned back into baht for display.
 *
 * The boundaries are calendar boundaries in the shop's own timezone, not UTC:
 * "this month" for a Bangkok salon ends at 23:59 Bangkok on the last day, and
 * a Sunday-evening booking must not land in the following week's figure.
 */
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';

export type StatsRange = 'week' | 'month' | 'year';

export interface Period {
  start: DateTime;
  end: DateTime;
  label: string;
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/**
 * The window a range name means, around the given day in the shop's zone.
 *
 * Anchored on a date rather than counted back from today, so a period can be
 * named in a URL: drilling from a month into one of its weeks is a link to
 * that week's own date, and the same link still means the same week next
 * month.
 */
export function periodFor(range: StatsRange, now: DateTime, offset = 0): Period {
  if (range === 'week') {
    // Luxon weeks start on Monday, which is what a Thai shop's week does too.
    const start = now.startOf('week').plus({ weeks: offset });
    const end = start.plus({ weeks: 1 });
    return {
      start,
      end,
      label: `${start.day} ${THAI_MONTHS[start.month - 1]} – ${end.minus({ days: 1 }).day} ${THAI_MONTHS[end.minus({ days: 1 }).month - 1]}`,
    };
  }

  if (range === 'month') {
    const start = now.startOf('month').plus({ months: offset });
    return {
      start,
      end: start.plus({ months: 1 }),
      // Thai years are Buddhist era: 2026 CE is 2569 BE.
      label: `${THAI_MONTHS[start.month - 1]} ${start.year + 543}`,
    };
  }

  const start = now.startOf('year').plus({ years: offset });
  return { start, end: start.plus({ years: 1 }), label: `ปี ${start.year + 543}` };
}

export interface ServiceSales {
  serviceName: string;
  bookings: number;
  revenue: string;
}

export interface StaffSales {
  staffName: string;
  bookings: number;
  revenue: string;
}

/** One column of the chart, and where clicking it goes. */
export interface Bucket {
  /** the day this bucket starts on, which is also the drill-down anchor */
  key: string;
  label: string;
  revenue: string;
  bookings: number;
  /** the narrower range to open, or null when there is nothing narrower */
  drillTo: StatsRange | null;
}

export interface PeriodStats {
  period: Period;
  /** completed bookings — the ones that turned into money */
  completed: number;
  cancelled: number;
  noShow: number;
  revenue: string;
  /** what the average customer spent, over completed bookings only */
  averageTicket: string;
  services: ServiceSales[];
  staff: StaffSales[];
  /** completed revenue per day */
  daily: Array<{ date: string; revenue: string; bookings: number }>;
  /** the chart: days in a week, weeks in a month, months in a year */
  buckets: Bucket[];
}

export async function loadPeriodStats(
  tenantId: string,
  range: StatsRange,
  timezone: string,
  anchor: DateTime = DateTime.now(),
): Promise<PeriodStats> {
  const period = periodFor(range, anchor.setZone(timezone));
  return withTenant(tenantId, (tx) => gather(tx, tenantId, range, period, timezone));
}

async function gather(
  tx: TenantTx,
  tenantId: string,
  range: StatsRange,
  period: Period,
  timezone: string,
): Promise<PeriodStats> {
  const from = period.start.toJSDate();
  const to = period.end.toJSDate();

  const inWindow = and(
    eq(schema.booking.tenantId, tenantId),
    gte(schema.booking.startsAt, from),
    lt(schema.booking.startsAt, to),
  );

  const bookings = await tx
    .select({
      id: schema.booking.id,
      status: schema.booking.status,
      total: schema.booking.total,
      startsAt: schema.booking.startsAt,
    })
    .from(schema.booking)
    .where(inWindow);

  const completed = bookings.filter((b) => b.status === 'completed');
  const completedIds = completed.map((b) => b.id);
  const revenueSatang = completed.reduce((sum, b) => sum + toSatang(b.total), 0);

  // Per service, from the line items rather than the booking total: a visit
  // with a cut and a colour has to count for both, and the item carries the
  // price as it was on the day.
  const itemRows = completed.length
    ? await tx
        .select({
          serviceName: schema.bookingItem.serviceName,
          price: schema.bookingItem.price,
          bookingId: schema.bookingItem.bookingId,
        })
        .from(schema.bookingItem)
        .where(inArray(schema.bookingItem.bookingId, completedIds))
    : [];

  const byService = new Map<string, { bookings: number; satang: number }>();
  for (const row of itemRows) {
    const entry = byService.get(row.serviceName) ?? { bookings: 0, satang: 0 };
    entry.bookings += 1;
    entry.satang += toSatang(row.price);
    byService.set(row.serviceName, entry);
  }

  const staffRows = completed.length
    ? await tx
        .select({
          bookingId: schema.bookingItem.bookingId,
          staffName: schema.resource.name,
          isHuman: schema.resourceType.isHuman,
          price: schema.bookingItem.price,
        })
        .from(schema.resourceAllocation)
        .innerJoin(
          schema.bookingItem,
          eq(schema.bookingItem.id, schema.resourceAllocation.bookingItemId),
        )
        .innerJoin(schema.resource, eq(schema.resource.id, schema.resourceAllocation.resourceId))
        .innerJoin(schema.resourceType, eq(schema.resourceType.id, schema.resource.resourceTypeId))
        .where(
          and(
            eq(schema.resourceAllocation.tenantId, tenantId),
            inArray(schema.bookingItem.bookingId, completedIds),
          ),
        )
    : [];

  const byStaff = new Map<string, { bookings: number; satang: number }>();
  const seenItem = new Set<string>();
  for (const row of staffRows) {
    if (!row.isHuman) continue;
    // A service held across a passive stretch has more than one allocation
    // row; counting each would inflate both the tally and the takings.
    const key = `${row.staffName}:${row.bookingId}`;
    const entry = byStaff.get(row.staffName) ?? { bookings: 0, satang: 0 };
    if (!seenItem.has(key)) {
      entry.bookings += 1;
      entry.satang += toSatang(row.price);
      seenItem.add(key);
    }
    byStaff.set(row.staffName, entry);
  }

  const daily = new Map<string, { satang: number; bookings: number }>();
  for (const b of completed) {
    const day = DateTime.fromJSDate(b.startsAt).setZone(timezone).toISODate()!;
    const entry = daily.get(day) ?? { satang: 0, bookings: 0 };
    entry.satang += toSatang(b.total);
    entry.bookings += 1;
    daily.set(day, entry);
  }

  return {
    period,
    completed: completed.length,
    cancelled: bookings.filter((b) => b.status === 'cancelled').length,
    noShow: bookings.filter((b) => b.status === 'no_show').length,
    revenue: fromSatang(revenueSatang),
    averageTicket: fromSatang(completed.length ? Math.round(revenueSatang / completed.length) : 0),
    services: [...byService.entries()]
      .map(([serviceName, v]) => ({
        serviceName,
        bookings: v.bookings,
        revenue: fromSatang(v.satang),
      }))
      .sort((a, b) => b.bookings - a.bookings || Number(b.revenue) - Number(a.revenue)),
    staff: [...byStaff.entries()]
      .map(([staffName, v]) => ({ staffName, bookings: v.bookings, revenue: fromSatang(v.satang) }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue)),
    daily: [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, revenue: fromSatang(v.satang), bookings: v.bookings })),
    buckets: bucketise(range, period, daily, timezone),
  };
}

/**
 * The columns of the chart.
 *
 * Built from the period rather than from the data, so an empty Tuesday is a
 * gap in the row instead of a missing bar — a chart that silently drops quiet
 * days makes a bad week look like a short one.
 */
function bucketise(
  range: StatsRange,
  period: Period,
  daily: Map<string, { satang: number; bookings: number }>,
  timezone: string,
): Bucket[] {
  const step = range === 'week' ? 'day' : range === 'month' ? 'week' : 'month';
  const buckets: Bucket[] = [];

  let cursor = step === 'week' ? maxOf(period.start.startOf('week'), period.start) : period.start;

  while (cursor < period.end) {
    // A week overlapping the end of a month is cut at the month boundary, so
    // its takings are not counted twice across two months.
    const next = minOf(cursor.plus({ [`${step}s`]: 1 }).startOf(step), period.end);

    let satang = 0;
    let bookings = 0;
    for (let day = cursor; day < next; day = day.plus({ days: 1 })) {
      const entry = daily.get(day.toISODate()!);
      if (!entry) continue;
      satang += entry.satang;
      bookings += entry.bookings;
    }

    buckets.push({
      key: cursor.toISODate()!,
      label: labelFor(step, cursor, next),
      revenue: fromSatang(satang),
      bookings,
      drillTo: step === 'day' ? null : step === 'week' ? 'week' : 'month',
    });

    cursor = next;
  }

  return buckets.map((b) => ({ ...b, key: DateTime.fromISO(b.key, { zone: timezone }).toISODate()! }));
}

const THAI_WEEKDAYS = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

function labelFor(step: 'day' | 'week' | 'month', start: DateTime, end: DateTime): string {
  if (step === 'day') return `${THAI_WEEKDAYS[start.weekday - 1]} ${start.day}`;
  if (step === 'month') return THAI_MONTHS[start.month - 1]!.slice(0, 3);
  const last = end.minus({ days: 1 });
  return start.month === last.month ? `${start.day}–${last.day}` : `${start.day}–${last.day} ${THAI_MONTHS[last.month - 1]!.slice(0, 3)}`;
}

function minOf(a: DateTime, b: DateTime): DateTime {
  return a < b ? a : b;
}

function maxOf(a: DateTime, b: DateTime): DateTime {
  return a > b ? a : b;
}

/** numeric(10,2) string to integer satang — never a float. */
function toSatang(amount: string): number {
  return Math.round(Number(amount) * 100);
}

function fromSatang(satang: number): string {
  return (satang / 100).toFixed(2);
}
