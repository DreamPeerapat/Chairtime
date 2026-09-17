import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { loadBillingState, purchasablePlans } from '@/lib/billing/access';
import { totalForMonths } from '@/lib/billing/amount';
import { TERM_MONTHS } from '@/lib/billing/catalog';
import { IntentError, createIntent } from '@/lib/billing/intent';
import { PLATFORM_PAYEE } from '@/lib/billing/platform';
import { MAX_MONTHS, MIN_MONTHS, listPayments } from '@/lib/billing/renew';
import { slipCheckingEnabled } from '@/lib/billing/slip';
import { BillingView } from '@/components/admin/billing-view';

export const dynamic = 'force-dynamic';

/**
 * What the shop is buying, and nothing about what it has paid.
 *
 * The amount is worked out here from the plan's own price rather than taken
 * from the form: a number that came from the browser could put any figure in
 * the QR, and the QR is what somebody's banking app is about to obey.
 */
const purchaseSchema = z.object({
  term: z.enum(['monthly', 'yearly']),
  planId: z.uuid(),
});

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; reason?: string }>;
}) {
  const session = await requireSession('owner');

  // What the shop pays us is between us and the shop. An operator who has
  // stepped into this dashboard to fix a service list has no business reading
  // it, so the page is closed to them rather than merely read-only.
  if (session.impersonating) redirect('/admin');

  const { error, ok, reason } = await searchParams;

  const [billing, payments, plans] = await Promise.all([
    loadBillingState(session.tenantId),
    listPayments(session.tenantId),
    purchasablePlans(),
  ]);
  if (!billing) redirect('/dashboard');

  async function startPayment(formData: FormData) {
    'use server';
    // Re-read the session inside the action: the one closed over above was
    // resolved when the page rendered, which may have been a while ago.
    const active = await requireSession('owner');

    const parsed = purchaseSchema.safeParse({
      term: formData.get('term'),
      planId: formData.get('planId'),
    });
    if (!parsed.success) redirect('/dashboard/billing?error=invalid');

    const plan = (await purchasablePlans()).find((p) => p.id === parsed.data.planId);
    if (!plan) redirect('/dashboard/billing?error=invalid');

    // A year has its own price rather than twelve times the monthly one, and
    // the price is read from the plan's row here — the form's total is what
    // the shop was shown, not what it gets charged.
    const yearly = parsed.data.term === 'yearly' && plan.priceYearly;
    const months = yearly ? TERM_MONTHS.yearly : TERM_MONTHS.monthly;
    const amount = yearly ? plan.priceYearly! : totalForMonths(plan.priceMonthly, 1);
    if (!amount || months < MIN_MONTHS || months > MAX_MONTHS) {
      redirect('/dashboard/billing?error=invalid');
    }

    let reference: string;
    try {
      const intent = await createIntent({
        tenantId: active.tenantId,
        planId: plan.id,
        months,
        amount,
      });
      reference = intent.reference;
    } catch (err) {
      if (err instanceof IntentError) redirect('/dashboard/billing?error=rejected');
      throw err;
    }

    redirect(`/dashboard/billing/pay/${reference}`);
  }

  return (
    <BillingView
      state={billing}
      payments={payments.map((p) => ({
        id: p.id,
        receiptNumber: p.receiptNumber,
        receiptUrl: p.receiptUrl,
        amount: p.amount,
        paidAt: p.paidAt.toISOString(),
        periodStart: p.periodStart.toISOString(),
        periodEnd: p.periodEnd.toISOString(),
        status: p.status,
      }))}
      plans={plans}
      payee={PLATFORM_PAYEE}
      notice={ok ? 'ok' : error ? (error as 'invalid' | 'rejected' | 'slip') : null}
      slipReason={reason ? reason.slice(0, 200) : null}
      slipChecking={slipCheckingEnabled()}
      onSubmit={startPayment}
    />
  );
}
