/**
 * Shared readers for the loyalty rule and a customer's current tier —
 * docs/logic.md ข้อ 3. Pure numeric helpers live here too, since rounding
 * mode is part of the rule.
 */
import { eq } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import { toSatang } from '@/lib/booking/create';

export type RoundingMode = 'floor' | 'round' | 'ceil';

export interface PointRule {
  /** a divisor, not a stored money amount — see earn.ts for why this stays a float ratio */
  bahtPerPoint: number;
  rounding: RoundingMode;
  /** iron rule #5: what one point is worth, in satang, so redeem.ts never does money math in float */
  pointValueSatang: number;
  minRedeemPoints: number;
  maxRedeemPercent: number;
  expiryMonths: number | null;
  isActive: boolean;
  signupBonus: number;
  birthdayBonus: number;
  referralBonus: number;
}

/** Mirrors the column defaults in docs/schema.sql, for the rare tenant with no row yet. */
const DEFAULT_RULE: PointRule = {
  bahtPerPoint: 100,
  rounding: 'floor',
  pointValueSatang: 100, // 1.00 baht
  minRedeemPoints: 50,
  maxRedeemPercent: 50,
  expiryMonths: null,
  isActive: true,
  signupBonus: 0,
  birthdayBonus: 0,
  referralBonus: 0,
};

export async function getPointRule(tx: TenantTx, tenantId: string): Promise<PointRule> {
  const [row] = await tx.select().from(schema.pointRule).where(eq(schema.pointRule.tenantId, tenantId));
  if (!row) return DEFAULT_RULE;

  return {
    bahtPerPoint: Number(row.bahtPerPoint),
    rounding: isRoundingMode(row.rounding) ? row.rounding : 'floor',
    pointValueSatang: toSatang(row.pointValueBaht),
    minRedeemPoints: row.minRedeemPoints,
    maxRedeemPercent: Number(row.maxRedeemPercent),
    expiryMonths: row.expiryMonths,
    isActive: row.isActive,
    signupBonus: row.signupBonus,
    birthdayBonus: row.birthdayBonus,
    referralBonus: row.referralBonus,
  };
}

function isRoundingMode(value: string): value is RoundingMode {
  return value === 'floor' || value === 'round' || value === 'ceil';
}

export function applyRounding(raw: number, mode: RoundingMode): number {
  if (mode === 'ceil') return Math.ceil(raw);
  if (mode === 'round') return Math.round(raw);
  return Math.floor(raw);
}

/** 1.00 for a customer with no tier yet — earning never requires being tiered. */
export async function getTierMultiplier(tx: TenantTx, customerId: string): Promise<number> {
  const [row] = await tx
    .select({ multiplier: schema.membershipTier.pointMultiplier })
    .from(schema.customerTier)
    .innerJoin(schema.membershipTier, eq(schema.customerTier.tierId, schema.membershipTier.id))
    .where(eq(schema.customerTier.customerId, customerId));
  return row ? Number(row.multiplier) : 1;
}

/** 0 for a customer with no tier — matches reward.min_tier_level's default of 0 (no tier required). */
export async function getCustomerTierLevel(tx: TenantTx, customerId: string): Promise<number> {
  const [row] = await tx
    .select({ level: schema.membershipTier.level })
    .from(schema.customerTier)
    .innerJoin(schema.membershipTier, eq(schema.customerTier.tierId, schema.membershipTier.id))
    .where(eq(schema.customerTier.customerId, customerId));
  return row?.level ?? 0;
}
