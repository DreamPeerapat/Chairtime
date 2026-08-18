/**
 * Direct point grants that are not earned from a purchase — birthday bonus
 * today; `point_rule.signup_bonus`/`referral_bonus` exist in the schema for
 * the same mechanism later but nothing calls this for them yet (neither is
 * on the Phase 6 checklist).
 *
 * Booking-earned points (lib/loyalty/earn.ts) are idempotent against the
 * `point_ledger_idem` unique index because a booking is only ever completed
 * once. A birthday bonus recurs every year for the same customer, so the
 * same (tenant, 'earn', 'birthday', customer_id) key cannot be reused as the
 * index key without blocking every year after the first — this grants with
 * `source_id = null` instead (the index only applies when it is non-null)
 * and leaves idempotency to the caller, which must check first. See
 * lib/loyalty/tier.ts's birthday loop for the check.
 */
import { DateTime } from 'luxon';
import { and, eq, gte, sql } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';

export interface GrantBonusInput {
  tenantId: string;
  customerId: string;
  points: number;
  sourceType: string; // 'birthday' | 'signup' | 'referral'
  expiryMonths: number | null;
}

export async function grantBonusPoints(tx: TenantTx, input: GrantBonusInput): Promise<void> {
  if (input.points <= 0) return;

  const expiresAt = input.expiryMonths
    ? DateTime.now().plus({ months: input.expiryMonths }).toJSDate()
    : null;

  const [lot] = await tx
    .insert(schema.pointLot)
    .values({
      tenantId: input.tenantId,
      customerId: input.customerId,
      pointsTotal: input.points,
      pointsRemaining: input.points,
      expiresAt,
      sourceType: input.sourceType,
      sourceId: null,
    })
    .returning({ id: schema.pointLot.id });

  const [updatedCustomer] = await tx
    .update(schema.customer)
    .set({
      pointBalance: sql`${schema.customer.pointBalance} + ${input.points}`,
      lifetimePoints: sql`${schema.customer.lifetimePoints} + ${input.points}`,
    })
    .where(eq(schema.customer.id, input.customerId))
    .returning({ pointBalance: schema.customer.pointBalance });

  await tx.insert(schema.pointLedger).values({
    tenantId: input.tenantId,
    customerId: input.customerId,
    entryType: 'earn',
    points: input.points,
    balanceAfter: updatedCustomer!.pointBalance,
    lotId: lot!.id,
    sourceType: input.sourceType,
    sourceId: null,
  });
}

/** Has this customer already gotten a bonus of this kind since `since`? Used for "once per year". */
export async function hasBonusSince(
  tx: TenantTx,
  customerId: string,
  sourceType: string,
  since: Date,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: schema.pointLot.id })
    .from(schema.pointLot)
    .where(
      and(
        eq(schema.pointLot.customerId, customerId),
        eq(schema.pointLot.sourceType, sourceType),
        gte(schema.pointLot.earnedAt, since),
      ),
    )
    .limit(1);
  return !!row;
}
