/**
 * Step 3 of docs/logic.md §1 — pull everything the search needs in one go.
 *
 * The read is deliberately day-shaped and narrow: one round trip per table for
 * a single day, no per-slot queries. The docs' target is < 300 ms for an
 * availability lookup, and the way to miss it is to query inside the slot loop.
 */
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { PlainDate } from '@/lib/time';
import { endOfDay, fromTstzRange, startOfDay } from '@/lib/time';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import type {
  AvailabilityContext,
  BusyInterval,
  ResourceSpec,
  SegmentSpec,
  ServiceSpec,
} from './types';
import type { WeeklyHours } from './windows';

/**
 * A day either side is included so a shift that runs past midnight is visible
 * from both days, matching `expandWeeklyHours`.
 */
export async function loadAvailabilityContext(
  tx: TenantTx,
  tenantId: string,
  date: PlainDate,
  serviceIds: string[],
): Promise<AvailabilityContext> {
  const [tenantRow] = await tx
    .select({ id: schema.tenant.id, timezone: schema.tenant.timezone })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId));
  if (!tenantRow) throw new Error(`unknown tenant: ${tenantId}`);
  const zone = tenantRow.timezone;

  const [policyRow] = await tx
    .select()
    .from(schema.tenantBookingPolicy)
    .where(eq(schema.tenantBookingPolicy.tenantId, tenantId));

  const rangeStart = startOfDay(date, zone).minus({ days: 1 });
  const rangeEnd = endOfDay(date, zone).plus({ days: 1 });

  const [serviceRows, segmentRows, requirementRows, resourceRows, typeRows, skillRows, hourRows] =
    await Promise.all([
      tx
        .select()
        .from(schema.service)
        .where(and(eq(schema.service.tenantId, tenantId), inArray(schema.service.id, serviceIds))),
      tx
        .select()
        .from(schema.serviceSegment)
        .where(inArray(schema.serviceSegment.serviceId, serviceIds)),
      tx
        .select()
        .from(schema.serviceResourceRequirement)
        .where(inArray(schema.serviceResourceRequirement.serviceId, serviceIds)),
      tx
        .select()
        .from(schema.resource)
        .where(and(eq(schema.resource.tenantId, tenantId), eq(schema.resource.isActive, true))),
      tx.select().from(schema.resourceType).where(eq(schema.resourceType.tenantId, tenantId)),
      tx
        .select()
        .from(schema.resourceServiceSkill)
        .where(inArray(schema.resourceServiceSkill.serviceId, serviceIds)),
      tx.select().from(schema.businessHour).where(eq(schema.businessHour.tenantId, tenantId)),
    ]);

  const missing = serviceIds.filter((id) => !serviceRows.some((row) => row.id === id));
  if (missing.length > 0) throw new Error(`unknown service: ${missing.join(', ')}`);

  const busy = await loadBusy(tx, tenantId, zone, rangeStart.toISO()!, rangeEnd.toISO()!);
  const shopClosures = await loadShopClosures(tx, tenantId, zone, rangeStart.toISO()!, rangeEnd.toISO()!);

  const humanTypeIds = new Set(typeRows.filter((t) => t.isHuman).map((t) => t.id));

  const segmentsByService = groupBy(segmentRows, (r) => r.serviceId);
  const requirementsByService = groupBy(requirementRows, (r) => r.serviceId);
  const skillsByResource = groupBy(skillRows, (r) => r.resourceId);

  const services: ServiceSpec[] = serviceIds.map((id) => {
    const row = serviceRows.find((s) => s.id === id)!;
    const segments: SegmentSpec[] = (segmentsByService.get(id) ?? [])
      .map((s) => ({
        seq: s.seq,
        kind: s.kind === 'passive' ? ('passive' as const) : ('active' as const),
        durationMin: s.durationMin,
        label: s.label,
      }))
      .sort((a, b) => a.seq - b.seq);

    if (segments.length === 0) {
      throw new Error(`service ${row.name} (${id}) has no segments; every service needs at least one`);
    }

    return {
      id: row.id,
      name: row.name,
      basePrice: row.basePrice,
      bufferBeforeMin: row.bufferBeforeMin,
      bufferAfterMin: row.bufferAfterMin,
      segments,
      requirements: (requirementsByService.get(id) ?? []).map((r) => ({
        resourceTypeId: r.resourceTypeId,
        quantity: r.quantity,
        holdScope: r.holdScope === 'active_only' ? ('active_only' as const) : ('whole' as const),
      })),
    };
  });

  const hoursByResource = groupBy(
    hourRows.filter((h) => h.resourceId !== null),
    (h) => h.resourceId!,
  );
  const shopHours: WeeklyHours = toWeeklyHours(hourRows.filter((h) => h.resourceId === null));

  const resources: ResourceSpec[] = resourceRows.map((row) => ({
    id: row.id,
    resourceTypeId: row.resourceTypeId,
    name: row.name,
    isHuman: humanTypeIds.has(row.resourceTypeId),
    isBookable: row.isBookable,
    hours: hoursByResource.has(row.id) ? toWeeklyHours(hoursByResource.get(row.id)!) : null,
    skills: new Map(
      (skillsByResource.get(row.id) ?? []).map((s) => [
        s.serviceId,
        { priceOverride: s.priceOverride, durationFactor: Number(s.durationFactor) },
      ]),
    ),
  }));

  return {
    tenantId,
    timezone: zone,
    policy: {
      slotGranularityMin: policyRow?.slotGranularityMin ?? 15,
      minLeadTimeMin: policyRow?.minLeadTimeMin ?? 60,
      maxAdvanceDays: policyRow?.maxAdvanceDays ?? 60,
      allowCustomerPickStaff: policyRow?.allowCustomerPickStaff ?? true,
    },
    shopHours,
    shopClosures,
    services,
    resources,
    busy,
  };
}

