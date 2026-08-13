'use client';

/**
 * The panel that opens when staff tap a booking. Status changes live here
 * because they are the second most frequent action after looking at the day.
 */
import { useState, useTransition } from 'react';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import type { CalendarBooking } from '@/lib/admin/queries';
import { setBookingStatus } from '@/lib/admin/actions';
import { formatBaht, statusLabel } from '@/components/booking/format';

const TRANSITIONS: Array<{ status: string; label: string; tone: string }> = [
  { status: 'confirmed', label: 'ยืนยันแล้ว', tone: 'bg-teal-700 text-white' },
  { status: 'in_progress', label: 'กำลังทำ', tone: 'bg-blue-600 text-white' },
  { status: 'completed', label: 'เสร็จแล้ว', tone: 'bg-slate-700 text-white' },
  { status: 'no_show', label: 'ไม่มา', tone: 'bg-red-600 text-white' },
  { status: 'cancelled', label: 'ยกเลิก', tone: 'border border-red-300 text-red-700' },
];

export function BookingDrawer({
  booking,
  timezone,
  onClose,
  onChanged,
}: {
  booking: CalendarBooking;
  timezone: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = DateTime.fromISO(booking.startsAt).setZone(timezone);
  const end = DateTime.fromISO(booking.endsAt).setZone(timezone);
  const status = statusLabel(booking.status);

  function change(next: string) {
    setError(null);
    startTransition(async () => {
      const result = await setBookingStatus({ bookingId: booking.id, status: next });
      if (result.ok) onChanged();
      else setError(result.error ?? 'เปลี่ยนสถานะไม่สำเร็จ');
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{booking.customerName}</h2>
            <p className="font-mono text-xs text-slate-500">{booking.code}</p>
          </div>
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', status.tone)}>
            {status.label}
          </span>
        </div>

        <dl className="mt-4 flex flex-col gap-1.5 text-sm">
          <Row label="เวลา" value={`${start.toFormat('HH:mm')} - ${end.toFormat('HH:mm')} น.`} />
          <Row label="บริการ" value={booking.services.join(', ')} />
          {booking.staffName ? <Row label="ช่าง" value={booking.staffName} /> : null}
          {booking.spaceName ? <Row label="ที่นั่ง" value={booking.spaceName} /> : null}
          {booking.customerPhone ? (
            <Row label="เบอร์" value={booking.customerPhone} href={`tel:${booking.customerPhone}`} />
          ) : null}
          <Row label="ยอด" value={formatBaht(booking.total)} />
          <Row label="ช่องทาง" value={sourceLabel(booking.source)} />
        </dl>

        {booking.customerNote ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {booking.customerNote}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {TRANSITIONS.filter((t) => t.status !== booking.status).map((transition) => (
            <button
              key={transition.status}
              type="button"
              disabled={pending}
              onClick={() => change(transition.status)}
              className={cn('rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50', transition.tone)}
            >
              {transition.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-sm dark:border-slate-800"
        >
          ปิด
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right">
        {href ? (
          <a href={href} className="text-teal-700 underline dark:text-teal-400">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'online':
      return 'จองออนไลน์';
    case 'walk_in':
      return 'Walk-in';
    case 'phone':
      return 'โทรจอง';
    case 'admin':
      return 'ร้านสร้างเอง';
    default:
      return source;
  }
}
