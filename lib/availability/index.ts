import { withTenant } from '@/lib/db/tenant';
import type { PlainDate } from '@/lib/time';
import { diagnoseSetup, type SetupProblem } from './diagnose';
import { loadAvailabilityContext } from './load';
import { findSlots } from './search';
import type { AvailabilityQuery, AvailableSlot } from './types';

export { buildTimeline, holdSpansFor } from './timeline';
export type { Timeline, TimelineItem } from './timeline';
export { findSlots } from './search';
export { loadAvailabilityContext } from './load';
export { diagnoseSetup } from './diagnose';
export type { SetupProblem, SetupProblemCode } from './diagnose';
export * from './types';

export interface GetAvailabilityInput {
  tenantId: string;
  date: PlainDate;
  serviceIds: string[];
  preferredResourceId?: string | undefined;
  priorityBookingDays?: number;
  /** staff-facing callers waive the lead-time and horizon rules */
  ignorePolicyWindow?: boolean;
  now?: import('luxon').DateTime;
}

/**
 * Load + search in one tenant-scoped transaction.
 *
 * Whatever comes back is a proposal, not a reservation — see lib/booking/create.ts.
 */
export async function getAvailability(input: GetAvailabilityInput): Promise<AvailableSlot[]> {
  return (await getAvailabilityReport(input)).slots;
}

export interface AvailabilityReport {
  slots: AvailableSlot[];
  /**
   * Non-empty when the shop itself cannot serve this basket, whatever the day.
   * Empty plus no slots means today is simply full.
   */
  setup: SetupProblem[];
}

/**
 * The same search, plus why an empty result is empty.
 *
 * One context load serves both, so asking the question costs nothing — which
 * matters, because the caller that most needs the answer is the public booking
 * page on every date change.
 */
export async function getAvailabilityReport(
  input: GetAvailabilityInput,
): Promise<AvailabilityReport> {
  return withTenant(input.tenantId, async (tx) => {
    const ctx = await loadAvailabilityContext(tx, input.tenantId, input.date, input.serviceIds);
    const query: AvailabilityQuery = {
      date: input.date,
      serviceIds: input.serviceIds,
      preferredResourceId: input.preferredResourceId,
      priorityBookingDays: input.priorityBookingDays ?? 0,
      ignorePolicyWindow: input.ignorePolicyWindow ?? false,
      now: input.now,
    };
    const slots = findSlots(ctx, query);
    // A shop that produced slots is configured well enough by definition;
    // skip the diagnosis rather than risk contradicting the search.
    return { slots, setup: slots.length > 0 ? [] : diagnoseSetup(ctx, input.serviceIds) };
  });
}
