/**
 * Display formatting for the customer screens.
 * Money arrives as a numeric(10,2) string; it is never turned into a float for
 * arithmetic, only for display.
 */
import { DateTime } from 'luxon';
import { THAI_MONTHS_SHORT, thaiWeekdayShort } from '@/lib/time/thai';

export { thaiDateFull, thaiDateShort, thaiTimeRange, thaiDayMonth } from '@/lib/time/thai';

/**
 * Split the currency symbol off the digits. `tabular-nums` gives every glyph a
 * digit's advance width, and ฿ is wider — left together they overlap.
 */
export function splitBaht(value: string): { symbol: string; digits: string } {
  return value.startsWith('฿')
    ? { symbol: '฿', digits: value.slice(1) }
    : { symbol: '', digits: value };
}
export function formatBaht(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ชม.` : `${hours} ชม. ${rest} นาที`;
}

/**
 * A bare calendar date for the day strip. The string is already the shop's
 * local day, so it is parsed in that zone rather than converted.
 */
export function shortThaiDate(iso: string, zone: string): { day: string; date: string; month: string } {
  const dt = DateTime.fromISO(iso, { zone });
  return {
    day: thaiWeekdayShort(dt),
    date: String(dt.day),
    month: THAI_MONTHS_SHORT[dt.month - 1] ?? '',
  };
}

export function statusLabel(status: string): { label: string; tone: string } {
  switch (status) {
    case 'pending':
      return { label: 'รอยืนยัน', tone: 'bg-amber-100 text-amber-800' };
    case 'confirmed':
      return { label: 'ยืนยันแล้ว', tone: 'bg-teal-100 text-teal-800' };
    case 'in_progress':
      return { label: 'กำลังทำ', tone: 'bg-blue-100 text-blue-800' };
    case 'completed':
      return { label: 'เสร็จแล้ว', tone: 'bg-slate-100 text-slate-700' };
    case 'cancelled':
      return { label: 'ยกเลิกแล้ว', tone: 'bg-slate-100 text-slate-500' };
    case 'no_show':
      return { label: 'ไม่มา', tone: 'bg-red-100 text-red-700' };
    default:
      return { label: status, tone: 'bg-slate-100 text-slate-600' };
  }
}

/**
 * The letter to put in the circle.
 *
 * Taking the first character is wrong in Thai salons: staff are listed as
 * ช่างแนน, ช่างมิ้นท์, ช่างเบล, so every circle reads "ช" and the avatars
 * stop telling anyone apart. The title goes first, then the letter.
 */
const TITLES = ['ช่าง', 'คุณ', 'หมอ', 'พี่', 'น้อง', 'แม่'];

/** Thai vowels written to the LEFT of the consonant they are pronounced after. */
const LEADING_VOWELS = new Set(['เ', 'แ', 'โ', 'ใ', 'ไ']);

export function initialOf(name: string): string {
  const trimmed = name.trim();
  const bare =
    TITLES.reduce(
      (out, title) =>
        out.startsWith(title) && out.length > title.length ? out.slice(title.length) : out,
      trimmed,
    ).trim() || trimmed;

  const chars = [...bare];
  if (chars.length === 0) return '';
  // "แนน" starts with a vowel that is written before its consonant, so one
  // character alone is a mark floating on its own. Keep the consonant with it.
  return LEADING_VOWELS.has(chars[0]!) ? chars.slice(0, 2).join('') : chars[0]!;
}
