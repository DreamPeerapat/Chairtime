/**
 * Read models for the admin screens.
 *
 * The day calendar is the screen a shop lives in — docs/roadmap.md puts it at
 * 90% of usage — so it gets one query that returns everything the timeline
 * needs, rather than a query per booking.
 */
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';
import { endOfDay, fromTstzRange, startOfDay } from '@/lib/time';

export interface CalendarBooking {
  id: string;
  code: string;
  status: string;
  source: string;
  startsAt: string;
  endsAt: string;
  total: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerNote: string | null;
  services: string[];
  staffResourceId: string | null;
  staffName: string | null;
  /** the chair/bed/room, for the second line of the event chip */
  spaceName: string | null;
}

export interface CalendarResource {
  id: string;
  name: string;
  isHuman: boolean;
  typeCode: string;
}

export interface DayCalendar {
  date: string;
  timezone: string;
  openWindows: Array<{ start: string; end: string }>;
  resources: CalendarResource[];
  bookings: CalendarBooking[];
  timeOff: Array<{ resourceId: string | null; start: string; end: string; reason: string | null }>;
}

export async function loadDayCalendar(
  tenantId: string,
  date: string,
  timezone: string,
): Promise<DayCalendar> {
  const dayStart = startOfDay(date, timezone);
  const dayEnd = endOfDay(date, timezone);

  return withTenant(tenantId, async (tx) => {
    const resources = await tx
      .select({
        id: schema.resource.id,
        name: schema.resource.name,
        isHuman: schema.resourceType.isHuman,
        typeCode: schema.resourceType.code,
        displayOrder: schema.resource.displayOrder,
      })
      .from(schema.resource)
      .innerJoin(schema.resourceType, eq(schema.resourceType.id, schema.resource.resourceTypeId))
      .where(and(eq(schema.resource.tenantId, tenantId), eq(schema.resource.isActive, true)))
      .orderBy(asc(schema.resource.displayOrder));

    const bookingRows = await tx
      .select({
        id: schema.booking.id,
        code: schema.booking.code,
        status: schema.booking.status,
        source: schema.booking.source,
        startsAt: schema.booking.startsAt,
        endsAt: schema.booking.endsAt,
        total: schema.booking.total,
        customerNote: schema.booking.customerNote,
        customerId: schema.customer.id,
        customerName: schema.customer.name,
        customerPhone: schema.customer.phone,
      })
      .from(schema.booking)
      .leftJoin(schema.customer, eq(schema.customer.id, schema.booking.customerId))
      .where(
        and(
          eq(schema.booking.tenantId, tenantId),
          gte(schema.booking.endsAt, dayStart.toJSDate()),
          lt(schema.booking.startsAt, dayEnd.toJSDate()),
        ),
      )
      .orderBy(asc(schema.booking.startsAt));

    const bookings: CalendarBooking[] = [];

    if (bookingRows.length > 0) {
      const items = await tx
        .select({
          id: schema.bookingItem.id,
          bookingId: schema.bookingItem.bookingId,
          serviceName: schema.bookingItem.serviceName,
        })
        .from(schema.bookingItem)
        .where(
          inArray(
            schema.bookingItem.bookingId,
            bookingRows.map((b) => b.id),
          ),
        );

      const allocations =
        items.length > 0
          ? await tx
              .select({
                bookingItemId: schema.resourceAllocation.bookingItemId,
                resourceId: schema.resource.id,
                resourceName: schema.resource.name,
                isHuman: schema.resourceType.isHuman,
              })
              .from(schema.resourceAllocation)
              .innerJoin(schema.resource, eq(schema.resource.id, schema.resourceAllocation.resourceId))
              .innerJoin(
                schema.resourceType,
                eq(schema.resourceType.id, schema.resource.resourceTypeId),
              )
              .where(
                and(
                  eq(schema.resourceAllocation.tenantId, tenantId),
                  eq(schema.resourceAllocation.isReleased, false),
                  inArray(
                    schema.resourceAllocation.bookingItemId,
                    items.map((i) => i.id),
                  ),
                ),
              )
          : [];

      for (const row of bookingRows) {
        const myItems = items.filter((i) => i.bookingId === row.id);
        const myAllocations = allocations.filter((a) =>
          myItems.some((i) => i.id === a.bookingItemId),
        );
        const human = myAllocations.find((a) => a.isHuman);
        const space = myAllocations.find((a) => !a.isHuman);

        bookings.push({
          id: row.id,
          code: row.code,
          status: row.status,
          source: row.source,
          startsAt: DateTime.fromJSDate(row.startsAt).setZone(timezone).toISO()!,
          endsAt: DateTime.fromJSDate(row.endsAt).setZone(timezone).toISO()!,
          total: row.total,
          customerId: row.customerId,
          customerName: row.customerName ?? 'ลูกค้า walk-in',
          customerPhone: row.customerPhone,
          customerNote: row.customerNote,
          services: myItems.map((i) => i.serviceName),
          staffResourceId: human?.resourceId ?? null,
          staffName: human?.resourceName ?? null,
          spaceName: space?.resourceName ?? null,
        });
      }
    }

    const hours = await tx
      .select({
        openTime: schema.businessHour.openTime,
        closeTime: schema.businessHour.closeTime,
        weekday: schema.businessHour.weekday,
      })
      .from(schema.businessHour)
      .where(
        and(eq(schema.businessHour.tenantId, tenantId), sql`${schema.businessHour.resourceId} IS NULL`),
      );

    const weekday = dayStart.weekday % 7;
    const openWindows = hours
      .filter((h) => h.weekday === weekday)
      .map((h) => ({
        start: h.openTime.slice(0, 5),
        end: h.closeTime.slice(0, 5),
      }))
      .sort((a, b) => a.start.localeCompare(b.start));

    const offRows = await tx
      .select({
        resourceId: schema.timeOff.resourceId,
        period: sql<string>`period::text`,
        reason: schema.timeOff.reason,
      })
      .from(schema.timeOff)
      .where(
        and(
          eq(schema.timeOff.tenantId, tenantId),
          sql`${schema.timeOff.period} && tstzrange(${dayStart.toISO()}::timestamptz, ${dayEnd.toISO()}::timestamptz)`,
        ),
      );

    return {
      date,
      timezone,
      openWindows,
      resources: resources.map((r) => ({
        id: r.id,
        name: r.name,
        isHuman: r.isHuman,
        typeCode: r.typeCode,
      })),
      bookings,
      timeOff: offRows.map((row) => {
        const interval = fromTstzRange(row.period, timezone);
        return {
          resourceId: row.resourceId,
          start: interval.start.toISO()!,
          end: interval.end.toISO()!,
          reason: row.reason,
        };
      }),
    };
  });
}

