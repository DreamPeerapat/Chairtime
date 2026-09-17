/**
 * Getting a receipt for a payment, from งานเข้า.
 *
 * The document is not issued here. Receipt numbers run in one series across
 * everything that business invoices, the Thai fonts and the document forms
 * already live in that system, and at the end of the year the answer to "what
 * came in" has to be in one ledger rather than half of it in another app's
 * database. So this asks, stores what comes back, and shows it to the shop.
 *
 * Every part of it is allowed to fail without taking the payment with it. The
 * money has already moved by the time anything here runs: a receipt that could
 * not be issued is a row to retry, not a reason to refuse what was paid.
 */
import { and, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';
import { enqueue } from '@/lib/notifications/queue';
import { dedupeKey } from '@/lib/notifications/templates';
import { buddhistYear, thaiDayMonth } from '@/lib/time/thai';
import { formatBaht } from './amount';

function endpoint(): string | null {
  const base = process.env.NGANKHAO_API_URL?.trim().replace(/\/$/, '');
  return base ? `${base}/api/integrations/receipts` : null;
}

function secret(): string | null {
  return process.env.NGANKHAO_INTEGRATION_SECRET?.trim() || null;
}

/** Unset means receipts are simply not issued — everything else still works. */
export function receiptsEnabled(): boolean {
  return Boolean(endpoint() && secret());
}

export interface ReceiptRef {
  number: string;
  url: string;
  issuedAt: Date | null;
}

/** What was issued for one payment, if anything was. */
export async function paymentReceipt(
  tenantId: string,
  paymentId: string,
): Promise<ReceiptRef | null> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        number: schema.tenantPayment.receiptNumber,
        url: schema.tenantPayment.receiptUrl,
        issuedAt: schema.tenantPayment.receiptIssuedAt,
      })
      .from(schema.tenantPayment)
      .where(eq(schema.tenantPayment.id, paymentId)),
  );

  if (!row?.number || !row.url) return null;
  return { number: row.number, url: row.url, issuedAt: row.issuedAt };
}

/**
 * Ask งานเข้า for the receipt, record it, and tell the shop.
 *
 * Idempotent from both ends: the payment id is the key งานเข้า dedupes on, so
 * a retry returns the receipt already issued rather than a second one, and the
 * LINE message carries a dedupe key for the same reason.
 */
export async function issueReceiptFor(
  tenantId: string,
  paymentId: string,
): Promise<ReceiptRef | null> {
  const existing = await paymentReceipt(tenantId, paymentId);
  if (existing) return existing;

  const url = endpoint();
  const key = secret();
  if (!url || !key) return null;

  const details = await paymentDetails(tenantId, paymentId);
  if (!details) return null;

  const paidAt = DateTime.fromJSDate(details.paidAt).setZone(details.timezone);
  const periodEnd = DateTime.fromJSDate(details.periodEnd).setZone(details.timezone);
  const periodStart = DateTime.fromJSDate(details.periodStart).setZone(details.timezone);

  // Buddhist years: this line is printed on a Thai tax document, and 2026 on
  // one of those reads as a mistake even to somebody who knows what it means.
  const period = (dt: DateTime) => `${thaiDayMonth(dt)} ${buddhistYear(dt)}`;
  const description = [
    `ค่าบริการระบบจองคิว Chairtime${details.planName ? ` แพ็กเกจ ${details.planName}` : ''}`,
    `(${period(periodStart)} – ${period(periodEnd)})`,
  ].join(' ');

  // Satang, as integers, because that is what the other side stores. The baht
  // string is turned into one here and never added to anything.
  const totalSatang = Math.round(Number(details.amount) * 100);
  if (!Number.isFinite(totalSatang) || totalSatang <= 0) return null;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        source: 'chairtime',
        externalId: paymentId,
        payer: {
          name: details.shopName,
          taxId: details.taxId ?? '',
          address: details.address ?? '',
          contactEmail: details.email ?? '',
        },
        title: `ค่าบริการรายเดือน — ${details.shopName}`,
        items: [
          {
            description,
            quantity: details.months,
            unit: 'เดือน',
            unitPriceSatang: Math.round(totalSatang / details.months),
            totalSatang,
          },
        ],
        totalSatang,
        paidAt: paidAt.toISO(),
        method: 'promptpay',
        reference: details.note ?? '',
        emailTo: details.email ? [details.email] : [],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // งานเข้า being unreachable is not this payment's problem.
    console.error('[billing] ngankhao unreachable while issuing a receipt', paymentId);
    return null;
  }

  if (!response.ok) {
    console.error('[billing] ngankhao refused a receipt', paymentId, response.status);
    return null;
  }

  const issued = (await response.json().catch(() => null)) as {
    number?: string;
    downloadUrl?: string;
  } | null;

  if (!issued?.number || !issued.downloadUrl) return null;

  const issuedAt = new Date();
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(schema.tenantPayment)
      .set({
        receiptNumber: issued.number,
        receiptUrl: issued.downloadUrl,
        receiptIssuedAt: issuedAt,
      })
      .where(eq(schema.tenantPayment.id, paymentId));

    // Iron rule #6: nothing sends a LINE message from a request handler. This
    // goes in the queue like everything else, and the drain that runs after a
    // payment picks it up within the same click.
    await enqueue(tx, {
      tenantId,
      customerId: null,
      template: 'receipt_issued',
      scheduledAt: DateTime.now(),
      payload: {
        receiptNumber: issued.number,
        receiptUrl: issued.downloadUrl,
        amount: formatBaht(details.amount).replace(' บาท', ''),
        periodEnd: periodEnd.toISO(),
      },
      dedupeKey: dedupeKey('receipt_issued', 'payment', paymentId),
    });
  });

  return { number: issued.number, url: issued.downloadUrl, issuedAt };
}

