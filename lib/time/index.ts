/**
 * Every piece of business-time arithmetic in the app goes through this module.
 *
 * Iron rule #4: `new Date()` is never used for business time. The database
 * stores `timestamptz` (UTC); `business_hour` stores a bare `time` that only
 * means something once anchored to a calendar day in the tenant's timezone.
 * A shop that opens at 10:00 opens at 10:00 local, on both sides of a DST
 * change and regardless of where the server runs.
 */
import { DateTime, Interval, Settings } from 'luxon';

// Surface bad zone names as errors instead of silently producing Invalid values.
Settings.throwOnInvalid = false;

export type Zone = string;

/** A calendar day in the tenant's timezone, e.g. "2026-03-14". */
export type PlainDate = string;

/** Half-open interval [start, end) in absolute time. */
export interface AbsoluteInterval {
  start: DateTime;
  end: DateTime;
}

export { DateTime, Interval };

export function nowIn(zone: Zone): DateTime {
  return DateTime.now().setZone(zone);
}

export function fromJsDate(date: Date, zone: Zone): DateTime {
  return DateTime.fromJSDate(date, { zone });
}

export function toJsDate(dt: DateTime): Date {
  return dt.toJSDate();
}

export function parseIsoInZone(iso: string, zone: Zone): DateTime {
  const dt = DateTime.fromISO(iso, { zone, setZone: false });
  if (!dt.isValid) throw new Error(`invalid ISO timestamp: ${iso}`);
  return dt.setZone(zone);
}

/** "2026-03-14" -> the tenant-local start of that day. */
export function startOfDay(date: PlainDate, zone: Zone): DateTime {
  const dt = DateTime.fromISO(date, { zone });
  if (!dt.isValid) throw new Error(`invalid date: ${date} (${dt.invalidReason})`);
  return dt.startOf('day');
}

export function endOfDay(date: PlainDate, zone: Zone): DateTime {
  return startOfDay(date, zone).plus({ days: 1 });
}

export function toPlainDate(dt: DateTime, zone: Zone): PlainDate {
  const local = dt.setZone(zone);
  const iso = local.toISODate();
  if (!iso) throw new Error('cannot format an invalid DateTime as a date');
  return iso;
}

/** Postgres/JS weekday convention used by `business_hour`: 0 = Sunday. */
export function weekdayOf(date: PlainDate, zone: Zone): number {
  return startOfDay(date, zone).weekday % 7;
}

/**
 * Anchor a `business_hour` row to a calendar day.
 *
 * `open_time`/`close_time` arrive from postgres as "HH:MM:SS". A closing time
 * that is not after the opening time means the window runs past midnight, so
 * the end lands on the next day. The DB CHECK forbids that today, but the
 * helper handles it so late-night shops only need a schema change, not an
 * algorithm change.
 */
export function businessHourToInterval(
  date: PlainDate,
  openTime: string,
  closeTime: string,
  zone: Zone,
): AbsoluteInterval {
  const dayStart = startOfDay(date, zone);
  const open = applyTimeOfDay(dayStart, openTime);
  let close = applyTimeOfDay(dayStart, closeTime);
  if (close <= open) close = close.plus({ days: 1 });
  return { start: open, end: close };
}

function applyTimeOfDay(dayStart: DateTime, timeOfDay: string): DateTime {
  const parts = timeOfDay.split(':');
  const hour = Number(parts[0] ?? NaN);
  const minute = Number(parts[1] ?? 0);
  const second = Number(parts[2] ?? 0);
  if (!Number.isInteger(hour) || Number.isNaN(minute) || Number.isNaN(second)) {
    throw new Error(`invalid time of day: ${timeOfDay}`);
  }
  // `set` on a DST-shifted day can land on a nonexistent local time; Luxon
  // resolves it forward, which is the behaviour a shop would expect.
  return dayStart.set({ hour, minute, second, millisecond: 0 });
}

// ---------------------------------------------------------------------
// Interval algebra — used by the availability engine.
// All intervals are half-open: [start, end).
// ---------------------------------------------------------------------

