import { DateTime } from 'luxon';
import { formatBaht } from '@/lib/billing/amount';
import { thaiDateFull } from '@/components/booking/format';
import type { BillingPaymentRow } from './billing-view';

const ZONE = 'Asia/Bangkok';

/** Every payment the shop has made, each with its receipt when one was issued. */
export function PaymentHistory({ payments }: { payments: BillingPaymentRow[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted">ประวัติการชำระเงิน</h2>
      {payments.length === 0 ? (
        <p className="rounded-xl border border-line px-4 py-3 text-sm text-muted">
          ยังไม่มีรายการ
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {payments.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{formatBaht(p.amount)}</p>
                <p className="text-xs text-muted">
                  โอน {thaiDateFull(DateTime.fromISO(p.paidAt).setZone(ZONE))} · ครอบคลุมถึง{' '}
                  {thaiDateFull(DateTime.fromISO(p.periodEnd).setZone(ZONE))}
                </p>
                {p.receiptUrl ? (
                  <a
                    href={p.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand underline"
                  >
                    ใบเสร็จ {p.receiptNumber ?? ''} (PDF)
                  </a>
                ) : null}
              </div>
              <PaymentChip status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PaymentChip({ status }: { status: string }) {
  const label =
    status === 'verified' ? 'ตรวจสอบแล้ว' : status === 'rejected' ? 'ไม่พบยอดโอน' : 'รอตรวจสอบ';
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
        status === 'verified'
          ? 'bg-brand-soft text-brand'
          : status === 'rejected'
            ? 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200'
            : 'bg-surface-muted text-muted'
      }`}
    >
      {label}
    </span>
  );
}
