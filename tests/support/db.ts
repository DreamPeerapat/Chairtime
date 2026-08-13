/** Shared helpers for the integration tests. */
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { findSqlState } from '@/lib/booking/errors';
import { withTenant } from '@/lib/db/tenant';

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
        package, package_service, customer_package, notification_queue, staff_user, audit_log
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
