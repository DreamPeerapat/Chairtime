import { DateTime } from 'luxon';
import type { BillingState, PurchasablePlan } from '@/lib/billing/access';
import { MAX_MONTHS } from '@/lib/billing/renew';
import { thaiDateFull } from '@/components/booking/format';

export interface BillingPaymentRow {
  id: string;
  amount: string;
  paidAt: string;
  periodStart: string;
  periodEnd: string;
  status: string;
}

const ZONE = 'Asia/Bangkok';
const field =
  'rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900';

/**
 * What the shop is on, until when, and how to keep it.
 *
 * A server component with a server action passed in: nothing here needs to be
 * interactive, and a form that posts is one less client bundle on a page the
 * shop opens once a month.
 */
export function BillingView({
  state,
  payments,
  plans,
  payee,
  notice,
  onSubmit,
}: {
  state: BillingState;
  payments: BillingPaymentRow[];
  plans: PurchasablePlan[];
  payee: { bank: string; accountNumber: string; accountName: string };
  notice: 'ok' | 'invalid' | 'rejected' | null;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const lapsed = state.status !== 'active';
  const today = DateTime.now().setZone(ZONE).toISODate()!;
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

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">สถานะตอนนี้</h2>
        <div
          className={`rounded-xl border px-4 py-4 ${
            lapsed
              ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
              : 'border-slate-200 dark:border-slate-800'
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
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">วิธีต่ออายุ</h2>

        <ol className="flex flex-col gap-1 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
          <li className="text-xs text-slate-500">1. โอนเงินมาที่บัญชีนี้</li>
          <li className="my-1 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-900">
            <p className="font-medium">{payee.bank}</p>
            <p className="font-mono text-base tracking-wide">{payee.accountNumber}</p>
            <p className="text-xs text-slate-500">{payee.accountName}</p>
          </li>
          <li className="text-xs text-slate-500">2. กรอกยอดและวันที่โอนด้านล่าง แล้วกดแจ้ง</li>
        </ol>

        <form
          action={onSubmit}
          className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800"
        >
          <label className="flex flex-col gap-1 text-sm">
            แพ็กเกจ
            <select name="planId" required defaultValue={defaultPlan?.id ?? ''} className={field}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {formatBaht(plan.priceMonthly)} / เดือน
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              ยอดที่โอน (บาท)
              <input
                name="amount"
                required
                inputMode="decimal"
                defaultValue={defaultPlan?.priceMonthly ?? ''}
                placeholder="900"
                className={field}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              วันที่โอน
              <input type="date" name="paidAt" required defaultValue={today} max={today} className={field} />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              ต่อกี่เดือน
              <select name="months" defaultValue="1" className={field}>
                {Array.from({ length: MAX_MONTHS }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m} เดือน
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            หมายเหตุ (ถ้ามี)
            <input name="note" maxLength={300} placeholder="เช่น โอนจากบัญชีชื่ออื่น" className={field} />
          </label>

          <p className="text-xs text-slate-500">
            ระบบต่ออายุให้ทันทีที่กดแจ้ง ไม่ต้องรอตรวจสอบ
            — ถ้าโอนก่อนหมดอายุ วันที่เหลือจะถูกบวกต่อ ไม่หายไป
          </p>

          <button
            type="submit"
            className="ct-press w-fit rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-medium text-white"
          >
            แจ้งชำระเงิน
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">ประวัติการชำระเงิน</h2>
        {payments.length === 0 ? (
          <p className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-800">
            ยังไม่มีรายการ
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800"
              >
                <div>
                  <p className="font-medium">{formatBaht(p.amount)}</p>
                  <p className="text-xs text-slate-500">
                    โอน {thaiDateFull(DateTime.fromISO(p.paidAt).setZone(ZONE))} · ครอบคลุมถึง{' '}
                    {thaiDateFull(DateTime.fromISO(p.periodEnd).setZone(ZONE))}
                  </p>
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
      ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200'
      : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
  return <p className={`rounded-lg px-3 py-2 text-sm ${cls}`}>{children}</p>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
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
          ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200'
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
          ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200'
          : status === 'rejected'
            ? 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {label}
    </span>
  );
}

/** numeric(10,2) in, "900 บาท" out. Display only — never arithmetic. */
function formatBaht(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} บาท`;
  return `${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`;
}
