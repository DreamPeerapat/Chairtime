/**
 * The LINE webhook against a real database, with a recording client.
 *
 * Everything here checks that replies (free) are used rather than pushes
 * (metered), and that the shop's own credentials are what the signature is
 * verified against.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { createBooking } from '@/lib/booking';
import { getAvailability } from '@/lib/availability';
import { connectLineChannel } from '@/lib/line/connect';
import { loadLineCredentials } from '@/lib/line/client';
import { signBody, verifySignature } from '@/lib/line/signature';
import { handleEvent, ensureCustomer, type WebhookContext } from '@/lib/line/webhook';
import type { LineWebhookEvent } from '@/lib/line/types';
import { createSimpleShop, resetDatabase } from '../support/db';

const ZONE = 'Asia/Bangkok';
const TOKEN = 'test-channel-access-token';
const SECRET = 'test-channel-secret';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;
let ctx: WebhookContext;

beforeEach(async () => {
  process.env.SECRET_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'line-shop', staffCount: 1, chairCount: 1 });

  await connectLineChannel({
    tenantId: shop.tenantId,
    tenantSlug: 'line-shop',
    channelAccessToken: TOKEN,
    channelSecret: SECRET,
    liffId: '1234567890-abcdefgh',
  });

  ctx = {
    tenantId: shop.tenantId,
    tenantSlug: 'line-shop',
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

describe('stored credentials', () => {
  it('round-trips the token through encryption', async () => {
    const credentials = await withTenant(shop.tenantId, (tx) =>
      loadLineCredentials(tx, shop.tenantId),
    );
    expect(credentials?.channelAccessToken).toBe(TOKEN);
    expect(credentials?.channelSecret).toBe(SECRET);
    expect(credentials?.liffId).toBe('1234567890-abcdefgh');
  });

  it('never stores the token in plaintext', async () => {
    const [row] = await withTenant(shop.tenantId, (tx) =>
      tx
        .select()
        .from(schema.tenantLineOa)
        .where(eq(schema.tenantLineOa.tenantId, shop.tenantId)),
    );
    expect(row!.channelAccessToken).not.toContain(TOKEN);
    expect(row!.channelSecret).not.toContain(SECRET);
    expect(row!.channelAccessToken!.startsWith('v1.')).toBe(true);
  });

  it('verifies a webhook signature against the stored secret', async () => {
    const credentials = await withTenant(shop.tenantId, (tx) =>
      loadLineCredentials(tx, shop.tenantId),
    );
    const body = JSON.stringify({ events: [] });
    const signature = signBody(body, SECRET);

    expect(verifySignature(body, signature, credentials!.channelSecret)).toBe(true);
    expect(verifySignature(body, signature, 'someone-elses-secret')).toBe(false);
  });

  it('hides one shop credentials from another', async () => {
    const other = await createSimpleShop({ slug: 'other-line-shop' });
    const seen = await withTenant(other.tenantId, (tx) => loadLineCredentials(tx, shop.tenantId));
    expect(seen).toBeNull();
  });
});

describe('inbound messages', () => {
  it('answers "คิวของฉัน" with the next booking', async () => {
    const lineUserId = 'U_with_booking';
    const customerId = await withTenant(shop.tenantId, (tx) =>
      ensureCustomer(tx, shop.tenantId, lineUserId, 'คุณลูกค้า'),
    );

    const date = DateTime.now().setZone(ZONE).plus({ days: 3 }).toISODate()!;
    const slots = await getAvailability({
      tenantId: shop.tenantId,
      date,
      serviceIds: [shop.serviceId],
    });
    const booking = await createBooking({
      tenantId: shop.tenantId,
      customerId,
      startsAt: slots[0]!.start,
      serviceIds: [shop.serviceId],
    });

    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx, textEvent('คิวของฉัน', lineUserId)),
    );

    expect(handled?.replyToken).toBe('reply-token-abc');
    expect(JSON.stringify(handled?.messages)).toContain(booking.code);
  });

  it('says so politely when there is nothing booked', async () => {
    const lineUserId = 'U_no_booking';
    await withTenant(shop.tenantId, (tx) => ensureCustomer(tx, shop.tenantId, lineUserId));

    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx, textEvent('คิวของฉัน', lineUserId)),
    );
    expect(JSON.stringify(handled?.messages)).toContain('ยังไม่มีคิว');
  });

  it('does not show one customer bookings to another', async () => {
    const mine = await withTenant(shop.tenantId, (tx) =>
      ensureCustomer(tx, shop.tenantId, 'U_mine', 'เจ้าของคิว'),
    );
    const date = DateTime.now().setZone(ZONE).plus({ days: 4 }).toISODate()!;
    const slots = await getAvailability({
      tenantId: shop.tenantId,
      date,
      serviceIds: [shop.serviceId],
    });
    const booking = await createBooking({
      tenantId: shop.tenantId,
      customerId: mine,
      startsAt: slots[0]!.start,
      serviceIds: [shop.serviceId],
    });

    await withTenant(shop.tenantId, (tx) => ensureCustomer(tx, shop.tenantId, 'U_stranger'));
    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx, textEvent('คิวของฉัน', 'U_stranger')),
    );

    expect(JSON.stringify(handled?.messages)).not.toContain(booking.code);
  });

  it('replies with the shop contact details', async () => {
    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx, textEvent('ติดต่อ')),
    );
    const body = JSON.stringify(handled?.messages);
    expect(body).toContain('02-000-0000');
    expect(body).toContain('ถนนทดสอบ');
  });

  it('offers the LIFF link when asked to book', async () => {
    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx, textEvent('จองคิว')),
    );
    expect(JSON.stringify(handled?.messages)).toContain('liff.line.me/1234567890-abcdefgh');
  });

  it('falls back to the help text for anything it does not understand', async () => {
    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx, textEvent('สวัสดีครับ อยากทราบราคา')),
    );
    expect(JSON.stringify(handled?.messages)).toContain('คิวของฉัน');
  });

  it('creates a customer record when someone follows the account', async () => {
    const follow: LineWebhookEvent = {
      type: 'follow',
      replyToken: 'reply-follow',
      timestamp: Date.now(),
      source: { type: 'user', userId: 'U_new_follower' },
    };

    await withTenant(shop.tenantId, (tx) => handleEvent(tx, ctx, follow));

    const [customer] = await withTenant(shop.tenantId, (tx) =>
      tx
        .select({ id: schema.customer.id })
        .from(schema.customer)
        .where(eq(schema.customer.lineUserId, 'U_new_follower')),
    );
    expect(customer).toBeDefined();
  });

  it('does not create a duplicate when the same person follows twice', async () => {
    const follow: LineWebhookEvent = {
      type: 'follow',
      replyToken: 'reply-follow',
      timestamp: Date.now(),
      source: { type: 'user', userId: 'U_repeat' },
    };

    await withTenant(shop.tenantId, (tx) => handleEvent(tx, ctx, follow));
    await withTenant(shop.tenantId, (tx) => handleEvent(tx, ctx, follow));

    const rows = await withTenant(shop.tenantId, (tx) =>
      tx
        .select({ id: schema.customer.id })
        .from(schema.customer)
        .where(eq(schema.customer.lineUserId, 'U_repeat')),
    );
    expect(rows).toHaveLength(1);
  });

  it('ignores events it has no answer for', async () => {
    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx, {
        type: 'message',
        replyToken: 'r',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'U1' },
        message: { type: 'sticker', id: 's1' },
      }),
    );
    expect(handled).toBeNull();
  });
});
