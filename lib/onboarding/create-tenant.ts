/**
 * Provisioning a tenant for a self-serve signup — docs/logic.md ข้อ 1.5
 * "สร้าง tenant". Nothing here waits on a human: every shop is usable the
 * instant this returns, on a trial, and pays from the billing page before the
 * trial runs out.
 */
import { DateTime } from 'luxon';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { planByCode } from '@/lib/billing/catalog';
import { withTenant } from '@/lib/db/tenant';
import { findSqlState } from '@/lib/booking/errors';
import { generateUniqueSlug } from './slug';
import { copyBusinessTemplate } from './template';

const UNIQUE_VIOLATION = '23505';
const MAX_SLUG_ATTEMPTS = 5;

export class InvalidPlanError extends Error {
  readonly code = 'INVALID_PLAN';
  constructor() {
    super('ไม่พบแพ็กเกจที่เลือก');
    this.name = 'InvalidPlanError';
  }
}

export interface CreateTenantInput {
  staffUserId: string;
  shopName: string;
  businessType: string;
  planCode: string;
}

export interface CreateTenantResult {
  tenantId: string;
  tenantSlug: string;
}

/**
 * How long a new shop tries the product before it has to pay.
 *
 * Every signup starts on a trial, including one that picked a paid plan. The
 * paid path used to end on a "ยืนยันว่าโอนเงินแล้ว" button that turned the shop
 * on with no end date at all, and a tenant with no date is one the expiry cron
 * never touches — one click bought the product for ever. Paying now happens on
 * the billing page, which has the payment intent and checks the slip.
 *
 * The chosen plan is kept on the tenant, so that page offers it first.
 */
export function signupTrialDays(
  chosen: { trialDays: number },
  trialPlan: { trialDays: number } | undefined,
): number {
  if (chosen.trialDays > 0) return chosen.trialDays;
  if (trialPlan && trialPlan.trialDays > 0) return trialPlan.trialDays;
  // A missing or zeroed trial row must not produce a shop with no end date.
  return planByCode('trial')?.trialDays || 15;
}

export async function createTenantForStaff(input: CreateTenantInput): Promise<CreateTenantResult> {
  const [plan] = await db
    .select({ id: schema.subscriptionPlan.id, trialDays: schema.subscriptionPlan.trialDays })
    .from(schema.subscriptionPlan)
    .where(eq(schema.subscriptionPlan.code, input.planCode));
  if (!plan) throw new InvalidPlanError();

  const trialDays = signupTrialDays(plan, await trialPlan());
  let tenant: { id: string; slug: string } | undefined;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS && !tenant; attempt += 1) {
    const slug = await generateUniqueSlug(input.shopName, input.businessType);
    try {
      const [row] = await db
        .insert(schema.tenant)
        .values({
          slug,
          name: input.shopName,
          businessType: input.businessType,
          planId: plan.id,
          status: 'active',
          trialEndsAt: DateTime.now().plus({ days: trialDays }).toJSDate(),
        })
        .returning({ id: schema.tenant.id, slug: schema.tenant.slug });
      tenant = row;
    } catch (error) {
      if (findSqlState(error) !== UNIQUE_VIOLATION) throw error;
      // another signup took this slug between the free-slug check and this
      // insert — docs/logic.md is explicit that a name collision must never
      // fail signup, so just try again with a fresh suffix.
    }
  }
  if (!tenant) throw new Error('ไม่สามารถสร้างชื่อร้านที่ไม่ซ้ำได้ ลองใหม่อีกครั้ง');
  const created = tenant;

  await withTenant(created.id, async (tx) => {
    await tx.insert(schema.staffTenant).values({ staffId: input.staffUserId, tenantId: created.id, role: 'owner' });
    await tx.insert(schema.tenantBookingPolicy).values({ tenantId: created.id });
    await tx.insert(schema.pointRule).values({ tenantId: created.id });
    await copyBusinessTemplate(tx, created.id, input.businessType);
  });

  return { tenantId: created.id, tenantSlug: created.slug };
}

async function trialPlan(): Promise<{ trialDays: number } | undefined> {
  const [row] = await db
    .select({ trialDays: schema.subscriptionPlan.trialDays })
    .from(schema.subscriptionPlan)
    .where(eq(schema.subscriptionPlan.code, 'trial'));
  return row;
}

/**
 * A shop left at `pending_payment` by the old paid signup — it chose a plan,
 * reached the payment page and stopped there. It gets the same trial a new
 * signup gets, then pays from the billing page like everyone else.
 *
 * Only moves a tenant that is still `pending_payment`, so a second click (or
 * two tabs) cannot copy the business template twice.
 */
export async function startTrialForPendingTenant(tenantId: string, businessType: string): Promise<void> {
  const days = signupTrialDays({ trialDays: 0 }, await trialPlan());

  await withTenant(tenantId, async (tx) => {
    const moved = await tx
      .update(schema.tenant)
      .set({ status: 'active', trialEndsAt: DateTime.now().plus({ days }).toJSDate() })
      .where(and(eq(schema.tenant.id, tenantId), eq(schema.tenant.status, 'pending_payment')))
      .returning({ id: schema.tenant.id });
    if (moved.length === 0) return;

    await tx.insert(schema.tenantBookingPolicy).values({ tenantId });
    await tx.insert(schema.pointRule).values({ tenantId });
    await copyBusinessTemplate(tx, tenantId, businessType);
  });
}
