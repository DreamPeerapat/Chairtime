import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DateTime } from 'luxon';
import { findBookingByCode, findTenantBySlug } from '@/lib/booking/queries';
import { formatBaht, statusLabel, thaiDateFull, thaiTimeRange } from '@/components/booking/format';
import { CancelBookingButton } from '@/components/booking/cancel-button';

export const dynamic = 'force-dynamic';

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; code: string }>;
}) {
  const { tenantSlug, code } = await params;
  const tenant = await findTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const booking = await findBookingByCode(tenant.id, code, tenant.timezone);
  if (!booking) notFound();

  const status = statusLabel(booking.status);
  const now = DateTime.now().setZone(tenant.timezone);
  const minutesUntil = booking.startsAt.diff(now, 'minutes').minutes;
  const canCancel =
    ['pending', 'confirmed'].includes(booking.status) && minutesUntil > booking.cancelCutoffMin;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">รหัสจอง</p>
            <p className="font-mono text-2xl font-semibold tracking-wider">{booking.code}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.tone}`}>
            {status.label}
          </span>
        </div>

        <dl className="mt-4 flex flex-col gap-2 text-sm">
          <Row label="วันที่" value={thaiDateFull(booking.startsAt)} />
          <Row label="เวลา" value={thaiTimeRange(booking.startsAt, booking.endsAt)} />
          <Row label="บริการ" value={booking.services.join(', ')} />
          {booking.staffName ? <Row label="ช่าง" value={booking.staffName} /> : null}
          <Row label="รวม" value={formatBaht(booking.total)} />
        </dl>
      </div>

      {booking.status === 'cancelled' ? (
        <p className="text-center text-sm text-slate-500">การจองนี้ถูกยกเลิกแล้ว</p>
      ) : canCancel ? (
        <CancelBookingButton
          tenantId={tenant.id}
          bookingId={booking.id}
          cancelCutoffMin={booking.cancelCutoffMin}
        />
      ) : ['pending', 'confirmed'].includes(booking.status) ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          ใกล้ถึงเวลานัดแล้ว ยกเลิกผ่านหน้านี้ไม่ได้
          {tenant.phone ? ` กรุณาโทร ${tenant.phone}` : ' กรุณาติดต่อร้านโดยตรง'}
        </p>
      ) : null}

      <Link
        href={`/${tenantSlug}`}
        className="rounded-xl border border-slate-200 py-3 text-center text-sm dark:border-slate-800"
      >
        จองคิวใหม่
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
