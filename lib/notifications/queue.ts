/**
 * Writing to notification_queue.
 *
 * Iron rule #6: no code path sends a LINE message directly. Everything lands
 * here first, with a dedupe key, and the worker does the sending. LINE's API
 * goes down often enough that a queue with retries is the difference between a
 * lost reminder and a late one.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import { REMINDER_OFFSETS, dedupeKey, type NotificationTemplate } from './templates';

export interface EnqueueInput {
  tenantId: string;
  customerId: string | null;
  template: NotificationTemplate;
  scheduledAt: DateTime;
  payload?: Record<string, unknown>;
  dedupeKey: string;
  channel?: 'line' | 'sms' | 'email';
}

/**
 * Insert one queued message. A duplicate dedupe key is not an error — it means
 * the message is already scheduled, which is exactly what we want.
 */
export async function enqueue(tx: TenantTx, input: EnqueueInput): Promise<void> {
  await tx
    .insert(schema.notificationQueue)
    .values({
      tenantId: input.tenantId,
      customerId: input.customerId,
      channel: input.channel ?? 'line',
      template: input.template,
      payload: input.payload ?? {},
      scheduledAt: input.scheduledAt.toJSDate(),
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing({ target: schema.notificationQueue.dedupeKey });
}

export interface BookingNotificationContext {
  tenantId: string;
  bookingId: string;
  customerId: string | null;
  startsAt: DateTime;
  /** used to drop reminders that would fire in the past */
  now: DateTime;
}

/**
 * Everything a new booking should trigger: the confirmation now, and each
 * reminder at its offset before the appointment.
 *
 * A booking made an hour before the appointment gets no 24-hour reminder —
 * sending one immediately would be noise, and sending it in the past is
 * meaningless.
 */
export async function enqueueBookingConfirmation(
  tx: TenantTx,
  ctx: BookingNotificationContext,
): Promise<void> {
  if (!ctx.customerId) return; // walk-in with no customer record: nobody to notify

  await enqueue(tx, {
    tenantId: ctx.tenantId,
    customerId: ctx.customerId,
    template: 'booking_confirmed',
    scheduledAt: ctx.now,
    payload: { bookingId: ctx.bookingId },
    dedupeKey: dedupeKey('booking_confirmed', 'booking', ctx.bookingId),
  });

  for (const [template, offset] of Object.entries(REMINDER_OFFSETS)) {
    const sendAt = ctx.startsAt.minus({ minutes: offset.minutesBefore });
    if (sendAt <= ctx.now) continue;

    await enqueue(tx, {
      tenantId: ctx.tenantId,
      customerId: ctx.customerId,
      template: template as NotificationTemplate,
      scheduledAt: sendAt,
      payload: { bookingId: ctx.bookingId },
      dedupeKey: dedupeKey(template as NotificationTemplate, 'booking', ctx.bookingId),
    });
  }
}

/**
 * Cancelling must retract the reminders. Rows already sent stay as they are —
 * the queue is a log as well as a to-do list.
 */
export async function cancelBookingNotifications(
  tx: TenantTx,
  tenantId: string,
  bookingId: string,
): Promise<void> {
  await tx
    .update(schema.notificationQueue)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(schema.notificationQueue.tenantId, tenantId),
        eq(schema.notificationQueue.status, 'pending'),
        sql`${schema.notificationQueue.payload} ->> 'bookingId' = ${bookingId}`,
      ),
    );
}

export interface DueNotification {
  id: number;
  tenantId: string;
  customerId: string | null;
  template: string;
  payload: Record<string, unknown>;
  attempts: number;
}

const MAX_ATTEMPTS = 5;

/**
 * Claim due messages for this worker run.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes it safe to run two workers, or to have
 * a cron run overlap with the previous one: each row is handed to exactly one
 * worker and the others move on instead of blocking.
 */
export async function claimDueNotifications(
  tx: TenantTx,
  tenantId: string,
  now: DateTime,
  limit = 50,
): Promise<DueNotification[]> {
  const rows = await tx.execute<{
    id: string;
    tenant_id: string;
    customer_id: string | null;
    template: string;
    payload: Record<string, unknown>;
    attempts: number;
  }>(sql`
    SELECT id, tenant_id, customer_id, template, payload, attempts
      FROM notification_queue
     WHERE tenant_id = ${tenantId}
       AND status = 'pending'
       AND scheduled_at <= ${now.toISO()}::timestamptz
       AND attempts < ${MAX_ATTEMPTS}
     ORDER BY scheduled_at
     LIMIT ${limit}
     FOR UPDATE SKIP LOCKED
  `);

  return [...rows].map((row) => ({
    id: Number(row.id),
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    template: row.template,
    payload: row.payload ?? {},
    attempts: row.attempts,
  }));
}

export async function markSent(tx: TenantTx, id: number, now: DateTime): Promise<void> {
  await tx
    .update(schema.notificationQueue)
    .set({ status: 'sent', sentAt: now.toJSDate(), attempts: sql`${schema.notificationQueue.attempts} + 1` })
    .where(eq(schema.notificationQueue.id, id));
}

/**
 * A failure that may succeed later stays pending until MAX_ATTEMPTS; one that
 * never will (a malformed message, a revoked token) is failed immediately so it
 * stops consuming worker time.
 */
export async function markFailed(
  tx: TenantTx,
  id: number,
  error: string,
  options: { permanent?: boolean; attempts: number } = { attempts: 0 },
): Promise<void> {
  const nextAttempts = options.attempts + 1;
  const exhausted = options.permanent || nextAttempts >= MAX_ATTEMPTS;
  await tx
    .update(schema.notificationQueue)
    .set({
      status: exhausted ? 'failed' : 'pending',
      attempts: nextAttempts,
      lastError: error.slice(0, 2000),
    })
    .where(eq(schema.notificationQueue.id, id));
}

export async function cancelByDedupeKeys(tx: TenantTx, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await tx
    .update(schema.notificationQueue)
    .set({ status: 'cancelled' })
    .where(
      and(
        inArray(schema.notificationQueue.dedupeKey, keys),
        eq(schema.notificationQueue.status, 'pending'),
      ),
    );
}
