/**
 * Recording a renewal.
 *
 * The shop transfers money in a bank, then tells us here. Iron rule #5: the
 * platform never holds the money, it records that a transfer happened — so
 * what this writes is a claim with evidence attached, and `pending_review`
 * until somebody matches it to the statement.
 *
 * The period is extended immediately rather than on verification. A salon
 * with customers booked this afternoon cannot be held shut while a human
 * reads a bank app, and the row is the audit trail if the transfer never
 * turns up.
 *
 * When a slip has been checked against the bank the caller says so and the
 * row lands `verified` instead. A slip the service rejects never reaches
 * here at all — the caller refuses it before anything is written.
 */
import { and, desc, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';
import { periodEndOf } from './access';

export interface RecordPaymentInput {
  tenantId: string;
  /** baht, as the shop typed it — stored as numeric(10,2) */
  amount: string;
  paidAt: DateTime;
  months: number;
  /** the plan being bought — set when a trial shop picks its first paid one */
  planId?: string | null;
  slipUrl?: string | null;
  /**
   * `verified` only when a slip verification service confirmed the transfer.
   * Everything else is `pending_review`, which is a claim awaiting a human.
   */
  status?: 'pending_review' | 'verified';
  note?: string | null;
  now?: DateTime;
}

export interface RecordedPayment {
  periodStart: DateTime;
  periodEnd: DateTime;
}

export class BillingError extends Error {}

/** A year at a time is the most any plan is sold in, and one month the least. */
export const MIN_MONTHS = 1;
export const MAX_MONTHS = 12;

export async function recordPayment(input: RecordPaymentInput): Promise<RecordedPayment> {
  return withTenant(input.tenantId, (tx) => recordPaymentInTx(tx, input));
}

export async function recordPaymentInTx(
  tx: TenantTx,
  input: RecordPaymentInput,
): Promise<RecordedPayment> {
  const now = input.now ?? DateTime.now();

  if (input.months < MIN_MONTHS || input.months > MAX_MONTHS) {
    throw new BillingError('จำนวนเดือนต้องอยู่ระหว่าง 1 ถึง 12');
  }
  if (input.paidAt > now.plus({ days: 1 })) {
    throw new BillingError('วันที่โอนอยู่ในอนาคต');
  }

  const [row] = await tx
    .select({
      planId: schema.tenant.planId,
      status: schema.tenant.status,
      trialEndsAt: schema.tenant.trialEndsAt,
      paidUntil: schema.tenant.paidUntil,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, input.tenantId));

  if (!row) throw new BillingError('ไม่พบร้านนี้');

  // Renewing early adds to what is left rather than throwing it away; renewing
  // late starts from today rather than backdating into a gap nobody could use.
  const current = periodEndOf(row);
  const periodStart = current && current > now ? current : now;
  const periodEnd = periodStart.plus({ months: input.months });

  const planId = input.planId ?? row.planId;

  await tx.insert(schema.tenantPayment).values({
    tenantId: input.tenantId,
    planId,
    amount: input.amount,
    method: 'bank_transfer',
    paidAt: input.paidAt.toJSDate(),
    slipUrl: input.slipUrl ?? null,
    periodStart: periodStart.toJSDate(),
    periodEnd: periodEnd.toJSDate(),
    status: input.status ?? 'pending_review',
    note: input.note ?? null,
  });

  // trial_ends_at is deliberately left where it is: it is the record of when
  // the free month ended, and paid_until is what everything reads from now on.
  await tx
    .update(schema.tenant)
    .set({ paidUntil: periodEnd.toJSDate(), status: 'active', planId })
    .where(eq(schema.tenant.id, input.tenantId));

  return { periodStart, periodEnd };
}

export interface PaymentRow {
  id: string;
  amount: string;
  paidAt: Date;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  slipUrl: string | null;
}

/** The shop's own receipts, newest first. */
export async function listPayments(tenantId: string, limit = 24): Promise<PaymentRow[]> {
  return withTenant(tenantId, (tx) =>
    tx
      .select({
        id: schema.tenantPayment.id,
        amount: schema.tenantPayment.amount,
        paidAt: schema.tenantPayment.paidAt,
        periodStart: schema.tenantPayment.periodStart,
        periodEnd: schema.tenantPayment.periodEnd,
        status: schema.tenantPayment.status,
        slipUrl: schema.tenantPayment.slipUrl,
      })
      .from(schema.tenantPayment)
      .where(and(eq(schema.tenantPayment.tenantId, tenantId)))
      .orderBy(desc(schema.tenantPayment.createdAt))
      .limit(limit),
  );
}