export interface DayStats {
  total: number;
  completed: number;
  noShow: number;
  cancelled: number;
  upcoming: number;
  revenue: string;
}

export function summariseDay(bookings: CalendarBooking[]): DayStats {
  const live = bookings.filter((b) => b.status !== 'cancelled');
  const revenueSatang = bookings
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + Math.round(Number(b.total) * 100), 0);

  return {
    total: live.length,
    completed: bookings.filter((b) => b.status === 'completed').length,
    noShow: bookings.filter((b) => b.status === 'no_show').length,
    cancelled: bookings.filter((b) => b.status === 'cancelled').length,
    upcoming: bookings.filter((b) => ['pending', 'confirmed'].includes(b.status)).length,
    revenue: (revenueSatang / 100).toFixed(2),
  };
}

// ---------------------------------------------------------------------
// Services / resources management
// ---------------------------------------------------------------------

export async function listServicesForAdmin(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: schema.service.id,
        name: schema.service.name,
        description: schema.service.description,
        basePrice: schema.service.basePrice,
        bufferBeforeMin: schema.service.bufferBeforeMin,
        bufferAfterMin: schema.service.bufferAfterMin,
        isActive: schema.service.isActive,
        displayOrder: schema.service.displayOrder,
        categoryId: schema.service.categoryId,
        categoryName: schema.serviceCategory.name,
      })
      .from(schema.service)
      .leftJoin(schema.serviceCategory, eq(schema.serviceCategory.id, schema.service.categoryId))
      .where(eq(schema.service.tenantId, tenantId))
      .orderBy(asc(schema.service.displayOrder));

    if (rows.length === 0) return [];

    const segments = await tx
      .select()
      .from(schema.serviceSegment)
      .where(
        inArray(
          schema.serviceSegment.serviceId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(schema.serviceSegment.seq));

    return rows.map((row) => ({
      ...row,
      segments: segments
        .filter((s) => s.serviceId === row.id)
        .map((s) => ({ seq: s.seq, kind: s.kind, durationMin: s.durationMin, label: s.label })),
      totalMin: segments
        .filter((s) => s.serviceId === row.id)
        .reduce((sum, s) => sum + s.durationMin, 0),
    }));
  });
}

