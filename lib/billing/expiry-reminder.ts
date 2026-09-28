/**
 * Telling a shop its plan is about to run out.
 *
 * A shop used to find out by opening the billing page, or on the morning it
 * could no longer take bookings. Two LINE messages to the owner now: a week
 * ahead, and the day before. Both go through notification_queue like every
 * other message (iron rule #6), keyed on the period's end so a shop that
 * renews starts afresh and one that does not is told once per stage.
 *
 * Run once a day from /api/cron/trial-expiry. A daily run that finds a shop
 * five days out still sends the week's warning — the stage is a range, not a
 * single day, so a missed run is caught by the next one.
 */
import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { enqueue } from '@/lib/notifications/queue';
import { dedupeKey } from '@/lib/notifications/templates';
import { describe } from './access';

export type PlanReminderStage = '7d' | '1d';

export function planReminderStage(daysLeft: number | null): PlanReminderStage | null {
  if (daysLeft === null || daysLeft < 0) return null;
  if (daysLeft <= 1) return '1d';
  if (daysLeft <= 7) return '7d';
  return null;
}

export function planReminderDedupeKey(
  tenantId: string,
  periodEnd: DateTime,
  stage: PlanReminderStage,
): string {
  return dedupeKey('plan_expiring', 'tenant', tenantId, `${periodEnd.toUTC().toISODate()}:${stage}`);
}

/** Nine in the morning, shop time: the cron runs in the small hours. */
const SEND_FROM_HOUR = 9;
const SEND_UNTIL_HOUR = 20;

export function planReminderSendAt(now: DateTime, zone: string): DateTime {
  const local = now.setZone(zone);
  if (local.hour < SEND_FROM_HOUR) return local.set({ hour: SEND_FROM_HOUR, minute: 0, second: 0, millisecond: 0 });
  if (local.hour >= SEND_UNTIL_HOUR) {
    return local.plus({ days: 1 }).set({ hour: SEND_FROM_HOUR, minute: 0, second: 0, millisecond: 0 });
  }
  return local;
}

/** Queue whatever warnings are due today. Returns how many were written or already there. */
export async function enqueuePlanExpiryReminders(now: DateTime = DateTime.now()): Promise<number> {
  // `tenant` sits outside RLS; each insert below is scoped with withTenant.
  const rows = await db
    .select({
      id: schema.tenant.id,
      status: schema.tenant.status,
      shopName: schema.tenant.name,
      trialEndsAt: schema.tenant.trialEndsAt,
      paidUntil: schema.tenant.paidUntil,
      timezone: schema.tenant.timezone,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.status, 'active'));

  let queued = 0;
  for (const row of rows) {
    const state = describe({ ...row, planCode: null, planName: null, priceMonthly: null }, now);
    const stage = planReminderStage(state.daysLeft);
    if (!stage || !state.periodEnd) continue;

    const periodEnd = state.periodEnd;
    await withTenant(row.id, (tx) =>
      enqueue(tx, {
        tenantId: row.id,
        customerId: null,
        template: 'plan_expiring',
        scheduledAt: planReminderSendAt(now, row.timezone),
        // The worker re-reads the tenant before sending; this is what it
        // compares against to tell a renewed shop from one still lapsing.
        payload: { periodEnd: periodEnd.toISO() },
        dedupeKey: planReminderDedupeKey(row.id, periodEnd, stage),
      }),
    );
    queued += 1;
  }
  return queued;
}
