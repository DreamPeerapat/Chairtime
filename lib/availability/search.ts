/**
 * The availability algorithm from docs/logic.md §1.
 *
 * Pure by design: it takes an already-loaded `AvailabilityContext` and returns
 * candidate slots. No database, no clock, no timezone guessing — which is what
 * makes the 20-odd cases in tests/unit/availability.test.ts cheap to write.
 *
 * The result is a *proposal*. Iron rule #1 still applies: the booking is only
 * real once the EXCLUDE constraint on `resource_allocation` accepts it. By the
 * time the customer finishes the form, somebody else may have taken the slot.
 */
import { DateTime } from 'luxon';
import type { AbsoluteInterval } from '@/lib/time';
import { candidateStarts, endOfDay, mergeIntervals, startOfDay } from '@/lib/time';
import { buildTimeline, holdSpansFor, type Timeline } from './timeline';
import type {
  AvailabilityContext,
  AvailabilityQuery,
  AvailableSlot,
  PlannedHold,
  ResourceSpec,
  ServiceSpec,
} from './types';
import { coversAll, groupBusyByResource, resourceFreeWindows, shopOpenWindows } from './windows';

export function findSlots(ctx: AvailabilityContext, query: AvailabilityQuery): AvailableSlot[] {
  const zone = ctx.timezone;
  const services = resolveServices(ctx, query.serviceIds);
  const clock = (query.now ?? DateTime.now()).setZone(zone);

  // Step 5, cheap half: a day entirely beyond the horizon costs nothing to reject.
  const horizonDays = ctx.policy.maxAdvanceDays + (query.priorityBookingDays ?? 0);
  const dayStart = startOfDay(query.date, zone);
  if (dayStart > clock.startOf('day').plus({ days: horizonDays })) return [];

  const openWindows = shopOpenWindows(ctx, query.date);
  if (openWindows.length === 0) return [];

  const busyByResource = groupBusyByResource(ctx.busy);
  const freeWindows = new Map<string, AbsoluteInterval[]>();
  for (const resource of ctx.resources) {
    freeWindows.set(
      resource.id,
      resourceFreeWindows(resource, openWindows, busyByResource, query.date, zone),
    );
  }

  const humanTypeIds = requiredHumanTypeIds(ctx, services);
  const staffCandidates = eligibleStaff(ctx, services, humanTypeIds, query.preferredResourceId);

  // Services that need a human but have nobody who can do all of them.
  if (humanTypeIds.size > 0 && staffCandidates.length === 0) return [];

  // A per-staff timeline, because duration_factor changes how long the visit runs.
  const timelineFor = (staffId: string | null, start: DateTime): Timeline => {
    const staff = staffId ? ctx.resources.find((r) => r.id === staffId) : undefined;
    return buildTimeline(services, {
      start,
      durationFactor: (serviceId) => staff?.skills.get(serviceId)?.durationFactor ?? 1,
    });
  };

  const earliest = clock.plus({ minutes: ctx.policy.minLeadTimeMin });
  const latest = clock.startOf('day').plus({ days: horizonDays, hours: 24 });

  // Candidate starts are restricted to the requested day; a visit may still run
  // past midnight, as long as it stays inside the merged open windows.
  const searchWindows = clipToDay(openWindows, dayStart, endOfDay(query.date, zone));

  const slots: AvailableSlot[] = [];
  const attendants: Array<string | null> = humanTypeIds.size > 0 ? staffCandidates.map((s) => s.id) : [null];

  for (const start of candidateStarts(searchWindows, ctx.policy.slotGranularityMin, zone)) {
    if (start < earliest || start > latest) continue;

    let best: AvailableSlot | null = null;
    for (const staffId of attendants) {
      const timeline = timelineFor(staffId, start);
      if (!coversAll(openWindows, [{ start: timeline.start, end: timeline.end }])) continue;

      const holds = tryAssign(ctx, timeline, staffId, humanTypeIds, freeWindows, query);
      if (!holds) continue;

      best = { start: timeline.start, end: timeline.end, staffResourceId: staffId, holds };
      break; // first eligible staff wins; the ordering is set by eligibleStaff()
    }
    if (best) slots.push(best);
  }

  return slots;
}

function resolveServices(ctx: AvailabilityContext, serviceIds: string[]): ServiceSpec[] {
  if (serviceIds.length === 0) throw new Error('at least one service is required');
  return serviceIds.map((id) => {
    const svc = ctx.services.find((s) => s.id === id);
    if (!svc) throw new Error(`unknown service: ${id}`);
    return svc;
  });
}

