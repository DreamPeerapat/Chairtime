/**
 * The worker that drains notification_queue.
 *
 * Runs from /api/cron/notifications every minute. Each message is claimed with
 * SKIP LOCKED, rendered, pushed, and marked — one transaction per tenant so a
 * broken channel in one shop cannot stall another's reminders.
 */
import { and, eq, gte, inArray } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import { forEachTenant, withTenant, type TenantTx } from '@/lib/db/tenant';
import { LineApiError, createLineClient, loadLineCredentials } from '@/lib/line/client';
import {
  bookingCancelledMessage,
  bookingConfirmedMessage,
  reminder24hMessage,
  reminder2hMessage,
  type BookingMessageData,
} from '@/lib/line/messages';
import type { LineClient, LineMessage } from '@/lib/line/types';
import { claimDueNotifications, markFailed, markSent, type DueNotification } from './queue';

export interface WorkerResult {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface RunOptions {
  now?: DateTime;
  limit?: number;
  /** injected by the tests; production builds one per tenant from stored credentials */
  clientFactory?: (tenantId: string) => Promise<LineClient | null>;
}

/** Drain every active tenant's queue. */
export async function runNotificationWorker(options: RunOptions = {}): Promise<WorkerResult> {
  const total: WorkerResult = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  const results = await forEachTenant((tenantId) => processTenant(tenantId, options));
  for (const { result } of results) {
    total.claimed += result.claimed;
    total.sent += result.sent;
    total.failed += result.failed;
    total.skipped += result.skipped;
  }
  return total;
}

export async function processTenant(
  tenantId: string,
  options: RunOptions = {},
): Promise<WorkerResult> {
  const now = options.now ?? DateTime.now();
  const result: WorkerResult = { claimed: 0, sent: 0, failed: 0, skipped: 0 };

  await withTenant(tenantId, async (tx) => {
    const due = await claimDueNotifications(tx, tenantId, now, options.limit ?? 50);
    result.claimed = due.length;
    if (due.length === 0) return;

    const client = options.clientFactory
      ? await options.clientFactory(tenantId)
      : await defaultClientFactory(tx, tenantId);

    if (!client) {
      // No channel configured. Leave the rows pending — the shop may connect
      // its LINE OA later, and a reminder that arrives late still beats one
      // that was thrown away.
      result.skipped = due.length;
      return;
    }

    for (const item of due) {
      try {
        const rendered = await render(tx, tenantId, item);
        if (!rendered) {
          // Nothing to send: the booking was deleted, or the customer has never
          // linked their LINE account.
          await markSent(tx, item.id, now);
          result.skipped += 1;
          continue;
        }
        await client.push(rendered.lineUserId, [rendered.message]);
        await markSent(tx, item.id, now);
        result.sent += 1;
      } catch (error) {
        const permanent = error instanceof LineApiError && !error.isRetryable;
        await markFailed(tx, item.id, String(error), { permanent, attempts: item.attempts });
        result.failed += 1;
      }
    }
  });

  return result;
}

async function defaultClientFactory(tx: TenantTx, tenantId: string): Promise<LineClient | null> {
  const credentials = await loadLineCredentials(tx, tenantId);
  return credentials ? createLineClient(credentials.channelAccessToken) : null;
}

interface Rendered {
  lineUserId: string;
  message: LineMessage;
}

async function render(
  tx: TenantTx,
  tenantId: string,
  item: DueNotification,
): Promise<Rendered | null> {
  const bookingId = typeof item.payload.bookingId === 'string' ? item.payload.bookingId : null;
  if (!bookingId) return null;

  const data = await loadBookingMessageData(tx, tenantId, bookingId);
  if (!data || !data.lineUserId) return null;

  switch (item.template) {
    case 'booking_confirmed':
      return { lineUserId: data.lineUserId, message: bookingConfirmedMessage(data.message) };
    case 'booking_cancelled':
      return { lineUserId: data.lineUserId, message: bookingCancelledMessage(data.message) };
    case 'reminder_24h':
      // A booking cancelled after the reminder was queued must not be reminded.
      return data.status === 'cancelled' || data.status === 'no_show'
        ? null
        : { lineUserId: data.lineUserId, message: reminder24hMessage(data.message) };
    case 'reminder_2h':
      return data.status === 'cancelled' || data.status === 'no_show'
        ? null
        : { lineUserId: data.lineUserId, message: reminder2hMessage(data.message) };
    default:
      return null;
  }
}

export interface LoadedBookingMessage {
  lineUserId: string | null;
  status: string;
  message: BookingMessageData;
}

/** Everything a booking notification needs, in one place. */
export async function loadBookingMessageData(
  tx: TenantTx,
  tenantId: string,
  bookingId: string,
): Promise<LoadedBookingMessage | null> {
  const [row] = await tx
    .select({
      status: schema.booking.status,
      code: schema.booking.code,
      startsAt: schema.booking.startsAt,
      endsAt: schema.booking.endsAt,
      total: schema.booking.total,
      customerId: schema.booking.customerId,
      shopName: schema.tenant.name,
      timezone: schema.tenant.timezone,
      tenantSlug: schema.tenant.slug,
    })
    .from(schema.booking)
    .innerJoin(schema.tenant, eq(schema.tenant.id, schema.booking.tenantId))
    .where(and(eq(schema.booking.tenantId, tenantId), eq(schema.booking.id, bookingId)));

  if (!row) return null;

  const items = await tx
    .select({ serviceName: schema.bookingItem.serviceName, id: schema.bookingItem.id })
    .from(schema.bookingItem)
    .where(eq(schema.bookingItem.bookingId, bookingId));

  const staffName = await loadStaffName(
    tx,
    tenantId,
    items.map((i) => i.id),
  );

  let lineUserId: string | null = null;
  if (row.customerId) {
    const [customer] = await tx
      .select({ lineUserId: schema.customer.lineUserId })
      .from(schema.customer)
      .where(eq(schema.customer.id, row.customerId));
    lineUserId = customer?.lineUserId ?? null;
  }

  const zone = row.timezone;
  return {
    lineUserId,
    status: row.status,
    message: {
      shopName: row.shopName,
      bookingCode: row.code,
      startsAt: DateTime.fromJSDate(row.startsAt).setZone(zone),
      endsAt: DateTime.fromJSDate(row.endsAt).setZone(zone),
      serviceNames: items.map((i) => i.serviceName),
      staffName,
      total: row.total,
      manageUrl: buildManageUrl(row.tenantSlug, row.code),
    },
  };
}

/** The human on the booking, if there is one. */
async function loadStaffName(
  tx: TenantTx,
  tenantId: string,
  bookingItemIds: string[],
): Promise<string | null> {
  if (bookingItemIds.length === 0) return null;
  const rows = await tx
    .select({ name: schema.resource.name, isHuman: schema.resourceType.isHuman })
    .from(schema.resourceAllocation)
    .innerJoin(schema.resource, eq(schema.resource.id, schema.resourceAllocation.resourceId))
    .innerJoin(schema.resourceType, eq(schema.resourceType.id, schema.resource.resourceTypeId))
    .where(
      and(
        eq(schema.resourceAllocation.tenantId, tenantId),
        inArray(schema.resourceAllocation.bookingItemId, bookingItemIds),
        eq(schema.resourceAllocation.isReleased, false),
      ),
    );
  return rows.find((r) => r.isHuman)?.name ?? null;
}

function buildManageUrl(tenantSlug: string, code: string): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/${tenantSlug}/booking/${code}`;
}

/** Used by the admin screens to show what is waiting to go out. */
export async function pendingCount(tx: TenantTx, tenantId: string, since: DateTime): Promise<number> {
  const rows = await tx
    .select({ id: schema.notificationQueue.id })
    .from(schema.notificationQueue)
    .where(
      and(
        eq(schema.notificationQueue.tenantId, tenantId),
        eq(schema.notificationQueue.status, 'pending'),
        gte(schema.notificationQueue.scheduledAt, since.toJSDate()),
      ),
    );
  return rows.length;
}
