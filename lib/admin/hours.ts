/**
 * Opening hours as the shop actually experiences them: a weekday can have more
 * than one range, because most Thai salons close over lunch.
 *
 * `business_hour` has always allowed several rows per weekday — the seed uses
 * two for one of the salons. What could not express it was the editor, which
 * read one row per day with `find()` and wrote back whatever it had shown. That
 * silently deleted the afternoon of any shop that had one, so these helpers
 * exist to keep the grouping and the validation in one place, unit-tested,
 * rather than spread between a form and a server action.
 */
export interface HourRange {
  openTime: string; // HH:MM
  closeTime: string; // HH:MM
}

export interface WeekdayHours {
  weekday: number; // 0 = Sunday
  open: boolean;
  ranges: HourRange[];
}

export interface HourRow {
  weekday: number;
  openTime: string;
  closeTime: string;
}

/** How many ranges one weekday may hold. Morning, afternoon, evening is enough. */
export const MAX_RANGES_PER_DAY = 3;

const DEFAULT_RANGE: HourRange = { openTime: '10:00', closeTime: '20:00' };

/** Postgres hands back `HH:MM:SS`; the time input wants `HH:MM`. */
function toInputTime(value: string): string {
  return value.slice(0, 5);
}

/**
 * Turn the stored rows into one entry per weekday, keeping every range.
 * Days with no rows come back closed, carrying a sensible default so the
 * inputs are not empty the moment somebody ticks the box.
 */
export function groupByWeekday(rows: HourRow[]): WeekdayHours[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const ranges = rows
      .filter((row) => row.weekday === weekday)
      .map((row) => ({
        openTime: toInputTime(row.openTime),
        closeTime: toInputTime(row.closeTime),
      }))
      .sort((a, b) => a.openTime.localeCompare(b.openTime));

    return {
      weekday,
      open: ranges.length > 0,
      ranges: ranges.length > 0 ? ranges : [{ ...DEFAULT_RANGE }],
    };
  });
}

/** Flatten the editor's shape back into rows, dropping the closed days. */
export function toRows(days: WeekdayHours[]): HourRow[] {
  return days
    .filter((day) => day.open)
    .flatMap((day) =>
      day.ranges.map((range) => ({
        weekday: day.weekday,
        openTime: range.openTime,
        closeTime: range.closeTime,
      })),
    );
}

const WEEKDAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

/**
 * Reject what the database would accept but a shop could never mean.
 *
 * The CHECK constraint on business_hour only proves close > open for a single
 * row; nothing stops two rows on the same day from overlapping, and overlapping
 * opening hours would feed the availability engine the same minute twice.
 *
 * Returns a Thai message for the first problem found, or null when the week is
 * fine — the caller decides whether that becomes a form error or an action
 * failure.
 */
export function validateHourRows(rows: HourRow[]): string | null {
  for (const row of rows) {
    if (row.closeTime <= row.openTime) {
      return `เวลาปิดต้องหลังเวลาเปิด (${row.openTime}–${row.closeTime})`;
    }
  }

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const ofDay = rows
      .filter((row) => row.weekday === weekday)
      .sort((a, b) => a.openTime.localeCompare(b.openTime));

    if (ofDay.length > MAX_RANGES_PER_DAY) {
      return `วัน${WEEKDAY_NAMES[weekday]} ตั้งได้ไม่เกิน ${MAX_RANGES_PER_DAY} ช่วง`;
    }

    for (let i = 1; i < ofDay.length; i += 1) {
      const previous = ofDay[i - 1]!;
      const current = ofDay[i]!;
      if (current.openTime < previous.closeTime) {
        return `วัน${WEEKDAY_NAMES[weekday]} มีช่วงเวลาทับกัน (${previous.openTime}–${previous.closeTime} กับ ${current.openTime}–${current.closeTime})`;
      }
    }
  }

  return null;
}
