/** Shared helpers for the integration tests. */
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { findSqlState } from '@/lib/booking/errors';
import { withTenant } from '@/lib/db/tenant';
import { mintSessionToken } from '@/lib/auth/identity';
import type { StaffRole } from '@/lib/auth/session';

export async function resetDatabase() {
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) throw new Error('DATABASE_URL_ADMIN must be set for integration tests');
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`
      TRUNCATE TABLE
        tenant, tenant_booking_policy, resource_type, resource, service_category, service,
        service_segment, service_resource_requirement, resource_service_skill, business_hour,
        time_off, customer, booking, booking_item, resource_allocation, membership_tier,
        customer_tier, point_rule, point_lot, point_ledger, reward, reward_redemption,
        package, package_service, customer_package, notification_queue, audit_log,
        tenant_line_oa, staff_tenant, staff_auth_identity, staff_user, auth_identity
      RESTART IDENTITY CASCADE
    `);
  } finally {
    await admin.end();
  }
}

export interface SimpleShop {
  tenantId: string;
  serviceId: string;
  staffIds: string[];
  chairIds: string[];
  customerId: string;
}

/**
 * One shop, one 60-minute service, N staff and N chairs, open 10:00-20:00 all
 * week. Deliberately minimal so a test's own setup is the only moving part.
 */
export async function createSimpleShop(options: {
  slug: string;
  staffCount?: number;
  chairCount?: number;
  minLeadTimeMin?: number;
  durationMin?: number;
  pointRule?: Partial<{
    bahtPerPoint: number;
    rounding: 'floor' | 'round' | 'ceil';
    pointValueBaht: number;
    minRedeemPoints: number;
    maxRedeemPercent: number;
    expiryMonths: number | null;
  }>;
}): Promise<SimpleShop> {
  const staffCount = options.staffCount ?? 1;
  const chairCount = options.chairCount ?? 1;

  const [tenantRow] = await db
    .insert(schema.tenant)
    .values({ slug: options.slug, name: options.slug, businessType: 'hair' })
    .returning({ id: schema.tenant.id });
  const tenantId = tenantRow!.id;

  return withTenant(tenantId, async (tx) => {
    await tx.insert(schema.tenantBookingPolicy).values({
      tenantId,
      slotGranularityMin: 15,
      minLeadTimeMin: options.minLeadTimeMin ?? 0,
      maxAdvanceDays: 365,
    });

    await tx.insert(schema.pointRule).values({
      tenantId,
      bahtPerPoint: String(options.pointRule?.bahtPerPoint ?? 100),
      rounding: options.pointRule?.rounding ?? 'floor',
      pointValueBaht: String(options.pointRule?.pointValueBaht ?? 1),
      minRedeemPoints: options.pointRule?.minRedeemPoints ?? 50,
      maxRedeemPercent: String(options.pointRule?.maxRedeemPercent ?? 50),
      expiryMonths: options.pointRule?.expiryMonths ?? null,
    });

    const [staffType] = await tx
      .insert(schema.resourceType)
      .values({ tenantId, code: 'staff', name: 'ช่าง', isHuman: true })
      .returning({ id: schema.resourceType.id });
    const [chairType] = await tx
      .insert(schema.resourceType)
      .values({ tenantId, code: 'chair', name: 'เก้าอี้', isHuman: false })
      .returning({ id: schema.resourceType.id });

    const [serviceRow] = await tx
      .insert(schema.service)
      .values({ tenantId, name: 'ตัดผม', basePrice: '500.00' })
      .returning({ id: schema.service.id });
    const serviceId = serviceRow!.id;

    await tx.insert(schema.serviceSegment).values({
      serviceId,
      seq: 1,
      kind: 'active',
      durationMin: options.durationMin ?? 60,
    });
    await tx.insert(schema.serviceResourceRequirement).values([
      { serviceId, resourceTypeId: staffType!.id, quantity: 1, holdScope: 'active_only' },
      { serviceId, resourceTypeId: chairType!.id, quantity: 1, holdScope: 'whole' },
    ]);

    await tx.insert(schema.businessHour).values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        tenantId,
        resourceId: null,
        weekday,
        openTime: '10:00:00',
        closeTime: '20:00:00',
      })),
    );

    const staffIds: string[] = [];
    for (let i = 0; i < staffCount; i += 1) {
      const [row] = await tx
        .insert(schema.resource)
        .values({ tenantId, resourceTypeId: staffType!.id, name: `ช่าง ${i + 1}`, displayOrder: i })
        .returning({ id: schema.resource.id });
      staffIds.push(row!.id);
      await tx.insert(schema.resourceServiceSkill).values({ resourceId: row!.id, serviceId });
    }

    const chairIds: string[] = [];
    for (let i = 0; i < chairCount; i += 1) {
      const [row] = await tx
        .insert(schema.resource)
        .values({ tenantId, resourceTypeId: chairType!.id, name: `เก้าอี้ ${i + 1}`, displayOrder: i })
        .returning({ id: schema.resource.id });
      chairIds.push(row!.id);
    }

    const [customerRow] = await tx
      .insert(schema.customer)
      .values({ tenantId, name: 'ลูกค้าทดสอบ', phone: `09${Math.random().toString().slice(2, 10)}` })
      .returning({ id: schema.customer.id });

    return { tenantId, serviceId, staffIds, chairIds, customerId: customerRow!.id };
  });
}

