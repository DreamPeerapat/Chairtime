/**
 * Step 1 and part of step 4 of docs/logic.md §1 — turning the weekly opening
 * hours into concrete intervals on a concrete day, and working out when each
 * resource is actually free.
 */
import type { AbsoluteInterval, PlainDate, Zone } from '@/lib/time';
import {
  businessHourToInterval,
  mergeIntervals,
  subtractIntervals,
  weekdayOf,
} from '@/lib/time';
import type { AvailabilityContext, BusyInterval, ResourceSpec } from './types';

export type WeeklyHours = Map<number, Array<{ openTime: string; closeTime: string }>>;

/**
 * A shop open 18:00-02:00 is open on the requested day both from its own row
 * and from the previous day's row spilling over midnight, so the neighbouring
 * days are always expanded too and the result merged.
 */
export function expandWeeklyHours(
  hours: WeeklyHours,
  date: PlainDate,
  zone: Zone,
): AbsoluteInterval[] {
  const out: AbsoluteInterval[] = [];
  for (const dayOffset of [-1, 0, 1]) {
    const day = shiftDate(date, dayOffset, zone);
    const rows = hours.get(weekdayOf(day, zone)) ?? [];
    for (const row of rows) {
      out.push(businessHourToInterval(day, row.openTime, row.closeTime, zone));
    }
  }
  return mergeIntervals(out);
}

function shiftDate(date: PlainDate, days: number, zone: Zone): PlainDate {
  const iso = businessHourToInterval(date, '00:00:00', '23:59:59', zone)
    .start.plus({ days })
    .setZone(zone)
    .toISODate();
  if (!iso) throw new Error(`cannot shift date ${date}`);
  return iso;
}

/** When the shop itself is open, closures already removed. */
export function shopOpenWindows(ctx: AvailabilityContext, date: PlainDate): AbsoluteInterval[] {
  const open = expandWeeklyHours(ctx.shopHours, date, ctx.timezone);
  return subtractIntervals(open, ctx.shopClosures);
}

/**
 * When a single resource can be used: the shop's open windows, narrowed to the
 * resource's own roster if it has one, minus everything already booked for it.
 */
export function resourceFreeWindows(
  resource: ResourceSpec,
  shopWindows: AbsoluteInterval[],
  busyByResource: Map<string, AbsoluteInterval[]>,
  date: PlainDate,
  zone: Zone,
): AbsoluteInterval[] {
  let windows = shopWindows;
  if (resource.hours) {
    const own = expandWeeklyHours(resource.hours, date, zone);
    windows = intersect(windows, own);
  }
  const busy = busyByResource.get(resource.id);
  return busy ? subtractIntervals(windows, busy) : mergeIntervals(windows);
}

function intersect(a: AbsoluteInterval[], b: AbsoluteInterval[]): AbsoluteInterval[] {
  const left = mergeIntervals(a);
  const right = mergeIntervals(b);
  const out: AbsoluteInterval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const l = left[i]!;
    const r = right[j]!;
    const start = l.start > r.start ? l.start : r.start;
    const end = l.end < r.end ? l.end : r.end;
    if (start < end) out.push({ start, end });
    if (l.end < r.end) i += 1;
    else j += 1;
  }
  return out;
}

export function groupBusyByResource(busy: BusyInterval[]): Map<string, AbsoluteInterval[]> {
  const map = new Map<string, AbsoluteInterval[]>();
  for (const entry of busy) {
    const list = map.get(entry.resourceId);
    const interval = { start: entry.start, end: entry.end };
    if (list) list.push(interval);
    else map.set(entry.resourceId, [interval]);
  }
  for (const [key, list] of map) map.set(key, mergeIntervals(list));
  return map;
}

/** True when every span sits inside one of the free windows. */
export function coversAll(windows: AbsoluteInterval[], spans: AbsoluteInterval[]): boolean {
  return spans.every((span) =>
    windows.some((w) => w.start <= span.start && span.end <= w.end),
  );
}
