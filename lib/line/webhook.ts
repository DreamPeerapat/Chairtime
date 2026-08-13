/**
 * Handling inbound LINE messages.
 *
 * Everything here answers with a *reply* message, which is free. Push messages
 * count against the tenant's monthly quota, so the webhook never uses one —
 * anything that needs pushing goes on notification_queue instead.
 *
 * The handler is pure with respect to the transport: it returns the messages to
 * send, and the route does the sending. That is what makes it testable.
 */
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import {
  contactMessage,
  helpMessage,
  myBookingsMessage,
  type BookingMessageData,
} from './messages';
import type { LineMessage, LineWebhookEvent } from './types';

export interface WebhookContext {
  tenantId: string;
  tenantSlug: string;
  shopName: string;
  timezone: string;
  phone: string | null;
  address: string | null;
  liffId: string | null;
}

export interface HandledEvent {
  replyToken: string;
  messages: LineMessage[];
}

const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress'];

/**
 * Turn one webhook event into the messages to reply with.
 * Returns null when the event needs no answer.
 */
export async function handleEvent(
  tx: TenantTx,
  ctx: WebhookContext,
  event: LineWebhookEvent,
  now: DateTime = DateTime.now(),
): Promise<HandledEvent | null> {
  const lineUserId = event.source?.userId;

  if (event.type === 'follow' && event.replyToken) {
    // A new follower: link them to a customer record so later bookings and
    // reminders can find them.
    if (lineUserId) await ensureCustomer(tx, ctx.tenantId, lineUserId);
    return { replyToken: event.replyToken, messages: [helpMessage(ctx.shopName, bookingUrl(ctx))] };
  }

  if (event.type !== 'message' || event.message?.type !== 'text' || !event.replyToken) {
    return null;
  }

  const text = (event.message.text ?? '').trim();

  if (matches(text, ['คิวของฉัน', 'คิวฉัน', 'ดูคิว', 'my booking', 'mybooking'])) {
    if (!lineUserId) {
      return {
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: 'ขออภัยค่ะ ระบบไม่สามารถระบุตัวตนของคุณได้' }],
      };
    }
    const bookings = await loadUpcomingBookings(tx, ctx, lineUserId, now);
    return {
      replyToken: event.replyToken,
      messages: [myBookingsMessage(ctx.shopName, bookings, bookingUrl(ctx))],
    };
  }

  if (matches(text, ['จองคิว', 'จอง', 'book'])) {
    const url = bookingUrl(ctx);
    return {
      replyToken: event.replyToken,
      messages: [
        url
          ? {
              type: 'text',
              text: 'กดปุ่มด้านล่างเพื่อจองคิวได้เลยค่ะ',
              quickReply: {
                items: [{ type: 'action', action: { type: 'uri', label: 'จองคิว', uri: url } }],
              },
            }
          : { type: 'text', text: `กรุณาโทร ${ctx.phone ?? 'ที่ร้าน'} เพื่อจองคิวค่ะ` },
      ],
    };
  }

  if (matches(text, ['ติดต่อ', 'เบอร์', 'ที่อยู่', 'contact'])) {
    return {
      replyToken: event.replyToken,
      messages: [contactMessage(ctx.shopName, ctx.phone, ctx.address)],
    };
  }

  return { replyToken: event.replyToken, messages: [helpMessage(ctx.shopName, bookingUrl(ctx))] };
}

function matches(text: string, keywords: string[]): boolean {
  const normalised = text.toLowerCase().replace(/\s+/g, '');
  return keywords.some((k) => normalised === k.toLowerCase().replace(/\s+/g, ''));
}

function bookingUrl(ctx: WebhookContext): string | null {
  if (ctx.liffId) return `https://liff.line.me/${ctx.liffId}`;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  return base ? `${base.replace(/\/$/, '')}/${ctx.tenantSlug}` : null;
}

/** A follower with no customer row yet gets one, so bookings can attach to it. */
export async function ensureCustomer(
  tx: TenantTx,
  tenantId: string,
  lineUserId: string,
  displayName = 'ลูกค้า LINE',
): Promise<string> {
  const [existing] = await tx
    .select({ id: schema.customer.id })
    .from(schema.customer)
    .where(
      and(eq(schema.customer.tenantId, tenantId), eq(schema.customer.lineUserId, lineUserId)),
    );
  if (existing) return existing.id;

  const [created] = await tx
    .insert(schema.customer)
    .values({ tenantId, lineUserId, name: displayName })
    .returning({ id: schema.customer.id });
  return created!.id;
}

async function loadUpcomingBookings(
  tx: TenantTx,
  ctx: WebhookContext,
  lineUserId: string,
  now: DateTime,
): Promise<BookingMessageData[]> {
  const [customer] = await tx
    .select({ id: schema.customer.id })
    .from(schema.customer)
    .where(
      and(eq(schema.customer.tenantId, ctx.tenantId), eq(schema.customer.lineUserId, lineUserId)),
    );
  if (!customer) return [];

  const bookings = await tx
    .select({
      id: schema.booking.id,
      code: schema.booking.code,
      startsAt: schema.booking.startsAt,
      endsAt: schema.booking.endsAt,
      total: schema.booking.total,
    })
    .from(schema.booking)
    .where(
      and(
        eq(schema.booking.tenantId, ctx.tenantId),
        eq(schema.booking.customerId, customer.id),
        inArray(schema.booking.status, ACTIVE_STATUSES),
        gte(schema.booking.startsAt, now.toJSDate()),
      ),
    )
    .orderBy(asc(schema.booking.startsAt))
    .limit(5);

  if (bookings.length === 0) return [];

  const items = await tx
    .select({
      bookingId: schema.bookingItem.bookingId,
      serviceName: schema.bookingItem.serviceName,
    })
    .from(schema.bookingItem)
    .where(
      inArray(
        schema.bookingItem.bookingId,
        bookings.map((b) => b.id),
      ),
    );

  return bookings.map((b) => ({
    shopName: ctx.shopName,
    bookingCode: b.code,
    startsAt: DateTime.fromJSDate(b.startsAt).setZone(ctx.timezone),
    endsAt: DateTime.fromJSDate(b.endsAt).setZone(ctx.timezone),
    serviceNames: items.filter((i) => i.bookingId === b.id).map((i) => i.serviceName),
    staffName: null,
    total: b.total,
    manageUrl: bookingUrl(ctx),
  }));
}
