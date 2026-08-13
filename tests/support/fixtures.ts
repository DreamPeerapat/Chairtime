/**
 * Builders for availability test contexts.
 *
 * Everything is expressed in Asia/Bangkok local time so the tests read like a
 * shop's day rather than like UTC arithmetic.
 */
import { DateTime } from 'luxon';
import type {
  AvailabilityContext,
  BusyInterval,
  ResourceSpec,
  SegmentSpec,
  ServiceSpec,
} from '@/lib/availability/types';

export const ZONE = 'Asia/Bangkok';

export const TYPE_STAFF = '11111111-1111-1111-1111-111111111111';
export const TYPE_CHAIR = '22222222-2222-2222-2222-222222222222';
export const TENANT = '33333333-3333-3333-3333-333333333333';

export function at(date: string, time: string, zone = ZONE): DateTime {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!dt.isValid) throw new Error(`bad fixture time ${date}T${time}: ${dt.invalidReason}`);
  return dt;
}

export function span(date: string, from: string, to: string, zone = ZONE) {
  return { start: at(date, from, zone), end: at(date, to, zone) };
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}${String(seq).padStart(12, '0')}`.slice(0, 36);
}

export function uuid(tag: string): string {
  const base = nextId('00000000-0000-4000-8000-');
  return `${base.slice(0, 24)}${tag.slice(0, 12).padEnd(12, '0')}`.slice(0, 36);
}

export function service(
  partial: Partial<ServiceSpec> & { id: string; segments?: SegmentSpec[] },
): ServiceSpec {
  const segments =
    partial.segments ?? ([{ seq: 1, kind: 'active', durationMin: 60, label: null }] as SegmentSpec[]);
  return {
    id: partial.id,
    name: partial.name ?? 'service',
    basePrice: partial.basePrice ?? '500.00',
    bufferBeforeMin: partial.bufferBeforeMin ?? 0,
    bufferAfterMin: partial.bufferAfterMin ?? 0,
    segments,
    requirements: partial.requirements ?? [
      { resourceTypeId: TYPE_STAFF, quantity: 1, holdScope: 'active_only' },
      { resourceTypeId: TYPE_CHAIR, quantity: 1, holdScope: 'whole' },
    ],
  };
}

export function staff(
  id: string,
  serviceIds: string[],
  overrides: Partial<ResourceSpec> = {},
): ResourceSpec {
  return {
    id,
    resourceTypeId: TYPE_STAFF,
    name: id,
    isHuman: true,
    isBookable: true,
    hours: null,
    skills: new Map(serviceIds.map((sid) => [sid, { priceOverride: null, durationFactor: 1 }])),
    ...overrides,
  };
}

export function chair(id: string, overrides: Partial<ResourceSpec> = {}): ResourceSpec {
  return {
    id,
    resourceTypeId: TYPE_CHAIR,
    name: id,
    isHuman: false,
    isBookable: false,
    hours: null,
    skills: new Map(),
    ...overrides,
  };
}

export function busy(resourceId: string, date: string, from: string, to: string): BusyInterval {
  return { resourceId, ...span(date, from, to) };
}

export function context(partial: Partial<AvailabilityContext> = {}): AvailabilityContext {
  const openAllWeek = new Map<number, Array<{ openTime: string; closeTime: string }>>();
  for (let weekday = 0; weekday < 7; weekday += 1) {
    openAllWeek.set(weekday, [{ openTime: '10:00:00', closeTime: '20:00:00' }]);
  }
  return {
    tenantId: TENANT,
    timezone: ZONE,
    policy: {
      slotGranularityMin: 15,
      minLeadTimeMin: 0,
      maxAdvanceDays: 60,
      allowCustomerPickStaff: true,
    },
    shopHours: openAllWeek,
    shopClosures: [],
    services: [],
    resources: [],
    busy: [],
    ...partial,
  };
}

/** "10:00" style labels for a list of slots, so assertions stay readable. */
export function labels(slots: Array<{ start: DateTime }>, zone = ZONE): string[] {
  return slots.map((s) => s.start.setZone(zone).toFormat('HH:mm'));
}