/**
 * A staff member fully wired up the way `/auth/callback` would leave one:
 * auth_identity + staff_user + staff_auth_identity + staff_tenant, plus a
 * session token minted the same way `lib/auth/identity.ts` mints one. Tests
 * (and Playwright) use this to start already logged in without going through
 * a real LINE/Google consent screen.
 */
export async function createStaffSession(
  tenantId: string,
  tenantSlug: string,
  options: { role?: StaffRole; displayName?: string } = {},
): Promise<{ staffUserId: string; token: string }> {
  const providerUid = `test-${randomUUID()}`;

  const [identity] = await db
    .insert(schema.authIdentity)
    .values({ provider: 'line', providerUid, displayName: options.displayName ?? 'พนักงานทดสอบ' })
    .returning({ id: schema.authIdentity.id });

  const [staff] = await db
    .insert(schema.staffUser)
    .values({ displayName: options.displayName ?? 'พนักงานทดสอบ' })
    .returning({ id: schema.staffUser.id });

  await db
    .insert(schema.staffAuthIdentity)
    .values({ staffId: staff!.id, authIdentityId: identity!.id });

  await withTenant(tenantId, (tx) =>
    tx.insert(schema.staffTenant).values({ staffId: staff!.id, tenantId, role: options.role ?? 'owner' }),
  );

  const token = await mintSessionToken(staff!.id, {
    tenantId,
    tenantSlug,
    tenantName: tenantSlug,
    tenantStatus: 'active',
    tenantOnboardedAt: new Date(),
    role: options.role ?? 'owner',
    resourceId: null,
    isActive: true,
  });

  return { staffUserId: staff!.id, token };
}

export async function countBookings(tenantId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: schema.booking.id })
      .from(schema.booking)
      .where(eq(schema.booking.tenantId, tenantId));
    return rows.length;
  });
}

export async function countAllocations(tenantId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: schema.resourceAllocation.id })
      .from(schema.resourceAllocation)
      .where(eq(schema.resourceAllocation.tenantId, tenantId));
    return rows.length;
  });
}

/**
 * Drizzle wraps driver errors, so the readable message is buried. Assert on the
 * SQLSTATE instead — it is the precise thing we care about anyway.
 */
export async function sqlStateOf(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return findSqlState(error);
  }
}

/** Postgres SQLSTATEs the guards in drizzle/0001 raise. */
export const SQLSTATE = {
  restrictViolation: '23001', // the point_ledger append-only trigger
  uniqueViolation: '23505', // point_ledger_idem
  exclusionViolation: '23P01', // resource_no_overlap
  insufficientPrivilege: '42501', // an RLS policy refusing a write
} as const;
