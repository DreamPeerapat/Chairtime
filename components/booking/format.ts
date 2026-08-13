/**
 * Display formatting for the customer screens.
 * Money arrives as a numeric(10,2) string; it is never turned into a float for
 * arithmetic, only for display.
 */
const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

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

export function shortThaiDate(iso: string, zone: string): { day: string; date: string; month: string } {
  const dt = new Date(`${iso}T00:00:00`);
  // Rendering a bare calendar date needs no timezone conversion: the string is
  // already the tenant-local day.
  void zone;
  return {
    day: THAI_DAYS[dt.getDay()] ?? '',
    date: String(dt.getDate()),
    month: THAI_MONTHS[dt.getMonth()] ?? '',
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
