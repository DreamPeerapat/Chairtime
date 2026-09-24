import type { BillingState } from '@/lib/billing/access';
import { formatBaht } from '@/lib/billing/amount';
import { thaiDateFull } from '@/components/booking/format';

/**
 * What the shop is on and until when. A lapsed shop's card turns red and says
 * what has stopped — and what has not — so nobody panics about the queue
 * they already have.
 */
export function BillingStatusCard({ state }: { state: BillingState }) {
  const lapsed = state.status !== 'active';

  return (
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
  );
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
