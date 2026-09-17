import Link from 'next/link';
import { DateTime } from 'luxon';
import { formatBaht } from '@/lib/billing/amount';
import { thaiDateShort } from '@/lib/time/thai';
import { PaymentCountdown } from './payment-countdown';
import { PaymentSteps } from './payment-steps';
import { SlipConfirmForm } from './slip-confirm-form';

const ZONE = 'Asia/Bangkok';

export interface PaymentIntentForView {
  reference: string;
  planName: string | null;
  months: number;
  amount: string;
  feeAmount: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  gatewayRef1: string | null;
  gatewayRef2: string | null;
  receiptUrl: string | null;
  receiptNumber: string | null;
}

/**
 * The payment itself: what to scan, how long it is good for, and what happened.
 *
 * Everything on this page answers a question a shop standing with its phone
 * out actually asks — how much, to whom, how long do I have, and did it work.
 * The reference is printed large because it is what they will quote when
 * something goes wrong.
 */
export function PaymentIntentView({
  tenantId,
  intent,
  payee,
  slipChecking,
  error,
  onConfirm,
}: {
  tenantId: string;
  intent: PaymentIntentForView;
  payee: { bank: string; accountNumber: string; accountName: string };
  slipChecking: boolean;
  error: string | null;
  onConfirm: (formData: FormData) => Promise<void>;
}) {
  const paid = intent.status === 'paid';
  const open = intent.status === 'pending';
  const step = paid ? 4 : open ? 2 : 3;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">ชำระค่าบริการ</h1>
        <p className="font-mono text-xs text-slate-500">{intent.reference}</p>
      </div>

      <PaymentSteps current={step} />

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {paid ? (
        <PaidPanel intent={intent} />
      ) : open ? (
        <>
          <section className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 px-4 py-5 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              กรุณาชำระเงินภายใน
            </p>
            <PaymentCountdown expiresAt={intent.expiresAt} />

            <div className="rounded-xl bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/admin/billing/promptpay?reference=${encodeURIComponent(intent.reference)}`}
                alt="QR พร้อมเพย์สำหรับชำระค่าบริการ"
                width={220}
                height={220}
              />
            </div>

            <p className="text-center text-xs text-slate-500">
              สแกนด้วยแอปธนาคารใดก็ได้ · ยอดในโค้ดถูกใส่ไว้แล้ว ไม่ต้องพิมพ์เอง
              <br />
              หรือโอนเข้า {payee.bank} {payee.accountNumber} ({payee.accountName})
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 px-4 py-4 dark:border-slate-800">
            <SlipConfirmForm
              tenantId={tenantId}
              slipRequired={slipChecking}
              onSubmit={onConfirm}
            />
          </section>
        </>
      ) : (
        <ClosedPanel status={intent.status} />
      )}

      <section className="rounded-2xl border border-slate-200 px-4 py-4 text-sm dark:border-slate-800">
        <h2 className="text-xs font-medium text-slate-500">รายละเอียดการชำระเงิน</h2>
        <dl className="mt-3 flex flex-col gap-1.5">
          <Row label="แพ็กเกจ" value={`${intent.planName ?? '—'} · ${intent.months} เดือน`} />
          <Row label="ยอดที่ต้องชำระ" value={formatBaht(intent.amount)} />
          {Number(intent.feeAmount) > 0 ? (
            <Row label="ค่าธรรมเนียม" value={formatBaht(intent.feeAmount)} />
          ) : null}
          <Row label="หมายเลขอ้างอิง" value={intent.reference} mono />
          {intent.gatewayRef1 ? <Row label="Ref1" value={intent.gatewayRef1} mono /> : null}
          {intent.gatewayRef2 ? <Row label="Ref2" value={intent.gatewayRef2} mono /> : null}
          <Row label="วันที่ทำรายการ" value={fullTime(intent.createdAt)} />
          <Row label="หมดอายุ" value={fullTime(intent.expiresAt)} />
        </dl>
      </section>

      <Link href="/dashboard/billing" className="text-center text-xs text-slate-500 underline">
        กลับไปหน้าแพ็กเกจ
      </Link>
    </div>
  );
}

function PaidPanel({ intent }: { intent: PaymentIntentForView }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-teal-300 bg-teal-50 px-4 py-6 text-center dark:border-teal-900 dark:bg-teal-950/40">
      <p className="text-base font-semibold">ได้รับการชำระเงินแล้ว</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {intent.receiptUrl
          ? 'ต่ออายุให้เรียบร้อย ใบเสร็จส่งไปที่อีเมลของร้านแล้ว'
          : 'ต่ออายุให้เรียบร้อยแล้ว'}
      </p>
      {intent.receiptUrl ? (
        <a
          href={intent.receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="ct-press rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-medium text-white"
        >
          เปิดใบเสร็จ {intent.receiptNumber ?? ''}
        </a>
      ) : (
        <p className="text-xs text-slate-500">
          ใบเสร็จออกทีหลังได้ — เปิดดูได้จากประวัติการชำระเงินในหน้าแพ็กเกจ
        </p>
      )}
    </section>
  );
}

function ClosedPanel({ status }: { status: string }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 px-4 py-6 text-center dark:border-slate-800">
      <p className="text-base font-semibold">
        {status === 'cancelled' ? 'รายการนี้ถูกยกเลิก' : 'หมดเวลาชำระเงินแล้ว'}
      </p>
      <p className="text-sm text-slate-500">
        QR ที่มียอดเงินใช้ได้ครั้งเดียวและมีอายุจำกัด สร้างรายการใหม่ได้ทันที ไม่มีค่าใช้จ่าย
      </p>
      <Link
        href="/dashboard/billing"
        className="ct-press rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-medium text-white"
      >
        สร้างรายการใหม่
      </Link>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={`text-right font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

/** Buddhist year, like every other date in the product — never 2026. */
function fullTime(iso: string): string {
  const dt = DateTime.fromISO(iso).setZone(ZONE);
  return `${thaiDateShort(dt)} ${dt.toFormat('HH:mm:ss')} น.`;
}
