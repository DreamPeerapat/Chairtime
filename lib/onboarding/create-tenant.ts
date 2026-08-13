/**
 * Provisioning a tenant for a self-serve signup — docs/logic.md ข้อ 1.5
 * "สร้าง tenant" / "ยืนยันชำระเงิน". Nothing here waits on a human: a trial
 * plan is usable the instant this returns, and a paid plan only waits on the
 * shop's own payment step.
 */
import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
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
  /** true when the shop chose a paid plan and must go through /onboarding/payment before it can be used. */
  needsPayment: boolean;
}

export async function createTenantForStaff(input: CreateTenantInput): Promise<CreateTenantResult> {
  const [plan] = await db
    .select({ id: schema.subscriptionPlan.id, trialDays: schema.subscriptionPlan.trialDays })
    .from(schema.subscriptionPlan)
    .where(eq(schema.subscriptionPlan.code, input.planCode));
  if (!plan) throw new InvalidPlanError();

  const isTrial = plan.trialDays > 0;
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
          status: isTrial ? 'active' : 'pending_payment',
          trialEndsAt: isTrial ? DateTime.now().plus({ days: plan.trialDays }).toJSDate() : null,
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
    if (isTrial) {
      await tx.insert(schema.tenantBookingPolicy).values({ tenantId: created.id });
      await copyBusinessTemplate(tx, created.id, input.businessType);
    }
  });

  return { tenantId: created.id, tenantSlug: created.slug, needsPayment: !isTrial };
}

/** POST /onboarding/payment succeeding — docs/logic.md ข้อ 1.5 "ยืนยันชำระเงิน". */
export async function activatePaidTenant(tenantId: string, businessType: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx.update(schema.tenant).set({ status: 'active' }).where(eq(schema.tenant.id, tenantId));
    await tx.insert(schema.tenantBookingPolicy).values({ tenantId });
    await copyBusinessTemplate(tx, tenantId, businessType);
  });
}
