'use client';

/**
 * The panel that opens when staff tap a booking. Status changes live here
 * because they are the second most frequent action after looking at the day.
 */
import Image from 'next/image';
import { LOYALTY_ENABLED } from '@/lib/features';
import { MODAL_TITLE_ID, Modal } from '@/components/ui/modal';
import { useState, useTransition } from 'react';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import type { CalendarBooking } from '@/lib/admin/queries';
import { setBookingStatus } from '@/lib/admin/actions';
import { formatBaht, statusLabel, thaiTimeRange } from '@/components/booking/format';

/**
 * What staff can do to a booking that is still live.
 *
 * "กำลังทำ" is gone. It was a button somebody had to remember to press while
 * holding scissors, it changed nothing the shop could see, and forgetting it
 * made the calendar wrong — the only states worth a tap are the ones that end
 * the appointment.
 */
const TRANSITIONS: Array<{ status: string; label: string; tone: string }> = [
  { status: 'confirmed', label: 'ยืนยันแล้ว', tone: 'bg-teal-700 text-white' },
  { status: 'completed', label: 'เสร็จแล้ว', tone: 'bg-slate-700 text-white' },
  { status: 'no_show', label: 'ไม่มา', tone: 'bg-red-600 text-white' },
  { status: 'cancelled', label: 'ยกเลิก', tone: 'border border-red-300 text-red-700' },
];

/**
 * A booking that has already ended offers nothing to press.
 *
 * Cancelled is the one that mattered: the row was still showing every button,
 * so "ยืนยันแล้ว" on a cancelled booking would put it back on the calendar
 * without re-checking that the time is still free.
 */
const FINISHED = ['cancelled', 'completed', 'no_show'];

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
  const [redeemPoints, setRedeemPoints] = useState('');

  const start = DateTime.fromISO(booking.startsAt).setZone(timezone);
  const end = DateTime.fromISO(booking.endsAt).setZone(timezone);
  const status = statusLabel(booking.status);

  function change(next: string) {
    setError(null);
    const points = next === 'completed' ? Number(redeemPoints || 0) : undefined;
    startTransition(async () => {
      const result = await setBookingStatus({ bookingId: booking.id, status: next, redeemPoints: points });
      if (result.ok) onChanged();
      else setError(result.error ?? 'เปลี่ยนสถานะไม่สำเร็จ');
    });
  }

  return (
    <Modal onClose={onClose} labelledBy={MODAL_TITLE_ID}>
      {(close) => (
        <>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={MODAL_TITLE_ID} className="text-lg font-semibold">
              {booking.customerName}
            </h2>
            <p className="font-mono text-xs text-slate-500">{booking.code}</p>
          </div>
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', status.tone)}>
            {status.label}
          </span>
        </div>

        <dl className="mt-4 flex flex-col gap-1.5 text-sm">
          <Row label="เวลา" value={thaiTimeRange(start, end)} />
          <Row label="บริการ" value={booking.services.join(', ')} />
          {booking.staffName ? <Row label="ช่าง" value={booking.staffName} /> : null}
          {booking.spaceName ? <Row label="ที่นั่ง" value={booking.spaceName} /> : null}
          {booking.customerPhone ? (
            <Row label="เบอร์" value={booking.customerPhone} href={`tel:${booking.customerPhone}`} />
          ) : null}
          <Row label="ยอด" value={formatBaht(booking.total)} />
          <Row label="ช่องทาง" value={sourceLabel(booking.source)} />
        </dl>

        {booking.referenceImages.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              รูปตัวอย่างจากลูกค้า
            </p>
            <div className="ct-scroll-x flex gap-2 overflow-x-auto">
              {booking.referenceImages.map((image) => (
                // Opens full size in a new tab rather than a lightbox in here:
                // a stylist holds this open next to the customer's head, and
                // the phone's own viewer zooms better than anything we build.
                <a
                  key={image.pathname}
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800"
                >
                  <Image src={image.url} alt="" fill sizes="80px" className="object-cover" />
                </a>
              ))}
            </div>
          </div>
        ) : null}

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

        {LOYALTY_ENABLED && !FINISHED.includes(booking.status) ? (
          <label className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
            ใช้แต้มลูกค้า (ถ้ามี ใส่ก่อนกด &quot;เสร็จแล้ว&quot;)
            <input
              type="number"
              min={0}
              step={1}
              value={redeemPoints}
              onChange={(e) => setRedeemPoints(e.target.value)}
              placeholder="0"
              className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
        ) : null}

        {FINISHED.includes(booking.status) ? (
          <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            รายการนี้จบแล้ว — ดูย้อนหลังได้ที่หน้าสรุป
          </p>
        ) : (
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
        )}

        <button
          type="button"
          onClick={close}
          className="ct-press mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
        >
          ปิด
        </button>
        </>
      )}
    </Modal>
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
