/**
 * Reward catalog and redemption — docs/roadmap.md Phase 6. A customer spends
 * points on a reward and gets a short code back; a staff member types that
 * code in at the counter to mark it used ("ให้พนักงานสแกน" — a manual code
 * entry satisfies this without adding a camera/QR-scanning dependency).
 */
import { DateTime } from 'luxon';
import { and, eq, lt, sql } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import { findSqlState } from '@/lib/booking/errors';
import { generateBookingCode } from '@/lib/booking/code';
import { deductPointsFifo } from './redeem';
import { getCustomerTierLevel } from './rules';
import {
  RewardCodeAlreadyUsedError,
  RewardCodeExpiredError,
  RewardCodeNotFoundError,
  RewardNotEligibleError,
  RewardOutOfStockError,
} from './errors';

const UNIQUE_VIOLATION = '23505';
const MAX_CODE_ATTEMPTS = 5;
/** How long a customer has to come use a redeemed code — not specified in docs/logic.md; a reasonable default. */
const REDEMPTION_VALID_DAYS = 30;

export interface RewardCatalogItem {
  id: string;
  name: string;
  rewardType: string;
  pointCost: number;
  valueAmount: string | null;
  serviceId: string | null;
  minTierLevel: number;
}

/** What a customer at their current tier can actually redeem right now — tier-gated, in stock, in its active window. */
export async function listRewardsForCustomer(
  tx: TenantTx,
  tenantId: string,
  customerId: string,
  today: DateTime = DateTime.now(),
): Promise<RewardCatalogItem[]> {
  const tierLevel = await getCustomerTierLevel(tx, customerId);
  const todayIso = today.toISODate()!;

  const rows = await tx
    .select()
    .from(schema.reward)
    .where(and(eq(schema.reward.tenantId, tenantId), eq(schema.reward.isActive, true)));

  return rows
    .filter((r) => r.minTierLevel <= tierLevel)
    .filter((r) => !r.validFrom || r.validFrom <= todayIso)
    .filter((r) => !r.validUntil || r.validUntil >= todayIso)
    .filter((r) => r.stock === null || r.stockUsed < r.stock)
    .map((r) => ({
      id: r.id,
      name: r.name,
      rewardType: r.rewardType,
      pointCost: r.pointCost,
      valueAmount: r.valueAmount,
      serviceId: r.serviceId,
      minTierLevel: r.minTierLevel,
    }));
}

export interface RedeemRewardResult {
  code: string;
  rewardName: string;
  expiresAt: Date | null;
}

export async function redeemReward(
  tx: TenantTx,
  input: { tenantId: string; customerId: string; rewardId: string },
  today: DateTime = DateTime.now(),
): Promise<RedeemRewardResult> {
  const [reward] = await tx
    .select()
    .from(schema.reward)
    .where(and(eq(schema.reward.tenantId, input.tenantId), eq(schema.reward.id, input.rewardId)))
    .for('update');
  if (!reward || !reward.isActive) throw new RewardNotEligibleError();

  const todayIso = today.toISODate()!;
  if (reward.validFrom && reward.validFrom > todayIso) throw new RewardNotEligibleError();
  if (reward.validUntil && reward.validUntil < todayIso) {
    throw new RewardNotEligibleError('ของรางวัลนี้หมดเขตแลกแล้ว');
  }

  const tierLevel = await getCustomerTierLevel(tx, input.customerId);
  if (tierLevel < reward.minTierLevel) {
    throw new RewardNotEligibleError('ระดับสมาชิกไม่ถึงเกณฑ์การแลกของรางวัลนี้');
  }

  if (reward.stock !== null && reward.stockUsed >= reward.stock) throw new RewardOutOfStockError();

  await deductPointsFifo(tx, {
    tenantId: input.tenantId,
    customerId: input.customerId,
    points: reward.pointCost,
    sourceType: 'reward',
    sourceId: reward.id,
  });

  await tx
    .update(schema.reward)
    .set({ stockUsed: sql`${schema.reward.stockUsed} + 1` })
    .where(eq(schema.reward.id, reward.id));

  const expiresAt = today.plus({ days: REDEMPTION_VALID_DAYS }).toJSDate();

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateBookingCode();
    try {
      await tx.insert(schema.rewardRedemption).values({
        tenantId: input.tenantId,
        customerId: input.customerId,
        rewardId: reward.id,
        pointsSpent: reward.pointCost,
        code,
        status: 'issued',
        expiresAt,
      });
      return { code, rewardName: reward.name, expiresAt };
    } catch (error) {
      if (findSqlState(error) !== UNIQUE_VIOLATION || attempt === MAX_CODE_ATTEMPTS - 1) throw error;
      // code collided with an existing one for this shop — try again with a fresh code
    }
  }
  throw new Error('ออกโค้ดของรางวัลไม่สำเร็จ ลองใหม่อีกครั้ง');
}

export interface UseRewardCodeResult {
  rewardName: string;
  customerName: string;
}

/** The staff-side check-in: type the code in, mark it used. */
export async function useRewardCode(
  tx: TenantTx,
  input: { tenantId: string; code: string; bookingId?: string | null },
  now: Date = new Date(),
): Promise<UseRewardCodeResult> {
  const normalisedCode = input.code.trim().toUpperCase();

  const [redemption] = await tx
    .select()
    .from(schema.rewardRedemption)
    .where(and(eq(schema.rewardRedemption.tenantId, input.tenantId), eq(schema.rewardRedemption.code, normalisedCode)))
    .for('update');
  if (!redemption) throw new RewardCodeNotFoundError();
  if (redemption.status !== 'issued') throw new RewardCodeAlreadyUsedError(redemption.status);
  // Don't write status:'expired' here — this call is inside the caller's
  // transaction, and throwing right after would roll that write back along
  // with everything else. expireRewardCodesForTenant() sweeps these instead.
  if (redemption.expiresAt && redemption.expiresAt < now) throw new RewardCodeExpiredError();

  await tx
    .update(schema.rewardRedemption)
    .set({ status: 'used', usedAt: now, bookingId: input.bookingId ?? null })
    .where(eq(schema.rewardRedemption.id, redemption.id));

  const [reward] = await tx
    .select({ name: schema.reward.name })
    .from(schema.reward)
    .where(eq(schema.reward.id, redemption.rewardId));
  const [customer] = await tx
    .select({ name: schema.customer.name })
    .from(schema.customer)
    .where(eq(schema.customer.id, redemption.customerId));

  return { rewardName: reward?.name ?? '', customerName: customer?.name ?? '' };
}

/**
 * Daily housekeeping: flip 'issued' codes whose expiry has passed to
 * 'expired' so dashboards/reports see accurate status. useRewardCode()
 * already refuses an expired code on its own even if this hasn't run yet —
 * this only fixes up the stored status, it doesn't gate anything.
 */
export async function expireRewardCodesForTenant(
  tx: TenantTx,
  tenantId: string,
  now: Date = new Date(),
): Promise<{ expired: number }> {
  const rows = await tx
    .update(schema.rewardRedemption)
    .set({ status: 'expired' })
    .where(
      and(
        eq(schema.rewardRedemption.tenantId, tenantId),
        eq(schema.rewardRedemption.status, 'issued'),
        lt(schema.rewardRedemption.expiresAt, now),
      ),
    )
    .returning({ id: schema.rewardRedemption.id });
  return { expired: rows.length };
}
