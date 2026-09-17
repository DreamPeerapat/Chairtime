/**
 * GET /api/admin/billing/promptpay?amount=1770.00 — the QR to scan.
 *
 * A route rather than markup on the page because the amount changes as the
 * shop picks a plan and a number of months, and a QR carrying the wrong
 * amount is worse than no QR at all. The browser asks for a new one; the
 * encoder stays on the server.
 *
 * The payee is the platform's own PromptPay id, which is printed on the page
 * beside this anyway — but the route is still behind an owner session. It is
 * reachable by anyone who can already read the billing page, and nobody else.
 */
import { NextResponse } from 'next/server';
import { sessionForApi } from '@/lib/auth';
import { intentByReference } from '@/lib/billing/intent';
import { PLATFORM_PAYEE } from '@/lib/billing/platform';
import { promptPayFor } from '@/lib/billing/promptpay';
import { qrSvg } from '@/lib/billing/qr';

export const dynamic = 'force-dynamic';

/** Baht with at most two decimals, and nothing that could be a bigger bill. */
const AMOUNT = /^\d{1,6}(\.\d{1,2})?$/;

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await sessionForApi('owner');
  if ('status' in auth) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: auth.status });
  }

  const query = new URL(request.url).searchParams;
  const reference = query.get('reference');

  // A reference wins over an amount: the payload stored on the intent is the
  // one the shop was shown, and a code that changes under a phone mid-scan is
  // how the wrong sum gets sent.
  if (reference) {
    const intent = await intentByReference(auth.session.tenantId, reference);
    if (!intent?.qrPayload) {
      return NextResponse.json({ error: 'ไม่พบรายการนี้' }, { status: 404 });
    }
    return svg(intent.qrPayload);
  }

  const amount = query.get('amount');
  // No amount is a legitimate request: a QR the shop types the sum into.
  if (amount !== null && !AMOUNT.test(amount)) {
    return NextResponse.json({ error: 'ยอดเงินไม่ถูกต้อง' }, { status: 400 });
  }

  const payload = promptPayFor(PLATFORM_PAYEE.promptPayId, amount);
  if (!payload) {
    return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่าพร้อมเพย์' }, { status: 503 });
  }

  return svg(payload);
}

function svg(payload: string): NextResponse {
  return new NextResponse(qrSvg(payload, { width: 320 }), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Same payload, same picture, forever — but it is one shop's bill, so it
      // is cached in their browser and nowhere shared.
      'cache-control': 'private, max-age=3600',
    },
  });
}
