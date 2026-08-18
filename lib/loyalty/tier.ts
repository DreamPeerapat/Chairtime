/**
 * Daily tier promotion/demotion — docs/logic.md ข้อ 3.5.
 *
 * Each membership_tier has its own qualify_window_months, so "does this
 * customer qualify for Gold" and "...for Platinum" can each look at a
 * different trailing window — a customer is evaluated tier by tier,
 * highest level first, and the first one they clear wins.
 *
 * Promotion is immediate. Demotion gets a 30-day grace period
 * (`customer_tier.valid_until`): the first day a customer falls short,
 * the deadline is set and a warning goes out; nothing else happens again
 * until either they requalify (deadline cleared) or the deadline passes
 * (actually demoted then). `is_manual = true` customers are never touched.
 */
import { DateTime } from 'luxon';
import { and, desc, eq, gte } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import { enqueue } from '@/lib/notifications/queue';
import { dedupeKey } from '@/lib/notifications/templates';

export interface TierRunResult {
  promoted: number;
  demotionWarned: number;
  demoted: number;
  requalified: number;
}

type MembershipTierRow = typeof schema.membershipTier.$inferSelect;

export async function recalculateTiersForTenant(
  tx: TenantTx,
  tenantId: string,
  today: DateTime = DateTime.now(),
): Promise<TierRunResult> {
  const result: TierRunResult = { promoted: 0, demotionWarned: 0, demoted: 0, requalified: 0 };

  const tiers = await tx
    .select()
    .from(schema.membershipTier)
    .where(eq(schema.membershipTier.tenantId, tenantId))
    .orderBy(desc(schema.membershipTier.level));
  if (tiers.length === 0) return result;

  const customers = await tx
    .select({ id: schema.customer.id })
    .from(schema.customer)
    .where(eq(schema.customer.tenantId, tenantId));

  for (const customer of customers) {
    await evaluateCustomer(tx, tenantId, customer.id, tiers, today, result);
  }

  return result;
}

async function evaluateCustomer(
  tx: TenantTx,
  tenantId: string,
  customerId: string,
  tiers: MembershipTierRow[],
  today: DateTime,
  result: TierRunResult,
): Promise<void> {
  const [current] = await tx
    .select()
    .from(schema.customerTier)
    .where(eq(schema.customerTier.customerId, customerId));
  if (current?.isManual) return;

  const currentLevel = current ? (tiers.find((t) => t.id === current.tierId)?.level ?? 0) : 0;

  let qualifying: MembershipTierRow | null = null;
  for (const tier of tiers) {
    const { spend, visits } = await windowAggregates(tx, tenantId, customerId, tier.qualifyWindowMonths, today);
    if (spend >= Number(tier.qualifySpend) && visits >= tier.qualifyVisits) {
      qualifying = tier;
      break; // tiers is sorted highest level first
    }
  }
  const qualifyingLevel = qualifying?.level ?? 0;

  if (qualifyingLevel > currentLevel) {
    await tx
      .insert(schema.customerTier)
      .values({ customerId, tierId: qualifying!.id, achievedAt: today.toJSDate(), validUntil: null, isManual: false })
      .onConflictDoUpdate({
        target: schema.customerTier.customerId,
        set: { tierId: qualifying!.id, achievedAt: today.toJSDate(), validUntil: null },
      });

    await enqueue(tx, {
      tenantId,
      customerId,
      template: 'tier_up',
      scheduledAt: today,
      payload: { tierName: qualifying!.name },
      dedupeKey: dedupeKey('tier_up', 'customer', customerId, `${qualifying!.id}:${today.toISODate()}`),
    });
    result.promoted += 1;
    return;
  }

  if (qualifyingLevel < currentLevel) {
    if (!current) return; // currentLevel > 0 implies a row exists; defensive only

    if (!current.validUntil) {
      const deadline = today.plus({ days: 30 });
      await tx
        .update(schema.customerTier)
        .set({ validUntil: deadline.toISODate() })
        .where(eq(schema.customerTier.customerId, customerId));

      const tierName = tiers.find((t) => t.id === current.tierId)?.name ?? '';
      await enqueue(tx, {
        tenantId,
        customerId,
        template: 'tier_at_risk',
        scheduledAt: today,
        payload: { tierName, deadline: deadline.toISODate() },
        dedupeKey: dedupeKey('tier_at_risk', 'customer', customerId, `${current.tierId}:${today.toISODate()}`),
      });
      result.demotionWarned += 1;
      return;
    }

    if (today.toISODate()! >= current.validUntil) {
      if (qualifying) {
        await tx
          .update(schema.customerTier)
          .set({ tierId: qualifying.id, achievedAt: today.toJSDate(), validUntil: null })
          .where(eq(schema.customerTier.customerId, customerId));
      } else {
        await tx.delete(schema.customerTier).where(eq(schema.customerTier.customerId, customerId));
      }
      result.demoted += 1;
    }
    // else: still inside the grace period and already warned — nothing to do today.
    return;
  }

  // qualifyingLevel === currentLevel: requalified during a grace period clears the risk flag.
  if (current?.validUntil) {
    await tx
      .update(schema.customerTier)
      .set({ validUntil: null })
      .where(eq(schema.customerTier.customerId, customerId));
    result.requalified += 1;
  }
}

async function windowAggregates(
  tx: TenantTx,
  tenantId: string,
  customerId: string,
  windowMonths: number,
  today: DateTime,
): Promise<{ spend: number; visits: number }> {
  const since = today.minus({ months: windowMonths }).toJSDate();
  const rows = await tx
    .select({ total: schema.booking.total })
    .from(schema.booking)
    .where(
      and(
        eq(schema.booking.tenantId, tenantId),
        eq(schema.booking.customerId, customerId),
        eq(schema.booking.status, 'completed'),
        gte(schema.booking.completedAt, since),
      ),
    );
  return { spend: rows.reduce((sum, r) => sum + Number(r.total), 0), visits: rows.length };
}
