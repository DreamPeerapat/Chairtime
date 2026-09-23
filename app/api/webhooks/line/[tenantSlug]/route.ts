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
import { NextResponse, after } from 'next/server';
import { eq } from 'drizzle-orm';
import { installOwnerMenu } from '@/lib/line/owner-menu';
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
      latitude: schema.tenant.latitude,
      longitude: schema.tenant.longitude,
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
    // numeric comes back from the driver as a string, and the LINE API wants
    // a number — converting at the boundary keeps the handler honest.
    latitude: tenantRow.latitude === null ? null : Number(tenantRow.latitude),
    longitude: tenantRow.longitude === null ? null : Number(tenantRow.longitude),
    liffId: credentials.liffId,
  };

  const client = createLineClient(credentials.channelAccessToken);

  for (const event of body.events ?? []) {
    try {
      const handled = await withTenant(tenantRow.id, (tx) => handleEvent(tx, ctx, event));
      if (handled) await client.reply(handled.replyToken, handled.messages);

      /*
       * The owner has just linked this phone, so give them their menu without
       * making them go back to a laptop and press a button — which is what
       * the settings page used to be the only way to do.
       *
       * `after` runs this once the 200 is on its way back to LINE. The work
       * is a 2500x1686 render plus four LINE API calls, which is far too slow
       * to sit in front of a webhook reply: LINE retries a delivery it thinks
       * timed out, and a retry would run the whole batch again.
       *
       * installOwnerMenu resolves rather than throws, and it is idempotent —
       * it deletes the menu it replaces. If it fails, the shop still has the
       * "สร้างเมนูเจ้าของร้าน" button on the LINE settings page.
       */
      if (handled?.ownerJustLinked) {
        after(async () => {
          const result = await installOwnerMenu(tenantRow.id);
          if (!result.ok) {
            console.error('[line] owner menu auto-install failed', {
              tenantSlug,
              message: result.message,
            });
          }
        });
      }
    } catch (error) {
      // LINE retries the whole delivery on a non-2xx, which would replay every
      // event in the batch. Log and carry on instead.
      console.error('line webhook event failed', { tenantSlug, type: event.type, error });
    }
  }

  // LINE only cares that this is a 200.
  return NextResponse.json({ ok: true });
}
