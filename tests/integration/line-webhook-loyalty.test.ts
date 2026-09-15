/**
 * The "แต้มของฉัน" reply, tested as though loyalty had launched.
 *
 * These two cases used to sit in line-webhook.test.ts. When the loyalty
 * feature was hidden behind LOYALTY_ENABLED the four loyalty suites were given
 * the mock that flips the flag back on, but this pair was missed and started
 * failing against the help text the keyword now falls through to.
 *
 * They live in their own file because `vi.mock` applies to a whole file, and
 * the rest of the webhook suite has to keep seeing the flag as production has
 * it. The hidden-state behaviour is pinned next door, in line-webhook.test.ts.
 */
import '../support/loyalty-enabled';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { connectLineChannel } from '@/lib/line/connect';
import { handleEvent, type WebhookContext } from '@/lib/line/webhook';
import type { LineWebhookEvent } from '@/lib/line/types';
import { createSimpleShop, resetDatabase, seedLineCustomer } from '../support/db';

const ZONE = 'Asia/Bangkok';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;
let ctx: WebhookContext;

beforeEach(async () => {
  process.env.SECRET_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'line-points-shop', staffCount: 1, chairCount: 1 });

  await connectLineChannel({
    tenantId: shop.tenantId,
    tenantSlug: 'line-points-shop',
    channelAccessToken: 'test-channel-access-token',
    channelSecret: 'test-channel-secret',
    liffId: '1234567890-abcdefgh',
  });

  ctx = {
    tenantId: shop.tenantId,
    tenantSlug: 'line-points-shop',
    shopName: 'ร้านทดสอบ',
    timezone: ZONE,
    phone: '02-000-0000',
    address: 'ถนนทดสอบ',
    liffId: '1234567890-abcdefgh',
  };
});

function textEvent(text: string, userId = 'U_line_user'): LineWebhookEvent {
  return {
    type: 'message',
    replyToken: 'reply-token-abc',
    timestamp: Date.now(),
    source: { type: 'user', userId },
    message: { type: 'text', id: 'm1', text },
  };
}

describe('"แต้มของฉัน" once loyalty is live', () => {
  it('answers with the point balance', async () => {
    const lineUserId = 'U_points_check';
    const customerId = await seedLineCustomer(shop.tenantId, lineUserId, 'คุณลูกค้าแต้ม');
    await withTenant(shop.tenantId, (tx) =>
      tx.update(schema.customer).set({ pointBalance: 42 }).where(eq(schema.customer.id, customerId)),
    );

    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx, textEvent('แต้มของฉัน', lineUserId)),
    );
    expect(JSON.stringify(handled?.messages)).toContain('42 แต้ม');
  });

  it('says zero points plainly for a customer who has never earned any', async () => {
    const lineUserId = 'U_no_points';
    await seedLineCustomer(shop.tenantId, lineUserId);

    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx, textEvent('แต้มของฉัน', lineUserId)),
    );
    expect(JSON.stringify(handled?.messages)).toContain('0 แต้ม');
  });
});
