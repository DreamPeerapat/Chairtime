import type { AbsoluteInterval, PlainDate, Zone } from '@/lib/time';

export type HoldScope = 'active_only' | 'whole';
export type SegmentKind = 'active' | 'passive';

export interface SegmentSpec {
  seq: number;
  kind: SegmentKind;
  durationMin: number;
  label: string | null;
}

export interface ResourceRequirementSpec {
  resourceTypeId: string;
  quantity: number;
  holdScope: HoldScope;
}

export interface ServiceSpec {
  id: string;
  name: string;
  basePrice: string;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  segments: SegmentSpec[];
  requirements: ResourceRequirementSpec[];
}

export interface ResourceSpec {
  id: string;
  resourceTypeId: string;
  name: string;
  isHuman: boolean;
  isBookable: boolean;
  /**
   * Working hours for this resource, by weekday (0 = Sunday).
   * Absent weekday key means "follows the shop's hours".
   */
  hours: Map<number, Array<{ openTime: string; closeTime: string }>> | null;
  /** service id -> per-staff overrides */
  skills: Map<string, { priceOverride: string | null; durationFactor: number }>;
}

export interface BusyInterval extends AbsoluteInterval {
  resourceId: string;
}

export interface BookingPolicy {
  slotGranularityMin: number;
  minLeadTimeMin: number;
  maxAdvanceDays: number;
  allowCustomerPickStaff: boolean;
}

/**
 * Everything the search needs, already loaded. Keeping this a plain value makes
 * the whole algorithm testable without a database.
 */
export interface AvailabilityContext {
  tenantId: string;
  timezone: Zone;
  policy: BookingPolicy;
  /** shop-level opening hours by weekday (0 = Sunday) */
  shopHours: Map<number, Array<{ openTime: string; closeTime: string }>>;
  /** closures that apply to the whole shop */
  shopClosures: AbsoluteInterval[];
  services: ServiceSpec[];
  resources: ResourceSpec[];
  /** allocations and per-resource time off, already merged */
  busy: BusyInterval[];
}

export interface AvailabilityQuery {
  date: PlainDate;
  serviceIds: string[];
  preferredResourceId?: string | undefined;
  /** extra days of advance booking granted by the customer's membership tier */
  priorityBookingDays?: number;
  /**
   * Skip the min-lead-time and advance-horizon filters.
   *
   * Set by staff-facing callers only: those rules exist to shape what the
   * public booking page offers, and they must not stop a receptionist booking
   * the customer standing in front of them, or moving yesterday's appointment.
   */
  ignorePolicyWindow?: boolean;
  /** injected so tests are deterministic; defaults to the real clock */
  now?: import('luxon').DateTime;
}

/** One resource held for one stretch of the timeline. */
export interface PlannedHold {
  serviceId: string;
  resourceId: string;
  resourceTypeId: string;
  isActiveHold: boolean;
  start: import('luxon').DateTime;
  end: import('luxon').DateTime;
}

export interface AvailableSlot {
  start: import('luxon').DateTime;
  end: import('luxon').DateTime;
  /** the human doing the work, when the services need one */
  staffResourceId: string | null;
  holds: PlannedHold[];
}