export async function listResourcesForAdmin(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const resources = await tx
      .select({
        id: schema.resource.id,
        name: schema.resource.name,
        bio: schema.resource.bio,
        isBookable: schema.resource.isBookable,
        isActive: schema.resource.isActive,
        displayOrder: schema.resource.displayOrder,
        typeId: schema.resourceType.id,
        typeCode: schema.resourceType.code,
        typeName: schema.resourceType.name,
        isHuman: schema.resourceType.isHuman,
      })
      .from(schema.resource)
      .innerJoin(schema.resourceType, eq(schema.resourceType.id, schema.resource.resourceTypeId))
      .where(eq(schema.resource.tenantId, tenantId))
      .orderBy(asc(schema.resource.displayOrder));

    const hours = await tx
      .select()
      .from(schema.businessHour)
      .where(eq(schema.businessHour.tenantId, tenantId));

    const skills =
      resources.length > 0
        ? await tx
            .select()
            .from(schema.resourceServiceSkill)
            .where(
              inArray(
                schema.resourceServiceSkill.resourceId,
                resources.map((r) => r.id),
              ),
            )
        : [];

    return resources.map((r) => ({
      ...r,
      hours: hours
        .filter((h) => h.resourceId === r.id)
        .map((h) => ({ weekday: h.weekday, openTime: h.openTime, closeTime: h.closeTime })),
      serviceIds: skills.filter((s) => s.resourceId === r.id).map((s) => s.serviceId),
    }));
  });
}

export async function listShopHours(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select({
        id: schema.businessHour.id,
        weekday: schema.businessHour.weekday,
        openTime: schema.businessHour.openTime,
        closeTime: schema.businessHour.closeTime,
      })
      .from(schema.businessHour)
      .where(
        and(eq(schema.businessHour.tenantId, tenantId), sql`${schema.businessHour.resourceId} IS NULL`),
      )
      .orderBy(asc(schema.businessHour.weekday), asc(schema.businessHour.openTime)),
  );
}

export async function listTimeOff(tenantId: string, timezone: string, from: DateTime) {
  const rows = await withTenant(tenantId, (tx) =>
    tx
      .select({
        id: schema.timeOff.id,
        resourceId: schema.timeOff.resourceId,
        period: sql<string>`period::text`,
        reason: schema.timeOff.reason,
      })
      .from(schema.timeOff)
      .where(
        and(
          eq(schema.timeOff.tenantId, tenantId),
          sql`upper(${schema.timeOff.period}) >= ${from.toISO()}::timestamptz`,
        ),
      ),
  );

  return rows
    .map((row) => {
      const interval = fromTstzRange(row.period, timezone);
      return {
        id: row.id,
        resourceId: row.resourceId,
        start: interval.start,
        end: interval.end,
        reason: row.reason,
      };
    })
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

// ---------------------------------------------------------------------
// Customers (Phase 4)
// ---------------------------------------------------------------------

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string | null;
  lineUserId: string | null;
  visitCount: number;
  noShowCount: number;
  pointBalance: number;
  lastVisitAt: Date | null;
  note: string | null;
  isBlocked: boolean;
}