/** Live allocations plus per-resource time off, as one list of busy stretches. */
async function loadBusy(
  tx: TenantTx,
  tenantId: string,
  zone: string,
  from: string,
  to: string,
): Promise<BusyInterval[]> {
  const rows = await tx.execute<{ resource_id: string; period: string }>(sql`
    SELECT resource_id, period::text AS period
      FROM resource_allocation
     WHERE tenant_id = ${tenantId}
       AND is_released = false
       AND period && tstzrange(${from}::timestamptz, ${to}::timestamptz)
    UNION ALL
    SELECT resource_id, period::text AS period
      FROM time_off
     WHERE tenant_id = ${tenantId}
       AND resource_id IS NOT NULL
       AND period && tstzrange(${from}::timestamptz, ${to}::timestamptz)
  `);

  return [...rows].map((row) => {
    const interval = fromTstzRange(row.period, zone);
    return { resourceId: row.resource_id, start: interval.start, end: interval.end };
  });
}

async function loadShopClosures(tx: TenantTx, tenantId: string, zone: string, from: string, to: string) {
  const rows = await tx
    .select({ period: sql<string>`period::text` })
    .from(schema.timeOff)
    .where(
      and(
        eq(schema.timeOff.tenantId, tenantId),
        sql`${schema.timeOff.resourceId} IS NULL`,
        sql`${schema.timeOff.period} && tstzrange(${from}::timestamptz, ${to}::timestamptz)`,
      ),
    );
  return rows.map((row) => fromTstzRange(row.period, zone));
}

function toWeeklyHours(rows: Array<{ weekday: number; openTime: string; closeTime: string }>): WeeklyHours {
  const map: WeeklyHours = new Map();
  for (const row of rows) {
    const list = map.get(row.weekday);
    const entry = { openTime: row.openTime, closeTime: row.closeTime };
    if (list) list.push(entry);
    else map.set(row.weekday, [entry]);
  }
  return map;
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export { or };
