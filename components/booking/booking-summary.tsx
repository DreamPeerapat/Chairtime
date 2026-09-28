import { DateTime } from 'luxon';
import type { ServiceListItem, StaffListItem } from '@/lib/booking/queries';
import type { Slot } from './booking-flow';
import { formatBaht, formatDuration, splitBaht, thaiDateFull, thaiTimeRange } from './format';

/** What the customer is about to book, read back before they commit to it. */
export function BookingSummary({
  timezone,
  services,
  staff,
  slot,
}: {
  timezone: string;
  services: ServiceListItem[];
  staff: StaffListItem | null;
  slot: Slot;
}) {
  const start = DateTime.fromISO(slot.startsAt).setZone(timezone);
  const end = DateTime.fromISO(slot.endsAt).setZone(timezone);
  const total = services.reduce((sum, s) => sum + Math.round(Number(s.price) * 100), 0) / 100;

  return (
    <dl className="rounded-xl border border-line px-4 py-3 text-sm">
      <Row label="วันที่" value={thaiDateFull(start)} />
      <Row label="เวลา" value={thaiTimeRange(start, end)} />
      <Row label="ใช้เวลา" value={formatDuration(slot.durationMin)} />
      <Row label="บริการ" value={services.map((s) => s.name).join(', ')} />
      {staff ? <Row label="ช่าง" value={staff.name} /> : null}
      <Row label="รวม" value={formatBaht(total)} emphasis />
    </dl>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  const { symbol, digits } = splitBaht(value);
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 last:border-0/60">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={emphasis ? 'font-semibold' : 'text-right'}>
        {symbol ? <span className="mr-0.5">{symbol}</span> : null}
        <span className={emphasis ? 'tabular-nums' : ''}>{digits}</span>
      </dd>
    </div>
  );
}
