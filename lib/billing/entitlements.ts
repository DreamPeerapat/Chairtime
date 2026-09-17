/**
 * What a shop's plan actually lets it do.
 *
 * Keyed on the plan's code rather than on columns, because the differences
 * between plans are not all numbers — "sees the revenue chart" is a screen,
 * not a limit — and scattering half of them in the database and half in the
 * code is how a shop ends up paying for Pro and getting Basic.
 *
 * The rule when anything is uncertain is Basic. A shop on a trial, a shop
 * whose plan row was deleted, a code this file has never heard of: all get the
 * smaller set. Guessing upwards gives away what somebody else is paying for.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { planByCode } from './catalog';

export interface Entitlements {
  /** null = no limit */
  maxPortfolioItems: number | null;
  /** the revenue chart and any range other than today */
  reports: boolean;
  /** points, tiers and rewards — still behind LOYALTY_ENABLED as well */
  loyalty: boolean;
}

const BASIC: Entitlements = { maxPortfolioItems: 10, reports: false, loyalty: false };
const PRO: Entitlements = { maxPortfolioItems: null, reports: true, loyalty: true };

export function entitlementsForPlanCode(code: string | null | undefined): Entitlements {
  if (code === 'pro') return PRO;

  // Everything else — basic, trial, an unknown code, no plan at all — is the
  // smaller set. The catalogue still decides the number, so a change to the
  // portfolio cap happens in one place.
  const plan = planByCode(code ?? '') ?? planByCode('basic');
  return { ...BASIC, maxPortfolioItems: plan?.maxPortfolioItems ?? BASIC.maxPortfolioItems };
}

/**
 * The shop's entitlements, read from its plan.
 *
 * `tenant` sits outside RLS, so this is a plain indexed lookup and callers do
 * not have to be inside withTenant to ask.
 */
export async function entitlementsFor(tenantId: string): Promise<Entitlements> {
  const [row] = await db
    .select({ code: schema.subscriptionPlan.code })
    .from(schema.tenant)
    .leftJoin(schema.subscriptionPlan, eq(schema.subscriptionPlan.id, schema.tenant.planId))
    .where(eq(schema.tenant.id, tenantId));

  return entitlementsForPlanCode(row?.code ?? null);
}
