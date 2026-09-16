/**
 * Telling the shop that a customer just booked or just cancelled.
 *
 * The thing worth guarding here is *who* receives it. The owner's id is not
 * the one they log in with — it is whichever LINE account sent the link code
 * to the shop's own OA — so every path in this file is about that id being
 * claimed, used, and not quietly replaced by a customer who saw the code.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { cancelBooking, createBooking } from '@/lib/booking';
import { getAvailability } from '@/lib/availability';
import { createRecordingLineClient } from '@/lib/line/client';
import { processTenant } from '@/lib/notifications/worker';
import { claimOwnerLink, ensureLinkCode, ownerLineUserId } from '@/lib/line/owner-link';
import { handleEvent } from '@/lib/line/webhook';
import { createSimpleShop, resetDatabase } from '../support/db';

const ZONE = 'Asia/Bangkok';
const OWNER = 'U_owner_phone';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'owner-alerts', staffCount: 1, chairCount: 1 });
  // The shop has connected its OA: that row is where the owner's id lands.
  await withTenant(shop.tenantId, (tx) =>
    tx.insert(schema.tenantLineOa).values({ tenantId: shop.tenantId }),
  );
});

function ctx() {
  return {
    tenantId: shop.tenantId,
    tenantSlug: 'owner-alerts',
    shopName: 'ร้านทดสอบ',
    timezone: ZONE,
    phone: null,
    address: null,
    latitude: null,
    longitude: null,
    liffId: null,
  };
}

async function linkOwner(userId = OWNER) {
  const state = await withTenant(shop.tenantId, (tx) => ensureLinkCode(tx, shop.tenantId));
  await withTenant(shop.tenantId, (tx) =>
    claimOwnerLink(tx, shop.tenantId, state.code!, userId),
  );
  return state.code!;
}

async function bookSomething(source: 'online' | 'walk_in' = 'online') {
  const date = DateTime.now().setZone(ZONE).plus({ days: 3 }).toISODate()!;
  const slots = await getAvailability({
    tenantId: shop.tenantId,
    date,
    serviceIds: [shop.serviceId],
  });
  return createBooking({
    tenantId: shop.tenantId,
    customerId: shop.customerId,
    startsAt: slots[0]!.start,
    serviceIds: [shop.serviceId],
    source,
  });
}

async function templatesFor(bookingId: string) {
  const rows = await withTenant(shop.tenantId, (tx) =>
    tx
      .select({
        template: schema.notificationQueue.template,
        status: schema.notificationQueue.status,
        dedupeKey: schema.notificationQueue.dedupeKey,
      })
      .from(schema.notificationQueue)
      .where(eq(schema.notificationQueue.tenantId, shop.tenantId)),
  );
  return rows.filter((r) => r.dedupeKey?.includes(bookingId));
}

describe('claiming the alerts', () => {
  it('records whoever sends the code, through the webhook', async () => {
    const state = await withTenant(shop.tenantId, (tx) => ensureLinkCode(tx, shop.tenantId));

    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx(), {
        type: 'message',
        timestamp: Date.now(),
        replyToken: 'reply-1',
        source: { type: 'user', userId: OWNER },
        message: { type: 'text', id: 'msg-1', text: state.code! },
      }),
    );

    expect(JSON.stringify(handled!.messages)).toContain('เชื่อมบัญชีเจ้าของร้าน');
    expect(await withTenant(shop.tenantId, (tx) => ownerLineUserId(tx, shop.tenantId))).toBe(OWNER);
  });

  it('will not hand the alerts to a second person who saw the code', async () => {
    const code = await linkOwner();

    const claimed = await withTenant(shop.tenantId, (tx) =>
      claimOwnerLink(tx, shop.tenantId, code, 'U_nosy_customer'),
    );

    expect(claimed).toBe(false);
    expect(await withTenant(shop.tenantId, (tx) => ownerLineUserId(tx, shop.tenantId))).toBe(OWNER);
  });

  it('answers an unknown code with the normal help text', async () => {
    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx(), {
        type: 'message',
        timestamp: Date.now(),
        replyToken: 'reply-2',
        source: { type: 'user', userId: 'U_customer' },
        message: { type: 'text', id: 'msg-2', text: 'CT-ZZZZZZ' },
      }),
    );

    expect(JSON.stringify(handled!.messages)).not.toContain('เชื่อมบัญชีเจ้าของร้าน');
    expect(await withTenant(shop.tenantId, (tx) => ownerLineUserId(tx, shop.tenantId))).toBeNull();
  });

  it('keeps the code the owner is halfway through typing', async () => {
    const first = await withTenant(shop.tenantId, (tx) => ensureLinkCode(tx, shop.tenantId));
    const second = await withTenant(shop.tenantId, (tx) => ensureLinkCode(tx, shop.tenantId));
    expect(second.code).toBe(first.code);
  });
});

describe('the way into the dashboard from LINE', () => {
  it('sends a login link to the phone that claimed the shop', async () => {
    await linkOwner();

    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx(), {
        type: 'message',
        timestamp: Date.now(),
        replyToken: 'reply-owner',
        source: { type: 'user', userId: OWNER },
        message: { type: 'text', id: 'msg-3', text: 'หลังร้าน' },
      }),
    );

    expect(JSON.stringify(handled!.messages)).toContain('เข้าหลังบ้าน');
  });

  it('gives a customer typing the same word the ordinary help text', async () => {
    // The word is not a secret, so the guard has to be who sent it.
    await linkOwner();

    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx(), {
        type: 'message',
        timestamp: Date.now(),
        replyToken: 'reply-customer',
        source: { type: 'user', userId: 'U_curious_customer' },
        message: { type: 'text', id: 'msg-4', text: 'หลังร้าน' },
      }),
    );

    const body = JSON.stringify(handled!.messages);
    expect(body).not.toContain('เข้าหลังบ้าน');
    expect(body).toContain('จองคิว');
  });

  it('says nothing special before anybody has claimed the shop', async () => {
    const handled = await withTenant(shop.tenantId, (tx) =>
      handleEvent(tx, ctx(), {
        type: 'message',
        timestamp: Date.now(),
        replyToken: 'reply-unclaimed',
        source: { type: 'user', userId: OWNER },
        message: { type: 'text', id: 'msg-5', text: 'หลังร้าน' },
      }),
    );

    expect(JSON.stringify(handled!.messages)).not.toContain('เข้าหลังบ้าน');
  });
});

describe('what reaches the shop', () => {
  it('queues a new-booking alert for a booking the customer made', async () => {
    const booking = await bookSomething('online');
    const rows = await templatesFor(booking.id);
    expect(rows.map((r) => r.template)).toContain('booking_created_shop');
  });

  it('stays quiet about a booking the shop typed in itself', async () => {
    const booking = await bookSomething('walk_in');
    const rows = await templatesFor(booking.id);
    expect(rows.map((r) => r.template)).not.toContain('booking_created_shop');
  });

  it('queues a cancellation alert when the customer cancels', async () => {
    const booking = await bookSomething('walk_in'); // no pending new-booking alert
    await cancelBooking({ tenantId: shop.tenantId, bookingId: booking.id });

    const rows = await templatesFor(booking.id);
    const shopAlert = rows.find((r) => r.template === 'booking_cancelled_shop');
    expect(shopAlert?.status).toBe('pending');
  });

  it('does not tell the shop about its own cancellation', async () => {
    const booking = await bookSomething('walk_in');
    await cancelBooking({ tenantId: shop.tenantId, bookingId: booking.id, actor: 'staff' });

    const rows = await templatesFor(booking.id);
    expect(rows.map((r) => r.template)).not.toContain('booking_cancelled_shop');
  });

  it('says nothing at all when a booking is made and dropped before either went out', async () => {
    // The owner never heard of this booking, so "ลูกค้ายกเลิกคิว" would be the
    // first they know of it — confusing rather than useful.
    const booking = await bookSomething('online');
    await cancelBooking({ tenantId: shop.tenantId, bookingId: booking.id });

    const rows = await templatesFor(booking.id);
    expect(rows.map((r) => r.template)).not.toContain('booking_cancelled_shop');
    expect(rows.find((r) => r.template === 'booking_created_shop')!.status).toBe('cancelled');
  });
});

describe('delivery', () => {
  it('pushes the shop alert to the owner, not to the customer', async () => {
    await linkOwner();
    await withTenant(shop.tenantId, (tx) =>
      tx
        .update(schema.customer)
        .set({ lineUserId: 'U_the_customer' })
        .where(eq(schema.customer.id, shop.customerId)),
    );

    const booking = await bookSomething('online');
    const client = createRecordingLineClient();
    await processTenant(shop.tenantId, {
      clientFactory: async () => client,
      now: DateTime.now().plus({ minutes: 1 }),
    });

    const shopPush = client.sent.find((s) => JSON.stringify(s.messages).includes('มีคิวใหม่เข้ามา'));
    expect(shopPush).toBeDefined();
    expect(shopPush!.to).toBe(OWNER);
    expect(JSON.stringify(shopPush!.messages)).toContain(booking.code);
  });

  it('skips the alert rather than losing it when nobody has linked a phone', async () => {
    await bookSomething('online');
    const client = createRecordingLineClient();

    const result = await processTenant(shop.tenantId, {
      clientFactory: async () => client,
      now: DateTime.now().plus({ minutes: 1 }),
    });

    expect(result.skipped).toBeGreaterThan(0);
    expect(JSON.stringify(client.sent)).not.toContain('มีคิวใหม่เข้ามา');
  });

  it('does not offer the shop the customer-facing cancel button', async () => {
    // The bubble the customer gets carries "ดู / เลื่อน / ยกเลิกคิว". Handing
    // the shop the same button means cancelling on the customer's behalf from
    // a notification.
    await linkOwner();
    await bookSomething('online');
    const client = createRecordingLineClient();
    await processTenant(shop.tenantId, {
      clientFactory: async () => client,
      now: DateTime.now().plus({ minutes: 1 }),
    });

    const shopPush = client.sent.find((s) => s.to === OWNER)!;
    expect(JSON.stringify(shopPush.messages)).not.toContain('ยกเลิกคิว');
  });
});