/** Resource types that are people — the ones that must stay the same all visit. */
function requiredHumanTypeIds(ctx: AvailabilityContext, services: ServiceSpec[]): Set<string> {
  const humanTypes = new Set(ctx.resources.filter((r) => r.isHuman).map((r) => r.resourceTypeId));
  const out = new Set<string>();
  for (const svc of services) {
    for (const req of svc.requirements) {
      if (humanTypes.has(req.resourceTypeId)) out.add(req.resourceTypeId);
    }
  }
  return out;
}

/**
 * One person handles the whole visit — booking a cut and a colour should not
 * hand the customer over to a second stylist halfway through. So a candidate
 * must hold the skill for every service in the basket.
 */
function eligibleStaff(
  ctx: AvailabilityContext,
  services: ServiceSpec[],
  humanTypeIds: Set<string>,
  preferredResourceId: string | undefined,
): ResourceSpec[] {
  return ctx.resources.filter((r) => {
    if (!humanTypeIds.has(r.resourceTypeId)) return false;
    if (preferredResourceId && r.id !== preferredResourceId) return false;
    return services.every((svc) => r.skills.has(svc.id));
  });
}

/**
 * Step 4: try to satisfy every requirement of every timeline item.
 * Returns the holds to write into `resource_allocation`, or null if this start
 * time cannot be served.
 */
function tryAssign(
  ctx: AvailabilityContext,
  timeline: Timeline,
  staffId: string | null,
  humanTypeIds: Set<string>,
  freeWindows: Map<string, AbsoluteInterval[]>,
  query: AvailabilityQuery,
): PlannedHold[] | null {
  const holds: PlannedHold[] = [];
  // A resource picked for one requirement type stays picked for the whole
  // visit: the customer does not hop between chairs mid-appointment.
  const chosen = new Map<string, string[]>();

  for (const item of timeline.items) {
    for (const requirement of item.requirements) {
      const spans = holdSpansFor(item, requirement);
      if (spans.length === 0) continue;

      const isHumanRequirement = humanTypeIds.has(requirement.resourceTypeId);
      let picked = chosen.get(requirement.resourceTypeId);

      if (!picked) {
        if (isHumanRequirement && staffId) {
          picked = [staffId];
        } else {
          const found = pickResources(ctx, requirement, freeWindows, timeline, query);
          if (!found) return null;
          picked = found;
        }
        chosen.set(requirement.resourceTypeId, picked);
      }

      if (picked.length < requirement.quantity) return null;

      for (const resourceId of picked) {
        const windows = freeWindows.get(resourceId);
        if (!windows || !coversAll(windows, spans)) return null;
        for (const span of spans) {
          holds.push({
            serviceId: item.serviceId,
            resourceId,
            resourceTypeId: requirement.resourceTypeId,
            isActiveHold: requirement.holdScope === 'active_only',
            start: span.start,
            end: span.end,
          });
        }
      }
    }
  }

  return holds;
}

/**
 * Pick `quantity` resources of the required type that are free for the whole
 * visit. Committing for the whole visit rather than per segment is what stops a
 * customer being moved to a different bed between two services.
 */
function pickResources(
  ctx: AvailabilityContext,
  requirement: { resourceTypeId: string; quantity: number },
  freeWindows: Map<string, AbsoluteInterval[]>,
  timeline: Timeline,
  query: AvailabilityQuery,
): string[] | null {
  const whole = [{ start: timeline.start, end: timeline.end }];
  const picked: string[] = [];

  const candidates = ctx.resources.filter((r) => r.resourceTypeId === requirement.resourceTypeId);
  // If the customer asked for a specific resource of this type, honour it.
  const preferredFirst = query.preferredResourceId
    ? [
        ...candidates.filter((r) => r.id === query.preferredResourceId),
        ...candidates.filter((r) => r.id !== query.preferredResourceId),
      ]
    : candidates;

  for (const candidate of preferredFirst) {
    const windows = freeWindows.get(candidate.id);
    if (!windows) continue;
    if (!coversAll(windows, whole)) continue;
    picked.push(candidate.id);
    if (picked.length === requirement.quantity) return picked;
  }
  return null;
}

function clipToDay(
  windows: AbsoluteInterval[],
  dayStart: DateTime,
  dayEnd: DateTime,
): AbsoluteInterval[] {
  const out: AbsoluteInterval[] = [];
  for (const w of mergeIntervals(windows)) {
    const start = w.start > dayStart ? w.start : dayStart;
    const end = w.end < dayEnd ? w.end : dayEnd;
    if (start < end) out.push({ start, end });
  }
  return out;
}
