/**
 * Step 2 of docs/logic.md §1: turn the services a customer picked into one
 * continuous stretch of time, remembering which parts need the human present.
 *
 * Layout of a single service:
 *
 *   ├─ buffer_before ─┤├─ seg1 ─┤├─ seg2 ─┤├─ seg3 ─┤├─ buffer_after ─┤
 *                       active    passive   active
 *
 * Buffers are shop time (setting up, cleaning down); the docs' worked example
 * counts 110 active minutes out of 170 total, which excludes them. So a
 * requirement with `hold_scope = 'active_only'` is held for the active segments
 * only, while `whole` covers everything including buffers.
 */
import type { DateTime } from 'luxon';
import type { AbsoluteInterval } from '@/lib/time';
import { durationMinutes } from '@/lib/time';
import type { ResourceRequirementSpec, ServiceSpec } from './types';

export interface TimelineItem {
  serviceId: string;
  serviceName: string;
  /** includes buffer_before and buffer_after */
  start: DateTime;
  end: DateTime;
  /** the stretch the customer is actually being worked on, buffers excluded */
  serviceStart: DateTime;
  serviceEnd: DateTime;
  /** active segments only — what an `active_only` requirement holds */
  activeSpans: AbsoluteInterval[];
  requirements: ResourceRequirementSpec[];
  durationMin: number;
}

export interface Timeline {
  start: DateTime;
  end: DateTime;
  items: TimelineItem[];
  totalMin: number;
  activeMin: number;
}

export interface TimelineOptions {
  start: DateTime;
  /** per-service multiplier from `resource_service_skill.duration_factor` */
  durationFactor?: (serviceId: string) => number;
}

export function buildTimeline(services: ServiceSpec[], options: TimelineOptions): Timeline {
  const factorFor = options.durationFactor ?? (() => 1);
  const items: TimelineItem[] = [];
  let cursor = options.start;

  for (const svc of services) {
    const itemStart = cursor;
    const serviceStart = itemStart.plus({ minutes: svc.bufferBeforeMin });

    let segCursor = serviceStart;
    const activeSpans: AbsoluteInterval[] = [];
    const factor = factorFor(svc.id);

    for (const segment of [...svc.segments].sort((a, b) => a.seq - b.seq)) {
      const minutes = scaleDuration(segment.durationMin, factor);
      const segEnd = segCursor.plus({ minutes });
      if (segment.kind === 'active') {
        activeSpans.push({ start: segCursor, end: segEnd });
      }
      segCursor = segEnd;
    }

    const serviceEnd = segCursor;
    const itemEnd = serviceEnd.plus({ minutes: svc.bufferAfterMin });

    items.push({
      serviceId: svc.id,
      serviceName: svc.name,
      start: itemStart,
      end: itemEnd,
      serviceStart,
      serviceEnd,
      activeSpans: mergeTouching(activeSpans),
      requirements: svc.requirements,
      durationMin: Math.round(durationMinutes({ start: itemStart, end: itemEnd })),
    });

    cursor = itemEnd;
  }

  const start = options.start;
  const end = items.length > 0 ? items[items.length - 1]!.end : start;
  const activeMin = items.reduce(
    (sum, item) => sum + item.activeSpans.reduce((s, span) => s + durationMinutes(span), 0),
    0,
  );

  return {
    start,
    end,
    items,
    totalMin: Math.round(durationMinutes({ start, end })),
    activeMin: Math.round(activeMin),
  };
}

/**
 * A slower stylist takes proportionally longer. Rounding to whole minutes keeps
 * every downstream time a clean instant; the schedule grid is 15 minutes wide,
 * so sub-minute precision would be noise.
 */
function scaleDuration(minutes: number, factor: number): number {
  if (factor === 1) return minutes;
  return Math.max(1, Math.round(minutes * factor));
}

/** Two adjacent active segments (no passive between them) read as one hold. */
function mergeTouching(spans: AbsoluteInterval[]): AbsoluteInterval[] {
  const out: AbsoluteInterval[] = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && last.end.equals(span.start)) {
      last.end = span.end;
    } else {
      out.push({ start: span.start, end: span.end });
    }
  }
  return out;
}

/**
 * The stretches a given requirement occupies within one timeline item.
 * `active_only` → the active segments; `whole` → buffers included.
 */
export function holdSpansFor(
  item: TimelineItem,
  requirement: ResourceRequirementSpec,
): AbsoluteInterval[] {
  if (requirement.holdScope === 'active_only') {
    return item.activeSpans.map((s) => ({ start: s.start, end: s.end }));
  }
  return [{ start: item.start, end: item.end }];
}