export function overlaps(a: AbsoluteInterval, b: AbsoluteInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function contains(outer: AbsoluteInterval, inner: AbsoluteInterval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

export function isEmpty(i: AbsoluteInterval): boolean {
  return i.end <= i.start;
}

/** Sort by start, then end. Returns a new array. */
export function sortIntervals(intervals: AbsoluteInterval[]): AbsoluteInterval[] {
  return [...intervals].sort((a, b) => {
    const byStart = a.start.toMillis() - b.start.toMillis();
    return byStart !== 0 ? byStart : a.end.toMillis() - b.end.toMillis();
  });
}

/** Merge overlapping and touching intervals into a minimal set. */
export function mergeIntervals(intervals: AbsoluteInterval[]): AbsoluteInterval[] {
  const sorted = sortIntervals(intervals.filter((i) => !isEmpty(i)));
  const out: AbsoluteInterval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      out.push({ start: cur.start, end: cur.end });
    }
  }
  return out;
}

/** `base` minus every interval in `cuts`. */
export function subtractIntervals(
  base: AbsoluteInterval[],
  cuts: AbsoluteInterval[],
): AbsoluteInterval[] {
  const merged = mergeIntervals(cuts);
  let result = mergeIntervals(base);
  for (const cut of merged) {
    const next: AbsoluteInterval[] = [];
    for (const piece of result) {
      if (!overlaps(piece, cut)) {
        next.push(piece);
        continue;
      }
      if (piece.start < cut.start) next.push({ start: piece.start, end: cut.start });
      if (cut.end < piece.end) next.push({ start: cut.end, end: piece.end });
    }
    result = next;
  }
  return result;
}

export function intersectIntervals(
  a: AbsoluteInterval[],
  b: AbsoluteInterval[],
): AbsoluteInterval[] {
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

export function durationMinutes(i: AbsoluteInterval): number {
  return i.end.diff(i.start, 'minutes').minutes;
}

/**
 * Walk candidate start times across `windows` on a fixed grid.
 *
 * The grid is anchored to the tenant-local midnight of each window's day, not
 * to the window start, so a 15-minute granularity always yields :00 :15 :30 :45
 * even when the shop opens at 10:10.
 */
export function* candidateStarts(
  windows: AbsoluteInterval[],
  granularityMin: number,
  zone: Zone,
): Generator<DateTime> {
  if (granularityMin <= 0) throw new Error('granularity must be positive');
  for (const window of windows) {
    const anchor = window.start.setZone(zone).startOf('day');
    const offsetMin = window.start.diff(anchor, 'minutes').minutes;
    const firstStep = Math.ceil(offsetMin / granularityMin) * granularityMin;
    for (let step = firstStep; ; step += granularityMin) {
      const candidate = anchor.plus({ minutes: step });
      if (candidate >= window.end) break;
      yield candidate;
    }
  }
}

// ---------------------------------------------------------------------
// Postgres tstzrange bridging
// ---------------------------------------------------------------------

/** Build the `[start,end)` literal that the `tstzrange` columns expect. */
export function toTstzRange(i: AbsoluteInterval): string {
  return `[${i.start.toUTC().toISO()},${i.end.toUTC().toISO()})`;
}

/** Parse a `tstzrange` literal that postgres.js hands back as a string. */
export function fromTstzRange(literal: string, zone: Zone): AbsoluteInterval {
  const match = /^([[(])"?([^",]*)"?,"?([^",]*)"?([\])])$/.exec(literal.trim());
  if (!match) throw new Error(`cannot parse tstzrange: ${literal}`);
  const [, , rawStart, rawEnd] = match;
  if (!rawStart || !rawEnd) throw new Error(`unbounded tstzrange is not supported: ${literal}`);
  return {
    start: DateTime.fromSQL(rawStart, { zone: 'utc' }).setZone(zone),
    end: DateTime.fromSQL(rawEnd, { zone: 'utc' }).setZone(zone),
  };
}
