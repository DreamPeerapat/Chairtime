/**
 * A request to be paid, from the QR going up to the money landing.
 *
 * Recording the ask separately from the receipt of money is what makes a
 * fixed-amount QR safe. The sum is decided once, written down, and shown; when
 * a transfer turns up minutes later there is a row to match it against rather
 * than the shop's word about what it had chosen. It is also what a shop quotes
 * when something goes wrong — "CT-7KDM2P" means something to both of us.
 *
 * Intents expire. A PromptPay QR with an amount is meant to be paid once, and
 * a code still open on a phone from yesterday is how the wrong sum arrives.
 * Fifteen minutes is the window the payment pages of this kind use, and asking
 * for another costs nothing.
 *
 * Iron rule #5: arithmetic on money happens in satang, in lib/billing/amount.ts.
 * Nothing here adds anything up — it carries numeric(10,2) strings around.
 */
import { randomInt } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { PLATFORM_PAYEE } from './platform';
import { promptPayFor } from './promptpay';
import { recordPaymentInTx, type RecordedPayment } from './renew';

/** How long a QR is good for. The page counts this down in front of the shop. */
export const INTENT_MINUTES = 15;

// No 0/O/1/I/L: the reference is read aloud and typed into a chat window.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newReference(): string {
  let out = '';
  for (let i = 0; i < 8; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return `CT-${out}`;
}

export interface PaymentIntentRow {
  id: string;
  reference: string;
  tenantId: string;
  planId: string | null;
  months: number;
  amount: string;
  feeAmount: string;
  qrPayload: string | null;
  provider: string;
  gatewayRef1: string | null;
  gatewayRef2: string | null;
  status: string;
  expiresAt: Date;
  paidAt: Date | null;
  slipUrl: string | null;
  tenantPaymentId: string | null;
  createdAt: Date;
}

const COLUMNS = {
  id: schema.paymentIntent.id,
  reference: schema.paymentIntent.reference,
  tenantId: schema.paymentIntent.tenantId,
  planId: schema.paymentIntent.planId,
  months: schema.paymentIntent.months,
  amount: schema.paymentIntent.amount,
  feeAmount: schema.paymentIntent.feeAmount,
  qrPayload: schema.paymentIntent.qrPayload,
  provider: schema.paymentIntent.provider,
  gatewayRef1: schema.paymentIntent.gatewayRef1,
  gatewayRef2: schema.paymentIntent.gatewayRef2,
  status: schema.paymentIntent.status,
  expiresAt: schema.paymentIntent.expiresAt,
  paidAt: schema.paymentIntent.paidAt,
  slipUrl: schema.paymentIntent.slipUrl,
  tenantPaymentId: schema.paymentIntent.tenantPaymentId,
  createdAt: schema.paymentIntent.createdAt,
};

export class IntentError extends Error {}

export interface CreateIntentInput {
  tenantId: string;
  planId: string;
  months: number;
  /** baht, numeric(10,2) — worked out from the plan before it gets here */
  amount: string;
  now?: DateTime;
}

/**
 * Open a new intent and build the QR for it.
 *
 * The payload is stored rather than rebuilt on each render: the picture a shop
 * scanned must not change because something else did, and a stored payload is
 * also what a support question can be answered from.
 */
export async function createIntent(input: CreateIntentInput): Promise<PaymentIntentRow> {
  const now = input.now ?? DateTime.now();
  const expiresAt = now.plus({ minutes: INTENT_MINUTES });
  const payload = promptPayFor(PLATFORM_PAYEE.promptPayId, input.amount);

  return withTenant(input.tenantId, async (tx) => {
    // Collisions are vanishingly rare with 31^8, but a reference is UNIQUE and
    // a shop hitting one must get a QR rather than an error page.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rows = await tx
        .insert(schema.paymentIntent)
        .values({
          tenantId: input.tenantId,
          reference: newReference(),
          planId: input.planId,
          months: input.months,
          amount: input.amount,
          feeAmount: '0',
          qrPayload: payload,
          provider: 'promptpay',
          expiresAt: expiresAt.toJSDate(),
        })
        .onConflictDoNothing({ target: schema.paymentIntent.reference })
        .returning(COLUMNS);

      const row = rows[0];
      if (row) return row;
    }

    throw new IntentError('สร้างรายการชำระเงินไม่สำเร็จ กรุณาลองใหม่');
  });
}

/** One intent, by the reference the shop is looking at. */
export async function intentByReference(
  tenantId: string,
  reference: string,
): Promise<PaymentIntentRow | null> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx.select(COLUMNS).from(schema.paymentIntent).where(eq(schema.paymentIntent.reference, reference)),
  );
  return row ?? null;
}

/**
 * Close the window on anything that ran out.
 *
 * Called when a page is read rather than only from a cron, so a shop looking
 * at an expired code sees that it is expired even if nothing else has run.
 * Only ever moves `pending` — a paid intent whose row is read late is paid.
 */
export async function expireStale(tenantId: string, now = DateTime.now()): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx
      .update(schema.paymentIntent)
      .set({ status: 'expired' })
      .where(
        and(
          eq(schema.paymentIntent.tenantId, tenantId),
          eq(schema.paymentIntent.status, 'pending'),
          lt(schema.paymentIntent.expiresAt, now.toJSDate()),
        ),
      ),
  );
}

export interface ConfirmIntentInput {
  slipUrl?: string | null;
  /** a slip verification service said the transfer is real */
  verified?: boolean;
  paidAt?: DateTime;
  note?: string | null;
  now?: DateTime;
}

export interface ConfirmedIntent extends RecordedPayment {
  tenantPaymentId: string;
}

/**
 * Money arrived: turn the intent into a payment and extend the period.
 *
 * One transaction, because a period extended without a payment row is money we
 * cannot account for, and a payment row without an extension is a shop that
 * paid and got nothing. Confirming twice is a no-op by design — a gateway that
 * retries its webhook must not buy two months.
 */
export async function confirmIntent(
  intent: PaymentIntentRow,
  input: ConfirmIntentInput = {},
): Promise<ConfirmedIntent | null> {
  const now = input.now ?? DateTime.now();

  return withTenant(intent.tenantId, async (tx) => {
    const [current] = await tx
      .select({ status: schema.paymentIntent.status, tenantPaymentId: schema.paymentIntent.tenantPaymentId })
      .from(schema.paymentIntent)
      .where(eq(schema.paymentIntent.id, intent.id))
      .for('update');

    if (!current) return null;
    if (current.status === 'paid') return null;
    if (current.status === 'cancelled') {
      throw new IntentError('รายการนี้ถูกยกเลิกไปแล้ว');
    }

    const recorded = await recordPaymentInTx(tx, {
      tenantId: intent.tenantId,
      amount: intent.amount,
      paidAt: input.paidAt ?? now,
      months: intent.months,
      planId: intent.planId,
      slipUrl: input.slipUrl ?? intent.slipUrl,
      method: 'promptpay',
      status: input.verified ? 'verified' : 'pending_review',
      note: input.note ?? `อ้างอิง ${intent.reference}`,
      now,
    });

    await tx
      .update(schema.paymentIntent)
      .set({
        status: 'paid',
        paidAt: (input.paidAt ?? now).toJSDate(),
        slipUrl: input.slipUrl ?? intent.slipUrl,
        tenantPaymentId: recorded.paymentId,
      })
      .where(eq(schema.paymentIntent.id, intent.id));

    return { ...recorded, tenantPaymentId: recorded.paymentId };
  });
}
