import { redirect } from 'next/navigation';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { loadBillingState, purchasablePlans } from '@/lib/billing/access';
import { PLATFORM_PAYEE } from '@/lib/billing/platform';
import { BillingError, MAX_MONTHS, MIN_MONTHS, listPayments, recordPayment } from '@/lib/billing/renew';
import { checkSlip, slipCheckingEnabled } from '@/lib/billing/slip';
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
  // The blob store the uploader writes to, and nowhere else: the URL reaches
  // the verification service, so it may not be pointed at somebody's server.
  slipUrl: z
    .url()
    .refine((u) => u.endsWith('.webp') && new URL(u).hostname.endsWith('.public.blob.vercel-storage.com'), 'สลิปไม่ถูกต้อง')
    .optional(),
  note: z.string().trim().max(300).optional(),
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
      slipUrl: formData.get('slipUrl') || undefined,
      note: formData.get('note') || undefined,
    });
    if (!parsed.success) redirect('/dashboard/billing?error=invalid');

    // The shop picks a calendar day; read it in the shop's own zone so a
    // transfer made at 23:00 in Bangkok is not recorded as the next day.
    const paidAt = DateTime.fromISO(parsed.data.paidAt, { zone: 'Asia/Bangkok' }).endOf('day');

    // Ask the bank before writing anything. A slip the service says is not
    // there buys nothing — the shop is told why and no period is extended,
    // which is the only reason to be checking at all. The service being
    // unreachable is not an answer: that lands `unchecked` and the claim goes
    // through on trust, exactly as it did before any of this existed.
    let verified = false;
    if (parsed.data.slipUrl) {
      const check = await checkSlip({
        slipUrl: parsed.data.slipUrl,
        expectedAmount: parsed.data.amount,
        claimedAt: paidAt,
      });
      if (check.outcome === 'rejected') {
        redirect(`/dashboard/billing?error=slip&reason=${encodeURIComponent(check.reason)}`);
      }
      verified = check.outcome === 'verified';
    }

    try {
      await recordPayment({
        tenantId: active.tenantId,
        amount: parsed.data.amount,
        paidAt,
        months: parsed.data.months,
        planId: parsed.data.planId,
        slipUrl: parsed.data.slipUrl ?? null,
        status: verified ? 'verified' : 'pending_review',
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
      tenantId={session.tenantId}
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
      notice={ok ? 'ok' : error ? (error as 'invalid' | 'rejected' | 'slip') : null}
      slipReason={reason ? reason.slice(0, 200) : null}
      slipChecking={slipCheckingEnabled()}
      onSubmit={submitRenewal}
    />
  );
}
