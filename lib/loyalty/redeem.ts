/**
 * Spending points — docs/logic.md ข้อ 3.2. FIFO by expiry (soonest first, no
 * expiry last), locked with `FOR UPDATE` so two screens redeeming for the
 * same customer at once cannot both succeed against the same points.
 */
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import {
  BelowMinimumRedeemError,
  ExceedsMaxRedeemPercentError,
  InsufficientPointsError,
  PointBalanceMismatchError,
} from './errors';
import { getPointRule } from './rules';

export interface RedeemInput {
  tenantId: string;
  customerId: string;
  pointsWanted: number;
  /** iron rule #5: satang, not baht — the bill this redemption is paying down, for the max-redeem-percent check. */
  billTotalSatang: number;
  sourceType: string; // 'booking' | ...
  sourceId: string | null;
}

export interface RedeemResult {
  pointsRedeemed: number;
  /** iron rule #5: satang, not baht */
  valueSatang: number;
}

/** Paying down part of a bill with points — the min/max-of-bill rules only make sense here, not for a reward. */
export async function redeemPoints(tx: TenantTx, input: RedeemInput): Promise<RedeemResult> {
  const rule = await getPointRule(tx, input.tenantId);

  if (input.pointsWanted < rule.minRedeemPoints) {
    throw new BelowMinimumRedeemError(rule.minRedeemPoints);
  }

  const valueSatang = input.pointsWanted * rule.pointValueSatang;
  const maxAllowedSatang = Math.floor((input.billTotalSatang * rule.maxRedeemPercent) / 100);
  if (valueSatang > maxAllowedSatang) {
    throw new ExceedsMaxRedeemPercentError(rule.maxRedeemPercent);
  }

  await deductPointsFifo(tx, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    points: input.pointsWanted,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  return { pointsRedeemed: input.pointsWanted, valueSatang };
}

export interface DeductPointsInput {
  tenantId: string;
  customerId: string;
  points: number;
  sourceType: string;
  sourceId: string | null;
}

/**
 * The FIFO deduction core, shared by redeemPoints() (paying a bill) and
 * lib/loyalty/rewards.ts (buying a catalog reward) — the two have entirely
 * different eligibility rules (bill percentage vs. tier/stock), but the same
 * "take from the soonest-expiring lot first, under a lock" mechanics once a
 * point amount has been decided on.
 */
export async function deductPointsFifo(tx: TenantTx, input: DeductPointsInput): Promise<void> {
  const [customerRow] = await tx
    .select({ balance: schema.customer.pointBalance })
    .from(schema.customer)
    .where(eq(schema.customer.id, input.customerId));
  if (!customerRow || input.points > customerRow.balance) {
    throw new InsufficientPointsError();
  }

  const now = new Date();
  const lots = await tx
    .select()
    .from(schema.pointLot)
    .where(
      and(
        eq(schema.pointLot.customerId, input.customerId),
        gt(schema.pointLot.pointsRemaining, 0),
        or(isNull(schema.pointLot.expiresAt), gt(schema.pointLot.expiresAt, now)),
      ),
    )
    .orderBy(sql`${schema.pointLot.expiresAt} nulls last`, asc(schema.pointLot.earnedAt))
    .for('update');

  let remaining = input.points;
  const takes: Array<{ lotId: string; take: number }> = [];

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.pointsRemaining, remaining);
    takes.push({ lotId: lot.id, take });
    remaining -= take;
  }

  if (remaining > 0) {
    // customer.point_balance said there was enough; the lots themselves say
    // otherwise. That is exactly the corruption iron rule #2 forbids.
    throw new PointBalanceMismatchError(input.customerId);
  }

  for (const { lotId, take } of takes) {
    await tx
      .update(schema.pointLot)
      .set({ pointsRemaining: sql`${schema.pointLot.pointsRemaining} - ${take}` })
      .where(eq(schema.pointLot.id, lotId));
  }

  const [updatedCustomer] = await tx
    .update(schema.customer)
    .set({ pointBalance: sql`${schema.customer.pointBalance} - ${input.points}` })
    .where(eq(schema.customer.id, input.customerId))
    .returning({ pointBalance: schema.customer.pointBalance });

  // One row per redemption, not one per lot touched: `point_ledger_idem`
  // (drizzle/0001) allows only a single ('redeem', source_type, source_id)
  // row, and a redemption spanning several lots is still one customer action.
  // Which lots paid for it is already recorded on the lots themselves.
  await tx.insert(schema.pointLedger).values({
    tenantId: input.tenantId,
    customerId: input.customerId,
    entryType: 'redeem',
    points: -input.points,
    balanceAfter: updatedCustomer!.pointBalance,
    lotId: null,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });
}
