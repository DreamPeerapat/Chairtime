/**
 * Getting an invoice for a payment that has not happened yet.
 *
 * The twin of receipt.ts, and deliberately shaped the same way: งานเข้า issues
 * the document, the reference we send is the key it dedupes on, and what comes
 * back is copied into our own row so the shop can be shown its invoice without
 * another service having to be up.
 *
 * What differs is when it exists. A receipt says money arrived; an invoice is
 * what a shop takes to whoever approves its spending, weeks before any money
 * moves. So it hangs off the intent, and asking for one must not disturb the
 * intent's own clock — the QR keeps its fifteen minutes whether or not a
 * document was printed, and a shop that comes back next week opens a new one.
 */
import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { buddhistYear, thaiDayMonth } from '@/lib/time/thai';
import { billingPartyFor } from './party';

/** How long a shop has to pay an invoice before it stops meaning anything. */
const PAYMENT_TERM_DAYS = 7;

function endpoint(): string | null {
  const base = process.env.NGANKHAO_API_URL?.trim().replace(/\/$/, '');
  return base ? `${base}/api/integrations/invoices` : null;
}

function secret(): string | null {
  return process.env.NGANKHAO_INTEGRATION_SECRET?.trim() || null;
}

export function invoicesEnabled(): boolean {
  return Boolean(endpoint() && secret());
}

export interface InvoiceRef {
  number: string;
  url: string;
  issuedAt: Date | null;
}

/** What was issued against this intent, if anything was. */
export async function intentInvoice(
  tenantId: string,
  reference: string,
): Promise<InvoiceRef | null> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        number: schema.paymentIntent.invoiceNumber,
        url: schema.paymentIntent.invoiceUrl,
        issuedAt: schema.paymentIntent.invoiceIssuedAt,
      })
      .from(schema.paymentIntent)
      .where(eq(schema.paymentIntent.reference, reference)),
  );

  if (!row?.number || !row.url) return null;
  return { number: row.number, url: row.url, issuedAt: row.issuedAt };
}

export class InvoiceError extends Error {}

/**
 * Ask งานเข้า for an invoice against an open intent.
 *
 * Unlike the receipt, this one is allowed to report failure: nobody has paid
 * anything yet, and a shop that pressed "ขอใบแจ้งหนี้" and got silence would
 * press it again. So it throws, and the page says so.
 */
export async function issueInvoiceFor(
  tenantId: string,
  reference: string,
): Promise<InvoiceRef> {
  const existing = await intentInvoice(tenantId, reference);
  if (existing) return existing;

  const url = endpoint();
  const key = secret();
  if (!url || !key) throw new InvoiceError('ยังไม่ได้เปิดใช้งานระบบออกเอกสาร');

  const [intent] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        id: schema.paymentIntent.id,
        amount: schema.paymentIntent.amount,
        months: schema.paymentIntent.months,
        status: schema.paymentIntent.status,
        planName: schema.subscriptionPlan.name,
      })
      .from(schema.paymentIntent)
      .leftJoin(
        schema.subscriptionPlan,
        eq(schema.subscriptionPlan.id, schema.paymentIntent.planId),
      )
      .where(eq(schema.paymentIntent.reference, reference)),
  );

  if (!intent) throw new InvoiceError('ไม่พบรายการนี้');
  if (intent.status === 'paid') throw new InvoiceError('รายการนี้ชำระแล้ว ใช้ใบเสร็จแทน');

  const party = await billingPartyFor(tenantId);
  const totalSatang = Math.round(Number(intent.amount) * 100);
  if (!Number.isFinite(totalSatang) || totalSatang <= 0) {
    throw new InvoiceError('ยอดเงินของรายการนี้ไม่ถูกต้อง');
  }

  const now = DateTime.now().setZone(party.timezone);
  const until = now.plus({ months: intent.months });
  const period = (dt: DateTime) => `${thaiDayMonth(dt)} ${buddhistYear(dt)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        source: 'chairtime',
        externalId: `intent:${intent.id}`,
        payer: {
          name: party.name,
          taxId: party.taxId ?? '',
          address: party.address ?? '',
          contactEmail: party.email ?? '',
        },
        title: `ค่าบริการระบบจองคิว Chairtime — ${party.name}`,
        items: [
          {
            description: [
              `ค่าบริการระบบจองคิว Chairtime${intent.planName ? ` แพ็กเกจ ${intent.planName}` : ''}`,
              `(${period(now)} – ${period(until)})`,
            ].join(' '),
            quantity: intent.months,
            unit: 'เดือน',
            unitPriceSatang: Math.round(totalSatang / intent.months),
            totalSatang,
          },
        ],
        totalSatang,
        paymentTermDays: PAYMENT_TERM_DAYS,
        notes: `ชำระโดยสแกน QR พร้อมเพย์ในระบบ อ้างอิง ${reference}`,
        emailTo: party.email ? [party.email] : [],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new InvoiceError('ติดต่อระบบออกเอกสารไม่ได้ ลองใหม่อีกครั้ง');
  }

  if (!response.ok) {
    console.error('[billing] ngankhao refused an invoice', reference, response.status);
    throw new InvoiceError('ออกใบแจ้งหนี้ไม่สำเร็จ ลองใหม่อีกครั้ง');
  }

  const issued = (await response.json().catch(() => null)) as {
    number?: string;
    downloadUrl?: string;
  } | null;

  if (!issued?.number || !issued.downloadUrl) {
    throw new InvoiceError('ระบบออกเอกสารตอบกลับผิดรูปแบบ');
  }

  const issuedAt = new Date();
  await withTenant(tenantId, (tx) =>
    tx
      .update(schema.paymentIntent)
      .set({
        invoiceNumber: issued.number,
        invoiceUrl: issued.downloadUrl,
        invoiceIssuedAt: issuedAt,
      })
      .where(eq(schema.paymentIntent.id, intent.id)),
  );

  return { number: issued.number, url: issued.downloadUrl, issuedAt };
}
