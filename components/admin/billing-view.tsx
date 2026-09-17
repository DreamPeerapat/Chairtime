import { DateTime } from 'luxon';
import type { BillingState, PurchasablePlan } from '@/lib/billing/access';
import { formatBaht } from '@/lib/billing/amount';
import { thaiDateFull } from '@/components/booking/format';
import { RenewalForm } from './renewal-form';

export interface BillingPaymentRow {
  id: string;
  receiptNumber: string | null;
  receiptUrl: string | null;
  amount: string;
  paidAt: string;
  periodStart: string;
  periodEnd: string;
  status: string;
}

const ZONE = 'Asia/Bangkok';

/**
 * What the shop is on, until when, and how to keep it.
 *
 * A server component around one interactive island: the status, the account
 * details and the receipts are read, and only the plan picker has to follow
 * what the shop is choosing. Paying happens on the page it opens.
 */
export function BillingView({
  state,
  payments,
  plans,
  payee,
  notice,
  slipReason,
  slipChecking,
  onSubmit,
}: {
  state: BillingState;
  payments: BillingPaymentRow[];
  plans: PurchasablePlan[];
  payee: { bank: string; accountNumber: string; accountName: string };
  notice: 'ok' | 'invalid' | 'rejected' | 'slip' | null;
  /** why the slip was refused, in the words the checking service used */
  slipReason?: string | null;
  /** whether an attached slip is checked against the bank */
  slipChecking: boolean;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const lapsed = state.status !== 'active';
  // The plan to default to: the one the shop is already on if it is a paid
  // one, otherwise the cheapest — a trial shop is choosing, not renewing.
  const defaultPlan = plans.find((p) => p.code === state.planCode) ?? plans[0];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">แพ็กเกจและการชำระเงิน</h1>

      {notice === 'ok' ? (
        <Banner tone="ok">
          บันทึกการแจ้งชำระเงินแล้ว ต่ออายุให้ทันที — เราจะตรวจสอบยอดกับธนาคารอีกครั้ง
        </Banner>
      ) : null}
      {notice === 'invalid' ? <Banner tone="error">กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง</Banner> : null}
      {notice === 'rejected' ? <Banner tone="error">บันทึกไม่สำเร็จ ตรวจยอดและวันที่อีกครั้ง</Banner> : null}
      {notice === 'slip' ? (
        <Banner tone="error">
          ตรวจสลิปไม่ผ่าน ยังไม่ได้ต่ออายุให้ — {slipReason ?? 'ไม่พบรายการโอนนี้'}
        </Banner>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">สถานะตอนนี้</h2>
        <div
          className={`rounded-xl border px-4 py-4 ${
            lapsed
              ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
              : 'border-line'
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-base font-semibold">{state.planName ?? 'ยังไม่ได้เลือกแพ็กเกจ'}</p>
            <StatusChip status={state.status} onTrial={state.onTrial} />
          </div>

          <dl className="mt-3 flex flex-col gap-1.5 text-sm">
            {state.priceMonthly && Number(state.priceMonthly) > 0 ? (
              <Row label="ค่าบริการ" value={`${formatBaht(state.priceMonthly)} / เดือน`} />
            ) : null}
            {state.periodEnd ? (
              <Row
                label={state.onTrial ? 'ทดลองใช้ถึง' : 'ใช้ได้ถึง'}
                value={thaiDateFull(state.periodEnd)}
              />
            ) : null}
            {state.daysLeft !== null ? (
              <Row
                label="คงเหลือ"
                value={state.daysLeft >= 0 ? `${state.daysLeft} วัน` : `หมดอายุมาแล้ว ${-state.daysLeft} วัน`}
              />
            ) : null}
          </dl>

          {lapsed ? (
            <p className="mt-3 text-xs text-red-800 dark:text-red-300">
              ตอนนี้รับจองคิวใหม่ไม่ได้ ทั้งจากลูกค้าและจากหลังบ้าน
              — คิวที่จองไว้แล้วยังจัดการได้ตามปกติ ต่ออายุแล้วกลับมารับจองทันที
            </p>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">วิธีต่ออายุ</h2>

        <ol className="flex flex-col gap-1 rounded-xl border border-line px-4 py-3 text-sm">
          <li className="text-xs text-muted">
            1. เลือกแพ็กเกจแล้วกดสร้าง QR — หน้าถัดไปจะมี QR พร้อมยอด หรือจะโอนเข้าบัญชีนี้ก็ได้
          </li>
          <li className="my-1 rounded-lg bg-surface-muted px-3 py-2">
            <p className="font-medium">{payee.bank}</p>
            <p className="font-mono text-base tracking-wide">{payee.accountNumber}</p>
            <p className="text-xs text-muted">{payee.accountName}</p>
          </li>
          <li className="text-xs text-muted">
            2. โอนตามยอดใน QR แล้วแนบสลิปกดยืนยัน ใบเสร็จจะส่งเข้าอีเมลและ LINE ของร้าน
          </li>
        </ol>

        <RenewalForm
          plans={plans}
          defaultPlanId={defaultPlan?.id ?? ''}
          slipChecking={slipChecking}
          onSubmit={onSubmit}
        />
      </section>

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
    </div>
  );
}

function Banner({ tone, children }: { tone: 'ok' | 'error'; children: React.ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-brand-soft text-brand'
      : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
  return <p className={`rounded-lg px-3 py-2 text-sm ${cls}`}>{children}</p>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function StatusChip({ status, onTrial }: { status: string; onTrial: boolean }) {
  const label =
    status === 'active'
      ? onTrial
        ? 'กำลังทดลองใช้'
        : 'ใช้งานอยู่'
      : status === 'suspended'
        ? 'หมดอายุ'
        : status === 'pending_payment'
          ? 'รอชำระเงิน'
          : 'ปิดใช้งาน';

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        status === 'active'
          ? 'bg-brand-soft text-brand'
          : 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200'
      }`}
    >
      {label}
    </span>
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
