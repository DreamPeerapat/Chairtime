/**
 * Thai date formatting, shared by the screens and the LINE messages.
 *
 * Thai users read years in the Buddhist era (2026 CE = 2569 BE). Having the
 * confirmation page say 2026 and the LINE message that follows it say 2569 is
 * the kind of small inconsistency that makes a shop distrust the whole thing,
 * so both sides come from here.
 */
import type { DateTime } from 'luxon';

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const THAI_DAYS_FULL = [
  'อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์',
];

const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** Luxon counts Monday as 1; the Thai arrays start at Sunday. */
function dayIndex(dt: DateTime): number {
  return dt.weekday % 7;
}

export function buddhistYear(dt: DateTime): number {
  return dt.year + 543;
}

/** "จันทร์ 16 มี.ค. 2569" */
export function thaiDateShort(dt: DateTime): string {
  return `${THAI_DAYS_FULL[dayIndex(dt)]} ${dt.day} ${THAI_MONTHS_SHORT[dt.month - 1]} ${buddhistYear(dt)}`;
}

/** "วันจันทร์ที่ 16 มีนาคม 2569" */
export function thaiDateFull(dt: DateTime): string {
  return `วัน${THAI_DAYS_FULL[dayIndex(dt)]}ที่ ${dt.day} ${THAI_MONTHS_FULL[dt.month - 1]} ${buddhistYear(dt)}`;
}

/** "13 ส.ค." — for compact headers where the year is obvious. */
export function thaiDayMonth(dt: DateTime): string {
  return `${dt.day} ${THAI_MONTHS_SHORT[dt.month - 1]}`;
}

export function thaiWeekdayShort(dt: DateTime): string {
  return THAI_DAYS_SHORT[dayIndex(dt)] ?? '';
}

export function thaiTimeRange(start: DateTime, end: DateTime): string {
  return `${start.toFormat('HH:mm')} - ${end.toFormat('HH:mm')} น.`;
}

export { THAI_DAYS_SHORT, THAI_MONTHS_SHORT };
