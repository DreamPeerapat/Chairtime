/**
 * What a shop may do, given how its subscription stands.
 *
 * `tenant.status` has been written since the first migration and the
 * trial-expiry cron has been flipping it to `suspended` every night — but
 * nothing read it. A shop whose trial ran out kept working exactly as before,
 * so the product had no way to stop anyone using it for free forever.
 *
 * The line drawn here is deliberately not "lock them out". A salon with a
 * lapsed subscription still has real customers booked for this afternoon, and
 * a shop that cannot open its own calendar will phone in a panic rather than
 * pay. So the dashboard stays readable and today's work can be finished; what
 * stops is taking *new* bookings, which is the thing they are paying for.
 */
import { and, asc, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { db, schema } from '@/lib/db/client';

export type TenantStatus = 'pending_payment' | 'active' | 'suspended' | 'cancelled';

/**
 * May this shop take a new booking?
 *
 * Checked at the one place every booking passes through, the way iron rule
 * #6 puts every outgoing message through `enqueue` — guarding the call sites
 * one at a time is how one gets missed.
 */
export function acceptsBookings(status: string): boolean {
  return status === 'active';
}

export interface BillingState {
  status: TenantStatus;
  /** never paid us anything yet — the wording differs from a lapsed renewal */
  onTrial: boolean;
  planCode: string | null;
  planName: string | null;
  priceMonthly: string | null;
  /** when the current period runs out: the trial end, or the paid-through date */
  periodEnd: DateTime | null;
  /** negative once it has passed */
  daysLeft: number | null;
  /** worth putting in front of the owner before it bites */
  expiringSoon: boolean;
}

/**
 * When the current period runs out.
 *
 * A paid period always wins over the trial: a shop that paid mid-trial keeps
 * the later date, and `trial_ends_at` is left alone so the two can still be
 * told apart on screen.
 */
export function periodEndOf(row: {
  trialEndsAt: Date | null;
  paidUntil: Date | null;
}): DateTime | null {
  if (row.paidUntil) return DateTime.fromJSDate(row.paidUntil);
  if (row.trialEndsAt) return DateTime.fromJSDate(row.trialEndsAt);
  return null;
}

/** Seven days is enough notice to transfer money without it being nagging. */
const WARN_WITHIN_DAYS = 7;

export async function loadBillingState(
  tenantId: string,
  now: DateTime = DateTime.now(),
): Promise<BillingState | null> {
  const [row] = await db
    .select({
      status: schema.tenant.status,
      trialEndsAt: schema.tenant.trialEndsAt,
      paidUntil: schema.tenant.paidUntil,
      timezone: schema.tenant.timezone,
      planCode: schema.subscriptionPlan.code,
      planName: schema.subscriptionPlan.name,
      priceMonthly: schema.subscriptionPlan.priceMonthly,
    })
    .from(schema.tenant)
    .leftJoin(schema.subscriptionPlan, eq(schema.subscriptionPlan.id, schema.tenant.planId))
    .where(eq(schema.tenant.id, tenantId));

  if (!row) return null;
  return describe(row, now);
}

type BillingRow = {
  status: string;
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  timezone: string;
  planCode: string | null;
  planName: string | null;
  priceMonthly: string | null;
};

/** Split out so the arithmetic can be tested without a database. */
export function describe(row: BillingRow, now: DateTime = DateTime.now()): BillingState {
  const end = periodEndOf(row);
  const periodEnd = end ? end.setZone(row.timezone) : null;

  // Calendar days in the shop's own zone, not elapsed hours. A period ending
  // at 23:59 tonight reads as 0 — "หมดวันนี้" — and one ending tomorrow night
  // as 1, which is how anyone reading the screen would count it. Measuring
  // hours instead makes the same evening say 0 or 1 depending on the minute.
  const daysLeft = periodEnd
    ? Math.round(
        periodEnd.startOf('day').diff(now.setZone(row.timezone).startOf('day'), 'days').days,
      )
    : null;

  return {
    status: row.status as TenantStatus,
    onTrial: row.paidUntil === null && row.trialEndsAt !== null,
    planCode: row.planCode,
    planName: row.planName,
    priceMonthly: row.priceMonthly,
    periodEnd,
    daysLeft,
    expiringSoon:
      row.status === 'active' && daysLeft !== null && daysLeft <= WARN_WITHIN_DAYS,
  };
}

export interface PurchasablePlan {
  id: string;
  code: string;
  name: string;
  priceMonthly: string;
}

/**
 * The plans a shop can actually pay for.
 *
 * Excludes anything priced at zero, which is the trial: a shop renewing is
 * choosing what to buy, and offering it "ทดลองใช้ — 0 บาท" again would be a
 * button that takes its money and changes nothing.
 */
export async function purchasablePlans(): Promise<PurchasablePlan[]> {
  const rows = await db
    .select({
      id: schema.subscriptionPlan.id,
      code: schema.subscriptionPlan.code,
      name: schema.subscriptionPlan.name,
      priceMonthly: schema.subscriptionPlan.priceMonthly,
    })
    .from(schema.subscriptionPlan)
    .where(eq(schema.subscriptionPlan.isActive, true))
    .orderBy(asc(schema.subscriptionPlan.priceMonthly));

  return rows
    .filter((r) => r.priceMonthly !== null && Number(r.priceMonthly) > 0)
    .map((r) => ({ ...r, priceMonthly: r.priceMonthly! }));
}

/** The status alone, for the booking chokepoint — no joins, no formatting. */
export async function tenantStatusOf(tenantId: string): Promise<string | null> {
  const [row] = await db
    .select({ status: schema.tenant.status })
    .from(schema.tenant)
    .where(and(eq(schema.tenant.id, tenantId)));
  return row?.status ?? null;
}
