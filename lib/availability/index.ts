import { withTenant } from '@/lib/db/tenant';
import type { PlainDate } from '@/lib/time';
import { loadAvailabilityContext } from './load';
import { findSlots } from './search';
import type { AvailabilityQuery, AvailableSlot } from './types';

export { buildTimeline, holdSpansFor } from './timeline';
export type { Timeline, TimelineItem } from './timeline';
export { findSlots } from './search';
export { loadAvailabilityContext } from './load';
export * from './types';

export interface GetAvailabilityInput {
  tenantId: string;
  date: PlainDate;
  serviceIds: string[];
  preferredResourceId?: string | undefined;
  priorityBookingDays?: number;
  now?: import('luxon').DateTime;
}

/**
 * Load + search in one tenant-scoped transaction.
 *
 * Whatever comes back is a proposal, not a reservation — see lib/booking/create.ts.
 */
export async function getAvailability(input: GetAvailabilityInput): Promise<AvailableSlot[]> {
  return withTenant(input.tenantId, async (tx) => {
    const ctx = await loadAvailabilityContext(tx, input.tenantId, input.date, input.serviceIds);
    const query: AvailabilityQuery = {
      date: input.date,
      serviceIds: input.serviceIds,
      preferredResourceId: input.preferredResourceId,
      priorityBookingDays: input.priorityBookingDays ?? 0,
      now: input.now,
    };
    return findSlots(ctx, query);
  });
}
