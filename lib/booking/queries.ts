/**
 * Read models for the booking screens.
 *
 * Kept out of the components so a page stays a layout concern and the queries
 * stay testable — and so every one of them goes through withTenant.
 */
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { db, schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  businessType: string;
  timezone: string;
  phone: string | null;
  address: string | null;
  allowCustomerPickStaff: boolean;
  maxAdvanceDays: number;
  cancelCutoffMin: number;
}

/** `tenant` sits outside RLS — it is what you read before you know the tenant. */
export async function findTenantBySlug(slug: string): Promise<TenantSummary | null> {
  const [row] = await db
    .select({
      id: schema.tenant.id,
      slug: schema.tenant.slug,
      name: schema.tenant.name,
      businessType: schema.tenant.businessType,
      timezone: schema.tenant.timezone,
      phone: schema.tenant.phone,
      address: schema.tenant.address,
      status: schema.tenant.status,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.slug, slug));

  if (!row || row.status !== 'active') return null;

  const policy = await withTenant(row.id, (tx) =>
    tx
      .select({
        allowCustomerPickStaff: schema.tenantBookingPolicy.allowCustomerPickStaff,
        maxAdvanceDays: schema.tenantBookingPolicy.maxAdvanceDays,
        cancelCutoffMin: schema.tenantBookingPolicy.cancelCutoffMin,
      })
      .from(schema.tenantBookingPolicy)
      .where(eq(schema.tenantBookingPolicy.tenantId, row.id)),
  );

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    businessType: row.businessType,
    timezone: row.timezone,
    phone: row.phone,
    address: row.address,
    allowCustomerPickStaff: policy[0]?.allowCustomerPickStaff ?? true,
    maxAdvanceDays: policy[0]?.maxAdvanceDays ?? 60,
    cancelCutoffMin: policy[0]?.cancelCutoffMin ?? 180,
  };
}

export interface ServiceListItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  durationMin: number;
  categoryName: string | null;
  categoryOrder: number;
  hasPassiveSegment: boolean;
}

/** The service menu, with the duration a customer actually experiences. */
export async function listBookableServices(tenantId: string): Promise<ServiceListItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: schema.service.id,
        name: schema.service.name,
        description: schema.service.description,
        price: schema.service.basePrice,
        bufferBefore: schema.service.bufferBeforeMin,
        bufferAfter: schema.service.bufferAfterMin,
        displayOrder: schema.service.displayOrder,
        categoryName: schema.serviceCategory.name,
        categoryOrder: schema.serviceCategory.displayOrder,
      })
      .from(schema.service)
      .leftJoin(schema.serviceCategory, eq(schema.serviceCategory.id, schema.service.categoryId))
      .where(and(eq(schema.service.tenantId, tenantId), eq(schema.service.isActive, true)))
      .orderBy(asc(schema.service.displayOrder));

    if (rows.length === 0) return [];

    const segments = await tx
      .select({
        serviceId: schema.serviceSegment.serviceId,
        kind: schema.serviceSegment.kind,
        durationMin: schema.serviceSegment.durationMin,
      })
      .from(schema.serviceSegment)
      .where(
        inArray(
          schema.serviceSegment.serviceId,
          rows.map((r) => r.id),
        ),
      );

    return rows.map((row) => {
      const mine = segments.filter((s) => s.serviceId === row.id);
      const total = mine.reduce((sum, s) => sum + s.durationMin, 0);
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        durationMin: total + row.bufferBefore + row.bufferAfter,
        categoryName: row.categoryName,
        categoryOrder: row.categoryOrder ?? 0,
        hasPassiveSegment: mine.some((s) => s.kind === 'passive'),
      };
    });
  });
}

export interface StaffListItem {
  id: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
}

/** Staff a customer may request, optionally narrowed to those who can do the work. */
export async function listBookableStaff(
  tenantId: string,
  serviceIds: string[] = [],
): Promise<StaffListItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: schema.resource.id,
        name: schema.resource.name,
        bio: schema.resource.bio,
        photoUrl: schema.resource.photoUrl,
        displayOrder: schema.resource.displayOrder,
      })
      .from(schema.resource)
      .innerJoin(schema.resourceType, eq(schema.resourceType.id, schema.resource.resourceTypeId))
      .where(
        and(
          eq(schema.resource.tenantId, tenantId),
          eq(schema.resource.isActive, true),
          eq(schema.resource.isBookable, true),
          eq(schema.resourceType.isHuman, true),
        ),
      )
      .orderBy(asc(schema.resource.displayOrder));

    if (serviceIds.length === 0 || rows.length === 0) return rows.map(strip);

    const skills = await tx
      .select({
        resourceId: schema.resourceServiceSkill.resourceId,
        serviceId: schema.resourceServiceSkill.serviceId,
      })
      .from(schema.resourceServiceSkill)
      .where(inArray(schema.resourceServiceSkill.serviceId, serviceIds));

    // One person handles the whole visit, so they need every service in the basket.
    return rows
      .filter((r) =>
        serviceIds.every((sid) =>
          skills.some((s) => s.resourceId === r.id && s.serviceId === sid),
        ),
      )
      .map(strip);
  });
}

function strip(row: {
  id: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
}): StaffListItem {
  return { id: row.id, name: row.name, bio: row.bio, photoUrl: row.photoUrl };
}

