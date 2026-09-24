import Link from 'next/link';
import type { PaymentIntentForView } from './payment-intent-view';

/** Shown in place of the QR once the money has arrived. */
export function PaidPanel({ intent }: { intent: PaymentIntentForView }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-brand bg-brand-soft px-4 py-6 text-center">
      <p className="text-base font-semibold">ได้รับการชำระเงินแล้ว</p>
      <p className="text-sm text-muted">
        {intent.receiptUrl
          ? 'ต่ออายุให้เรียบร้อย ใบเสร็จส่งไปที่อีเมลของร้านแล้ว'
          : 'ต่ออายุให้เรียบร้อยแล้ว'}
      </p>
      {intent.receiptUrl ? (
        <a
          href={intent.receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="ct-press rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-brand-contrast"
        >
          เปิดใบเสร็จ {intent.receiptNumber ?? ''}
        </a>
      ) : (
        <p className="text-xs text-muted">
          ใบเสร็จออกทีหลังได้ — เปิดดูได้จากประวัติการชำระเงินในหน้าแพ็กเกจ
        </p>
      )}
    </section>
  );
}

/** Shown in place of the QR once it has expired or been cancelled. */
export function ClosedPanel({ status }: { status: string }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-line px-4 py-6 text-center">
      <p className="text-base font-semibold">
        {status === 'cancelled' ? 'รายการนี้ถูกยกเลิก' : 'หมดเวลาชำระเงินแล้ว'}
      </p>
      <p className="text-sm text-muted">
        QR ที่มียอดเงินใช้ได้ครั้งเดียวและมีอายุจำกัด สร้างรายการใหม่ได้ทันที ไม่มีค่าใช้จ่าย
      </p>
      <Link
        href="/dashboard/billing"
        className="ct-press rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-brand-contrast"
      >
        สร้างรายการใหม่
      </Link>
    </section>
  );
}