export async function searchCustomers(
  tenantId: string,
  query: string,
  limit = 50,
): Promise<CustomerListItem[]> {
  const term = query.trim();
  return withTenant(tenantId, (tx) => {
    const base = and(
      eq(schema.customer.tenantId, tenantId),
      term
        ? or(ilike(schema.customer.name, `%${term}%`), ilike(schema.customer.phone, `%${term}%`))
        : undefined,
    );

    return tx
      .select({
        id: schema.customer.id,
        name: schema.customer.name,
        phone: schema.customer.phone,
        lineUserId: schema.customer.lineUserId,
        visitCount: schema.customer.visitCount,
        noShowCount: schema.customer.noShowCount,
        pointBalance: schema.customer.pointBalance,
        lastVisitAt: schema.customer.lastVisitAt,
        note: schema.customer.note,
        isBlocked: schema.customer.isBlocked,
      })
      .from(schema.customer)
      .where(base)
      .orderBy(desc(schema.customer.lastVisitAt), asc(schema.customer.name))
      .limit(limit);
  });
}

export async function loadCustomerDetail(tenantId: string, customerId: string, timezone: string) {
  return withTenant(tenantId, async (tx) => {
    const [customer] = await tx
      .select()
      .from(schema.customer)
      .where(and(eq(schema.customer.tenantId, tenantId), eq(schema.customer.id, customerId)));
    if (!customer) return null;

    const bookings = await tx
      .select({
        id: schema.booking.id,
        code: schema.booking.code,
        status: schema.booking.status,
        startsAt: schema.booking.startsAt,
        total: schema.booking.total,
      })
      .from(schema.booking)
      .where(
        and(eq(schema.booking.tenantId, tenantId), eq(schema.booking.customerId, customerId)),
      )
      .orderBy(desc(schema.booking.startsAt))
      .limit(50);

    const items =
      bookings.length > 0
        ? await tx
            .select({
              bookingId: schema.bookingItem.bookingId,
              serviceName: schema.bookingItem.serviceName,
            })
            .from(schema.bookingItem)
            .where(
              inArray(
                schema.bookingItem.bookingId,
                bookings.map((b) => b.id),
              ),
            )
        : [];

    return {
      customer,
      visits: bookings.map((b) => ({
        id: b.id,
        code: b.code,
        status: b.status,
        startsAt: DateTime.fromJSDate(b.startsAt).setZone(timezone),
        total: b.total,
        services: items.filter((i) => i.bookingId === b.id).map((i) => i.serviceName),
      })),
    };
  });
}

/** Same phone, or same name with only one record carrying a phone number. */
export async function findMergeCandidates(tenantId: string) {
  return withTenant(tenantId, async (tx: TenantTx) => {
    const rows = await tx.execute<{
      name: string;
      ids: string[];
      phones: (string | null)[];
      visits: number[];
    }>(sql`
      SELECT name,
             array_agg(id ORDER BY visit_count DESC) AS ids,
             array_agg(phone ORDER BY visit_count DESC) AS phones,
             array_agg(visit_count ORDER BY visit_count DESC) AS visits
        FROM customer
       WHERE tenant_id = ${tenantId}
         AND is_blocked = false
       GROUP BY name
      HAVING count(*) > 1
       ORDER BY name
       LIMIT 50
    `);
    return [...rows];
  });
}

export async function listRewardsForAdmin(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select({
        id: schema.reward.id,
        name: schema.reward.name,
        rewardType: schema.reward.rewardType,
        pointCost: schema.reward.pointCost,
        serviceId: schema.reward.serviceId,
        serviceName: schema.service.name,
        valueAmount: schema.reward.valueAmount,
        minTierLevel: schema.reward.minTierLevel,
        stock: schema.reward.stock,
        stockUsed: schema.reward.stockUsed,
        validFrom: schema.reward.validFrom,
        validUntil: schema.reward.validUntil,
        isActive: schema.reward.isActive,
      })
      .from(schema.reward)
      .leftJoin(schema.service, eq(schema.service.id, schema.reward.serviceId))
      .where(eq(schema.reward.tenantId, tenantId))
      .orderBy(asc(schema.reward.pointCost)),
  );
}
