import { notFound, redirect } from 'next/navigation';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { confirmIntent, expireStale, intentByReference } from '@/lib/billing/intent';
import { PLATFORM_PAYEE } from '@/lib/billing/platform';
import { planName } from '@/lib/billing/access';
import { InvoiceError, invoicesEnabled, issueInvoiceFor } from '@/lib/billing/invoice';
import { paymentReceipt } from '@/lib/billing/receipt';
import { checkSlip, slipCheckingEnabled } from '@/lib/billing/slip';
import { PaymentIntentView } from '@/components/admin/payment-intent-view';

export const dynamic = 'force-dynamic';

/** The blob store the uploader writes to, and nowhere else. */
const slipSchema = z
  .url()
  .refine(
    (u) => u.endsWith('.webp') && new URL(u).hostname.endsWith('.public.blob.vercel-storage.com'),
    'สลิปไม่ถูกต้อง',
  );

/**
 * One payment, from the QR going up to the receipt coming back.
 *
 * Reached by reference rather than by id so the address is the thing the shop
 * can read out, and scoped by the session's tenant either way — a reference
 * from another shop simply does not exist here.
 */
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const session = await requireSession('owner');
  if (session.impersonating) redirect('/admin');

  const { reference } = await params;
  const { error, reason } = await searchParams;

  // Close anything that ran out before reading, so a shop that comes back to
  // an old tab is told the window shut rather than shown a dead QR.
  await expireStale(session.tenantId);

  const intent = await intentByReference(session.tenantId, reference);
  if (!intent) notFound();

  const [name, receipt] = await Promise.all([
    intent.planId ? planName(intent.planId) : Promise.resolve(null),
    intent.tenantPaymentId
      ? paymentReceipt(session.tenantId, intent.tenantPaymentId)
      : Promise.resolve(null),
  ]);

  async function confirm(formData: FormData) {
    'use server';
    const active = await requireSession('owner');
    const current = await intentByReference(active.tenantId, reference);
    if (!current) notFound();

    if (current.status !== 'pending') {
      redirect(`/dashboard/billing/pay/${reference}`);
    }
    if (DateTime.fromJSDate(current.expiresAt) < DateTime.now()) {
      redirect(`/dashboard/billing/pay/${reference}?error=expired`);
    }

    const raw = formData.get('slipUrl');
    const slipUrl = typeof raw === 'string' && raw ? slipSchema.safeParse(raw) : null;
    if (slipUrl && !slipUrl.success) {
      redirect(`/dashboard/billing/pay/${reference}?error=slip_invalid`);
    }

    // Ask the bank before extending anything. A slip the service says is not
    // there buys nothing: the intent stays open so the shop can attach the
    // right one, which is the whole reason for checking.
    let verified = false;
    if (slipUrl?.success) {
      const check = await checkSlip({
        slipUrl: slipUrl.data,
        expectedAmount: current.amount,
        claimedAt: DateTime.now(),
      });
      if (check.outcome === 'rejected') {
        redirect(
          `/dashboard/billing/pay/${reference}?error=slip&reason=${encodeURIComponent(check.reason)}`,
        );
      }
      verified = check.outcome === 'verified';
    }

    const confirmed = await confirmIntent(current, {
      slipUrl: slipUrl?.success ? slipUrl.data : null,
      verified,
    });

    // The receipt is issued by งานเข้า, which is another service over the
    // network. It must not be able to fail the payment that has already been
    // taken, so it is attempted here and its absence is recoverable.
    if (confirmed) {
      const { issueReceiptFor } = await import('@/lib/billing/receipt');
      await issueReceiptFor(active.tenantId, confirmed.tenantPaymentId).catch((err) => {
        console.error('[billing] receipt could not be issued', err);
      });
    }

    redirect(`/dashboard/billing/pay/${reference}`);
  }

  async function requestInvoice() {
    'use server';
    const active = await requireSession('owner');

    try {
      await issueInvoiceFor(active.tenantId, reference);
    } catch (err) {
      if (err instanceof InvoiceError) {
        redirect(
          `/dashboard/billing/pay/${reference}?error=invoice&reason=${encodeURIComponent(err.message)}`,
        );
      }
      throw err;
    }

    redirect(`/dashboard/billing/pay/${reference}`);
  }

  return (
    <PaymentIntentView
      tenantId={session.tenantId}
      intent={{
        reference: intent.reference,
        planName: name,
        months: intent.months,
        amount: intent.amount,
        feeAmount: intent.feeAmount,
        status: intent.status,
        expiresAt: intent.expiresAt.toISOString(),
        createdAt: intent.createdAt.toISOString(),
        gatewayRef1: intent.gatewayRef1,
        gatewayRef2: intent.gatewayRef2,
        receiptUrl: receipt?.url ?? null,
        receiptNumber: receipt?.number ?? null,
        invoiceUrl: intent.invoiceUrl,
        invoiceNumber: intent.invoiceNumber,
      }}
      payee={PLATFORM_PAYEE}
      slipChecking={slipCheckingEnabled()}
      invoicing={invoicesEnabled()}
      error={noticeFor(error, reason)}
      onConfirm={confirm}
      onRequestInvoice={requestInvoice}
    />
  );
}

function noticeFor(error?: string, reason?: string): string | null {
  if (!error) return null;
  if (error === 'slip') {
    return `ตรวจสลิปไม่ผ่าน ยังไม่ได้ต่ออายุให้ — ${reason?.slice(0, 200) ?? 'ไม่พบรายการโอนนี้'}`;
  }
  if (error === 'slip_invalid') return 'ไฟล์สลิปไม่ถูกต้อง แนบใหม่อีกครั้ง';
  if (error === 'expired') return 'หมดเวลาชำระเงินของรายการนี้แล้ว สร้างรายการใหม่ได้ทันที';
  if (error === 'invoice') return reason?.slice(0, 200) ?? 'ออกใบแจ้งหนี้ไม่สำเร็จ';
  return 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง';
}
