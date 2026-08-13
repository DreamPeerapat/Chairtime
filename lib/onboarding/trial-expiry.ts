/**
 * docs/logic.md ข้อ 1.5 "จุดที่ต้องระวัง": a trial that runs out and never
 * pays should stop working, not silently keep going forever.
 * `trial_ends_at` is only ever set on trial-plan tenants, so a plain
 * comparison already implies `plan.code = 'trial'` without a join.
 */
import { and, eq, lt } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';

export async function suspendExpiredTrials(now: Date = new Date()): Promise<number> {
  const rows = await db
    .update(schema.tenant)
    .set({ status: 'suspended' })
    .where(and(eq(schema.tenant.status, 'active'), lt(schema.tenant.trialEndsAt, now)))
    .returning({ id: schema.tenant.id });
  return rows.length;
}