export interface BookingDetail {
  id: string;
  code: string;
  status: string;
  startsAt: DateTime;
  endsAt: DateTime;
  total: string;
  customerName: string | null;
  customerPhone: string | null;
  customerNote: string | null;
  services: string[];
  staffName: string | null;
  cancelCutoffMin: number;
}

export async function findBookingByCode(
  tenantId: string,
  code: string,
  timezone: string,
): Promise<BookingDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        id: schema.booking.id,
        code: schema.booking.code,
        status: schema.booking.status,
        startsAt: schema.booking.startsAt,
        endsAt: schema.booking.endsAt,
        total: schema.booking.total,
        customerNote: schema.booking.customerNote,
        customerName: schema.customer.name,
        customerPhone: schema.customer.phone,
      })
      .from(schema.booking)
      .leftJoin(schema.customer, eq(schema.customer.id, schema.booking.customerId))
      .where(
        and(
          eq(schema.booking.tenantId, tenantId),
          eq(schema.booking.code, code.toUpperCase()),
        ),
      );

    if (!row) return null;

    const items = await tx
      .select({ id: schema.bookingItem.id, serviceName: schema.bookingItem.serviceName })
      .from(schema.bookingItem)
      .where(eq(schema.bookingItem.bookingId, row.id))
      .orderBy(asc(schema.bookingItem.seq));

    const [policy] = await tx
      .select({ cancelCutoffMin: schema.tenantBookingPolicy.cancelCutoffMin })
      .from(schema.tenantBookingPolicy)
      .where(eq(schema.tenantBookingPolicy.tenantId, tenantId));

    return {
      id: row.id,
      code: row.code,
      status: row.status,
      startsAt: DateTime.fromJSDate(row.startsAt).setZone(timezone),
      endsAt: DateTime.fromJSDate(row.endsAt).setZone(timezone),
      total: row.total,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      customerNote: row.customerNote,
      services: items.map((i) => i.serviceName),
      staffName: await staffNameFor(
        tx,
        tenantId,
        items.map((i) => i.id),
      ),
      cancelCutoffMin: policy?.cancelCutoffMin ?? 180,
    };
  });
}

async function staffNameFor(
  tx: TenantTx,
  tenantId: string,
  bookingItemIds: string[],
): Promise<string | null> {
  if (bookingItemIds.length === 0) return null;
  const rows = await tx
    .select({ name: schema.resource.name, isHuman: schema.resourceType.isHuman })
    .from(schema.resourceAllocation)
    .innerJoin(schema.resource, eq(schema.resource.id, schema.resourceAllocation.resourceId))
    .innerJoin(schema.resourceType, eq(schema.resourceType.id, schema.resource.resourceTypeId))
    .where(
      and(
        eq(schema.resourceAllocation.tenantId, tenantId),
        inArray(schema.resourceAllocation.bookingItemId, bookingItemIds),
        eq(schema.resourceAllocation.isReleased, false),
      ),
    );
  return rows.find((r) => r.isHuman)?.name ?? null;
}

/** A customer's upcoming visits, for the LIFF "my bookings" view. */
export async function listUpcomingBookingsForCustomer(
  tenantId: string,
  customerId: string,
  timezone: string,
  now: DateTime = DateTime.now(),
): Promise<BookingDetail[]> {
  const codes = await withTenant(tenantId, (tx) =>
    tx
      .select({ code: schema.booking.code })
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.tenantId, tenantId),
          eq(schema.booking.customerId, customerId),
          inArray(schema.booking.status, ['pending', 'confirmed', 'in_progress']),
          gte(schema.booking.startsAt, now.toJSDate()),
        ),
      )
      .orderBy(asc(schema.booking.startsAt))
      .limit(10),
  );

  const out: BookingDetail[] = [];
  for (const { code } of codes) {
    const detail = await findBookingByCode(tenantId, code, timezone);
    if (detail) out.push(detail);
  }
  return out;
}

/** The days in a range that have at least one bookable slot, for the date picker. */
export async function countBookingsPerDay(
  tenantId: string,
  from: DateTime,
  to: DateTime,
): Promise<Map<string, number>> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.execute<{ day: string; total: number }>(sql`
      SELECT to_char(starts_at AT TIME ZONE (SELECT timezone FROM tenant WHERE id = ${tenantId}), 'YYYY-MM-DD') AS day,
             count(*)::int AS total
        FROM booking
       WHERE tenant_id = ${tenantId}
         AND status <> 'cancelled'
         AND starts_at >= ${from.toISO()}::timestamptz
         AND starts_at < ${to.toISO()}::timestamptz
       GROUP BY 1
    `),
  );
  return new Map([...rows].map((r) => [r.day, Number(r.total)]));
}

export async function recentBookings(tenantId: string, timezone: string, limit = 20) {
  const codes = await withTenant(tenantId, (tx) =>
    tx
      .select({ code: schema.booking.code })
      .from(schema.booking)
      .where(eq(schema.booking.tenantId, tenantId))
      .orderBy(desc(schema.booking.startsAt))
      .limit(limit),
  );
  const out: BookingDetail[] = [];
  for (const { code } of codes) {
    const detail = await findBookingByCode(tenantId, code, timezone);
    if (detail) out.push(detail);
  }
  return out;
}
