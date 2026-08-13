/**
 * POST /api/webhooks/line/[tenantSlug]
 *
 * Each shop runs its own LINE OA, so the channel secret used to verify the
 * signature is looked up per tenant from the URL. The raw body is what gets
 * signed — parsing it as JSON first and re-serialising would break the check.
 *
 * Replies are sent inline because a reply token expires quickly and reply
 * messages are free. Anything that would need a push goes on the queue.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { createLineClient, loadLineCredentials } from '@/lib/line/client';
import { verifySignature } from '@/lib/line/signature';
import { handleEvent, type WebhookContext } from '@/lib/line/webhook';
import type { LineWebhookBody } from '@/lib/line/types';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;

  const [tenantRow] = await db
    .select({
      id: schema.tenant.id,
      slug: schema.tenant.slug,
      name: schema.tenant.name,
      timezone: schema.tenant.timezone,
      phone: schema.tenant.phone,
      address: schema.tenant.address,
      status: schema.tenant.status,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.slug, tenantSlug));

  if (!tenantRow || tenantRow.status !== 'active') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-line-signature');

  const credentials = await withTenant(tenantRow.id, (tx) =>
    loadLineCredentials(tx, tenantRow.id),
  );
  if (!credentials) {
    return NextResponse.json({ error: 'line channel not configured' }, { status: 404 });
  }

  if (!verifySignature(rawBody, signature, credentials.channelSecret)) {
    // Not from LINE, or the body was altered in transit.
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const ctx: WebhookContext = {
    tenantId: tenantRow.id,
    tenantSlug: tenantRow.slug,
    shopName: tenantRow.name,
    timezone: tenantRow.timezone,
    phone: tenantRow.phone,
    address: tenantRow.address,
    liffId: credentials.liffId,
  };

  const client = createLineClient(credentials.channelAccessToken);

  for (const event of body.events ?? []) {
    try {
      const handled = await withTenant(tenantRow.id, (tx) => handleEvent(tx, ctx, event));
      if (handled) await client.reply(handled.replyToken, handled.messages);
    } catch (error) {
      // LINE retries the whole delivery on a non-2xx, which would replay every
      // event in the batch. Log and carry on instead.
      console.error('line webhook event failed', { tenantSlug, type: event.type, error });
    }
  }

  // LINE only cares that this is a 200.
  return NextResponse.json({ ok: true });
}
