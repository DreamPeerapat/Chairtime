import type { BillingState, PurchasablePlan } from '@/lib/billing/access';
import type { BillingIdentityInput } from '@/lib/billing/identity';
import { BillingIdentityForm } from './billing-identity-form';
import { BillingStatusCard } from './billing-status-card';
import { PaymentHistory } from './payment-history';
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

/**
 * What the shop is on, until when, and how to keep it.
 *
 * A server component around one interactive island: the status and the
 * receipts are read, and only the plan picker has to follow what the shop is
 * choosing. Paying happens on the page it opens, which is where the account
 * to pay into is shown — this page is for deciding, not for transcribing a
 * bank account nobody can act on until they have picked a plan.
 */
export function BillingView({
  state,
  payments,
  plans,
  notice,
  slipReason,
  slipChecking,
  identity,
  identitySaved,
  identityError,
  shopName,
  onSaveIdentity,
  onSubmit,
}: {
  state: BillingState;
  payments: BillingPaymentRow[];
  plans: PurchasablePlan[];
  notice: 'ok' | 'invalid' | 'rejected' | 'slip' | null;
  /** why the slip was refused, in the words the checking service used */
  slipReason?: string | null;
  /** whether an attached slip is checked against the bank */
  slipChecking: boolean;
  /** what to print on this shop's documents; empty fields fall back */
  identity: BillingIdentityInput;
  identitySaved?: boolean;
  identityError?: string | null;
  shopName: string;
  onSaveIdentity: (formData: FormData) => Promise<void>;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
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

      <BillingStatusCard state={state} />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">วิธีต่ออายุ</h2>

        <RenewalForm
          plans={plans}
          defaultPlanId={defaultPlan?.id ?? ''}
          slipChecking={slipChecking}
          onSubmit={onSubmit}
        />

        <BillingIdentityForm
          values={identity}
          shopName={shopName}
          fallbackEmail=""
          saved={identitySaved}
          error={identityError}
          onSubmit={onSaveIdentity}
        />
      </section>

      <PaymentHistory payments={payments} />
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
