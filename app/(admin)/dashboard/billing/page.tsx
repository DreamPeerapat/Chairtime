import { redirect } from 'next/navigation';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { loadBillingState, purchasablePlans } from '@/lib/billing/access';
import { PLATFORM_PAYEE } from '@/lib/billing/platform';
import { BillingError, MAX_MONTHS, MIN_MONTHS, listPayments, recordPayment } from '@/lib/billing/renew';
import { BillingView } from '@/components/admin/billing-view';

export const dynamic = 'force-dynamic';

/**
 * Money, so the boundary is strict: baht with at most two decimals, a date
 * that is a date, and a whole number of months inside what any plan is sold
 * in. The amount stays a string all the way to numeric(10,2) — iron rule #5
 * keeps floats out of money.
 */
const renewalSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, 'ยอดเงินไม่ถูกต้อง')
    .refine((v) => Number(v) > 0, 'ยอดเงินต้องมากกว่า 0'),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ไม่ถูกต้อง'),
  months: z.coerce.number().int().min(MIN_MONTHS).max(MAX_MONTHS),
  planId: z.uuid(),
  note: z.string().trim().max(300).optional(),
});

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession('owner');

  // What the shop pays us is between us and the shop. An operator who has
  // stepped into this dashboard to fix a service list has no business reading
  // it, so the page is closed to them rather than merely read-only.
  if (session.impersonating) redirect('/admin');

  const { error, ok } = await searchParams;

  const [billing, payments, plans] = await Promise.all([
    loadBillingState(session.tenantId),
    listPayments(session.tenantId),
    purchasablePlans(),
  ]);
  if (!billing) redirect('/dashboard');

  async function submitRenewal(formData: FormData) {
    'use server';
    // Re-read the session inside the action: the one closed over above was
    // resolved when the page rendered, which may have been a while ago.
    const active = await requireSession('owner');

    const parsed = renewalSchema.safeParse({
      amount: formData.get('amount'),
      paidAt: formData.get('paidAt'),
      months: formData.get('months'),
      planId: formData.get('planId'),
      note: formData.get('note') || undefined,
    });
    if (!parsed.success) redirect('/dashboard/billing?error=invalid');

    try {
      await recordPayment({
        tenantId: active.tenantId,
        amount: parsed.data.amount,
        // The shop picks a calendar day; read it in the shop's own zone so a
        // transfer made at 23:00 in Bangkok is not recorded as the next day.
        paidAt: DateTime.fromISO(parsed.data.paidAt, { zone: 'Asia/Bangkok' }).endOf('day'),
        months: parsed.data.months,
        planId: parsed.data.planId,
        note: parsed.data.note ?? null,
      });
    } catch (err) {
      if (err instanceof BillingError) redirect('/dashboard/billing?error=rejected');
      throw err;
    }

    redirect('/dashboard/billing?ok=1');
  }

  return (
    <BillingView
      state={billing}
      payments={payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        paidAt: p.paidAt.toISOString(),
        periodStart: p.periodStart.toISOString(),
        periodEnd: p.periodEnd.toISOString(),
        status: p.status,
      }))}
      plans={plans}
      payee={PLATFORM_PAYEE}
      notice={ok ? 'ok' : error ? (error as 'invalid' | 'rejected') : null}
      onSubmit={submitRenewal}
    />
  );
}
