/**
 * Iron rule #6 end to end: booking creates queued messages, nothing is sent
 * from a request path, the dedupe key stops duplicates, and cancelling retracts
 * reminders that have not gone out yet.
 *
 * The LINE transport is a recording client, so no credentials are needed and
 * the assertions are about what *would* be sent.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { and, eq } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { cancelBooking, createBooking, markNoShow } from '@/lib/booking';
import { getAvailability } from '@/lib/availability';
import { createRecordingLineClient } from '@/lib/line/client';
import { processTenant } from '@/lib/notifications/worker';
import { enqueue } from '@/lib/notifications/queue';
import { dedupeKey } from '@/lib/notifications/templates';
import { createSimpleShop, resetDatabase } from '../support/db';

const ZONE = 'Asia/Bangkok';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

async function linkCustomerToLine(userId = 'U_test_line_user') {
  await withTenant(shop.tenantId, (tx) =>
    tx
      .update(schema.customer)
      .set({ lineUserId: userId })
      .where(eq(schema.customer.id, shop.customerId)),
  );
  return userId;
}

async function queuedFor(bookingId: string) {
  return withTenant(shop.tenantId, (tx) =>
    tx
      .select({
        template: schema.notificationQueue.template,
        status: schema.notificationQueue.status,
        scheduledAt: schema.notificationQueue.scheduledAt,
        dedupeKey: schema.notificationQueue.dedupeKey,
      })
      .from(schema.notificationQueue)
      .where(eq(schema.notificationQueue.tenantId, shop.tenantId)),
  ).then((rows) => rows.filter((r) => r.dedupeKey?.includes(bookingId)));
}

async function bookSomething(dayOffset = 3) {
  const date = DateTime.now().setZone(ZONE).plus({ days: dayOffset }).toISODate()!;
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
  });
}

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'notify', staffCount: 1, chairCount: 1 });
});

describe('queueing on booking', () => {
  it('queues a confirmation plus both reminders', async () => {
    const booking = await bookSomething();
    const rows = await queuedFor(booking.id);

    expect(rows.map((r) => r.template).sort()).toEqual([
      'booking_confirmed',
      'reminder_24h',
      'reminder_2h',
    ]);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
  });

  it('schedules each reminder at its offset before the appointment', async () => {
    const booking = await bookSomething();
    const rows = await queuedFor(booking.id);
    const at = (template: string) =>
      DateTime.fromJSDate(rows.find((r) => r.template === template)!.scheduledAt);

    expect(booking.startsAt.diff(at('reminder_24h'), 'minutes').minutes).toBe(1440);
    expect(booking.startsAt.diff(at('reminder_2h'), 'minutes').minutes).toBe(120);
  });

  it('skips a reminder that would have to fire in the past', async () => {
    // Booked for tomorrow: the 24-hour reminder is already overdue.
    const date = DateTime.now().setZone(ZONE).plus({ days: 1 }).toISODate()!;
    const slots = await getAvailability({
      tenantId: shop.tenantId,
      date,
      serviceIds: [shop.serviceId],
    });
    const booking = await createBooking({
      tenantId: shop.tenantId,
      customerId: shop.customerId,
      startsAt: slots[0]!.start,
      serviceIds: [shop.serviceId],
    });

    const templates = (await queuedFor(booking.id)).map((r) => r.template);
    expect(templates).toContain('booking_confirmed');
    expect(templates).not.toContain('reminder_24h');
  });

  it('queues nothing for a walk-in with no customer record', async () => {
    const date = DateTime.now().setZone(ZONE).plus({ days: 4 }).toISODate()!;
    const slots = await getAvailability({
      tenantId: shop.tenantId,
      date,
      serviceIds: [shop.serviceId],
    });
    const booking = await createBooking({
      tenantId: shop.tenantId,
      customerId: null,
      startsAt: slots[0]!.start,
      serviceIds: [shop.serviceId],
      source: 'walk_in',
    });

    expect(await queuedFor(booking.id)).toHaveLength(0);
  });

  it('will not queue the same message twice', async () => {
    const booking = await bookSomething();
    const key = dedupeKey('reminder_24h', 'booking', booking.id);

    await withTenant(shop.tenantId, (tx) =>
      enqueue(tx, {
        tenantId: shop.tenantId,
        customerId: shop.customerId,
        template: 'reminder_24h',
        scheduledAt: DateTime.now(),
        dedupeKey: key,
      }),
    );

    const matching = (await queuedFor(booking.id)).filter((r) => r.dedupeKey === key);
    expect(matching).toHaveLength(1);
  });
});

describe('cancelling', () => {
  it('retracts the pending reminders and queues a cancellation notice', async () => {
    const booking = await bookSomething();
    await cancelBooking({ tenantId: shop.tenantId, bookingId: booking.id });

    const rows = await queuedFor(booking.id);
    const byTemplate = new Map(rows.map((r) => [r.template, r.status]));

    expect(byTemplate.get('reminder_24h')).toBe('cancelled');
    expect(byTemplate.get('reminder_2h')).toBe('cancelled');
    expect(byTemplate.get('booking_cancelled')).toBe('pending');
  });

  it('retracts reminders on a no-show too', async () => {
    const booking = await bookSomething();
    await markNoShow({ tenantId: shop.tenantId, bookingId: booking.id });

    const rows = await queuedFor(booking.id);
    expect(rows.find((r) => r.template === 'reminder_24h')!.status).toBe('cancelled');
  });
});

describe('worker', () => {
  it('sends a due message and marks it sent', async () => {
    const lineUserId = await linkCustomerToLine();
    const booking = await bookSomething();
    const client = createRecordingLineClient();

    const result = await processTenant(shop.tenantId, {
      clientFactory: async () => client,
      now: DateTime.now().plus({ minutes: 1 }),
    });

    expect(result.sent).toBe(1); // only booking_confirmed is due yet
    expect(client.sent).toHaveLength(1);
    expect(client.sent[0]!.kind).toBe('push');
    expect(client.sent[0]!.to).toBe(lineUserId);
    expect(JSON.stringify(client.sent[0]!.messages)).toContain(booking.code);
  });

  it('does not send the same message on the next run', async () => {
    await linkCustomerToLine();
    await bookSomething();
    const client = createRecordingLineClient();
    const at = DateTime.now().plus({ minutes: 1 });

    await processTenant(shop.tenantId, { clientFactory: async () => client, now: at });
    const second = await processTenant(shop.tenantId, { clientFactory: async () => client, now: at });

    expect(second.claimed).toBe(0);
    expect(client.sent).toHaveLength(1);
  });

  it('sends the reminder once its scheduled time arrives', async () => {
    await linkCustomerToLine();
    const booking = await bookSomething();
    const client = createRecordingLineClient();

    // Stand two hours before the appointment: everything is due.
    await processTenant(shop.tenantId, {
      clientFactory: async () => client,
      now: booking.startsAt.minus({ minutes: 119 }),
    });

    const altTexts = client.sent.flatMap((s) =>
      s.messages.map((m) => ('altText' in m ? m.altText : '')),
    );
    expect(altTexts.some((t) => t.includes('พรุ่งนี้'))).toBe(true);
    expect(altTexts.some((t) => t.includes('2 ชั่วโมง'))).toBe(true);
  });

  it('leaves messages queued when the shop has no LINE channel yet', async () => {
    await linkCustomerToLine();
    await bookSomething();

    const result = await processTenant(shop.tenantId, {
      clientFactory: async () => null,
      now: DateTime.now().plus({ minutes: 1 }),
    });

    expect(result.skipped).toBeGreaterThan(0);
    expect(result.sent).toBe(0);

    const stillPending = await withTenant(shop.tenantId, (tx) =>
      tx
        .select({ id: schema.notificationQueue.id })
        .from(schema.notificationQueue)
        .where(
          and(
            eq(schema.notificationQueue.tenantId, shop.tenantId),
            eq(schema.notificationQueue.status, 'pending'),
          ),
        ),
    );
    expect(stillPending.length).toBeGreaterThan(0);
  });

  it('retries a transient failure and gives up after five attempts', async () => {
    await linkCustomerToLine();
    await bookSomething();

    const failing = {
      reply: async () => {},
      push: async () => {
        throw new Error('ECONNRESET');
      },
    };
    const now = DateTime.now().plus({ minutes: 1 });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await processTenant(shop.tenantId, {
        clientFactory: async () => failing,
        now,
      });
      expect(result.failed).toBeGreaterThan(0);
    }

    const [row] = await withTenant(shop.tenantId, (tx) =>
      tx
        .select({ status: schema.notificationQueue.status, attempts: schema.notificationQueue.attempts })
        .from(schema.notificationQueue)
        .where(
          and(
            eq(schema.notificationQueue.tenantId, shop.tenantId),
            eq(schema.notificationQueue.template, 'booking_confirmed'),
          ),
        ),
    );
    expect(row!.attempts).toBe(5);
    expect(row!.status).toBe('failed');
  });

  it('does not remind a customer about a booking that was cancelled after queueing', async () => {
    await linkCustomerToLine();
    const booking = await bookSomething();

    // Force the reminder due without cancelling its queue row, which is what a
    // status change made outside the cancel path would look like.
    await withTenant(shop.tenantId, (tx) =>
      tx
        .update(schema.booking)
        .set({ status: 'cancelled' })
        .where(eq(schema.booking.id, booking.id)),
    );

    const client = createRecordingLineClient();
    await processTenant(shop.tenantId, {
      clientFactory: async () => client,
      now: booking.startsAt.minus({ minutes: 119 }),
    });

    const altTexts = client.sent.flatMap((s) =>
      s.messages.map((m) => ('altText' in m ? m.altText : '')),
    );
    expect(altTexts.some((t) => t.includes('พรุ่งนี้'))).toBe(false);
    expect(altTexts.some((t) => t.includes('2 ชั่วโมง'))).toBe(false);
  });

  it('skips a customer who has never linked their LINE account', async () => {
    await bookSomething(); // customer has no line_user_id
    const client = createRecordingLineClient();

    const result = await processTenant(shop.tenantId, {
      clientFactory: async () => client,
      now: DateTime.now().plus({ minutes: 1 }),
    });

    expect(client.sent).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });
});
