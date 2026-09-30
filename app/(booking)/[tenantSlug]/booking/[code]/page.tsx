import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DateTime } from 'luxon';
import { findBookingByCode, findTenantBySlug } from '@/lib/booking/queries';
import { formatBaht, statusLabel, thaiDateFull, thaiTimeRange } from '@/components/booking/format';
import { CancelBookingButton } from '@/components/booking/cancel-button';
import { RatingForm } from '@/components/booking/rating-form';
import { findFeedbackForBooking } from '@/lib/feedback/queries';
import { withTenant } from '@/lib/db/tenant';

export const dynamic = 'force-dynamic';

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; code: string }>;
  searchParams: Promise<{ rate?: string }>;
}) {
  const { tenantSlug, code } = await params;
  const { rate } = await searchParams;
  const tenant = await findTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const booking = await findBookingByCode(tenant.id, code, tenant.timezone);
  if (!booking) notFound();

  /*
   * The rating form shows on a finished visit — always, not only when the
   * LINE message sent them here with ?rate=1. A walk-in reaches this page by
   * a link the shop handed over, and that link has no reason to carry a flag
   * the customer cannot see the point of. `?rate=1` only decides whether the
   * page opens scrolled to it.
   */
  const canRate = booking.status === 'completed';
  const existingFeedback = canRate
    ? await withTenant(tenant.id, (tx) => findFeedbackForBooking(tx, tenant.id, booking.id))
    : null;

  const status = statusLabel(booking.status);
  const now = DateTime.now().setZone(tenant.timezone);
  const minutesUntil = booking.startsAt.diff(now, 'minutes').minutes;
  const canCancel =
    ['pending', 'confirmed'].includes(booking.status) && minutesUntil > booking.cancelCutoffMin;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-line p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted">รหัสจอง</p>
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

      {canRate ? (
        <div id="rate" className={rate ? 'ct-enter scroll-mt-4' : 'scroll-mt-4'}>
          <RatingForm
            tenantSlug={tenantSlug}
            code={booking.code}
            existing={existingFeedback}
            staffName={booking.staffName ?? null}
          />
        </div>
      ) : null}

      {booking.status === 'cancelled' ? (
        <p className="text-center text-sm text-muted">การจองนี้ถูกยกเลิกแล้ว</p>
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
        className="rounded-xl border border-line py-3 text-center text-sm"
      >
        จองคิวใหม่
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
