/**
 * docs/logic.md ข้อ 1.5 "จุดที่ต้องระวัง": a period that runs out and is never
 * paid should stop working, not silently keep going forever.
 *
 * It suspends on whichever date is in force — `paid_until` once the shop has
 * renewed, `trial_ends_at` before that. Comparing only the trial date would
 * have suspended a paying shop the night its free month would have ended.
 *
 * A tenant with neither date set is left alone: that is a plan sold without
 * an expiry, not a lapse.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';

export async function suspendExpiredTrials(now: Date = new Date()): Promise<number> {
  const rows = await db
    .update(schema.tenant)
    .set({ status: 'suspended' })
    .where(
      and(
        eq(schema.tenant.status, 'active'),
        // Written out rather than built with lt(): wrapping the columns in
        // coalesce() loses the type drizzle needs to encode a Date, and the
        // driver then refuses the parameter outright.
        //
        // No IS NOT NULL guard is needed — a comparison against NULL is not
        // true, so a tenant with neither date set is left alone, which is what
        // a plan sold without an expiry should do.
        sql`coalesce(${schema.tenant.paidUntil}, ${schema.tenant.trialEndsAt}) < ${now.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: schema.tenant.id });
  return rows.length;
}