interface PaymentDetails {
  amount: string;
  months: number;
  paidAt: Date;
  periodStart: Date;
  periodEnd: Date;
  note: string | null;
  planName: string | null;
  shopName: string;
  address: string | null;
  taxId: string | null;
  email: string | null;
  timezone: string;
}

/**
 * Everything the document needs, in one read.
 *
 * The address and tax id come from the shop rather than from whoever is logged
 * in: a receipt is issued to the business, and the person who happened to press
 * the button is not the payer.
 */
async function paymentDetails(
  tenantId: string,
  paymentId: string,
): Promise<PaymentDetails | null> {
  return withTenant(tenantId, async (tx) => {
    const [payment] = await tx
      .select({
        amount: schema.tenantPayment.amount,
        paidAt: schema.tenantPayment.paidAt,
        periodStart: schema.tenantPayment.periodStart,
        periodEnd: schema.tenantPayment.periodEnd,
        note: schema.tenantPayment.note,
        planName: schema.subscriptionPlan.name,
      })
      .from(schema.tenantPayment)
      .leftJoin(
        schema.subscriptionPlan,
        eq(schema.subscriptionPlan.id, schema.tenantPayment.planId),
      )
      .where(eq(schema.tenantPayment.id, paymentId));
    if (!payment) return null;

    const [shop] = await tx
      .select({
        name: schema.tenant.name,
        address: schema.tenant.address,
        taxId: schema.tenant.taxId,
        billingEmail: schema.tenant.billingEmail,
        timezone: schema.tenant.timezone,
      })
      .from(schema.tenant)
      .where(eq(schema.tenant.id, tenantId));
    if (!shop) return null;

    const email = shop.billingEmail ?? (await ownerEmail(tx, tenantId));

    const months = monthsBetween(payment.periodStart, payment.periodEnd);

    return {
      amount: payment.amount,
      months,
      paidAt: payment.paidAt,
      periodStart: payment.periodStart,
      periodEnd: payment.periodEnd,
      note: payment.note,
      planName: payment.planName,
      shopName: shop.name,
      address: shop.address,
      taxId: shop.taxId,
      email,
      timezone: shop.timezone,
    };
  });
}

/**
 * Where the receipt goes when the shop has not named a billing address.
 *
 * The owner, not any member of staff: a receipt is a financial document and
 * the stylist who joined last week has no business receiving it.
 */
async function ownerEmail(tx: TenantTx, tenantId: string): Promise<string | null> {
  const rows = await tx
    .select({ email: schema.staffUser.primaryEmail })
    .from(schema.staffTenant)
    .innerJoin(schema.staffUser, eq(schema.staffUser.id, schema.staffTenant.staffId))
    .where(
      and(
        eq(schema.staffTenant.tenantId, tenantId),
        eq(schema.staffTenant.role, 'owner'),
        eq(schema.staffTenant.isActive, true),
      ),
    )
    .limit(1);

  return rows[0]?.email ?? null;
}

/** Whole months, which is the only length a period is ever sold in. */
function monthsBetween(start: Date, end: Date): number {
  const months = DateTime.fromJSDate(end).diff(DateTime.fromJSDate(start), 'months').months;
  const rounded = Math.round(months);
  return rounded >= 1 ? rounded : 1;
}
