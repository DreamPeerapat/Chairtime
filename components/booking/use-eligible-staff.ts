'use client';

import { useMemo } from 'react';
import type { StaffListItem } from '@/lib/booking/queries';

export function useEligibleStaff(
  staff: StaffListItem[],
  selectedServiceIds: string[],
  pickedStaffId: string | null,
) {
  /**
   * Only the stylists who can do everything in the basket.
   *
   * This used to return the whole list — the name said "eligible" and the body
   * said otherwise. A customer who picked a colour and then a stylist who only
   * cuts reached the time step, found no times at all, and had nothing to tell
   * them why. One person handles the whole visit, so the test is that they
   * hold every skill, not any of them.
   */
  const eligibleStaff = useMemo(
    () =>
      selectedServiceIds.length === 0
        ? staff
        : staff.filter((person) =>
            selectedServiceIds.every((id) => person.serviceIds.includes(id)),
          ),
    [staff, selectedServiceIds],
  );

  /**
   * The chosen stylist stops being able to do the job when the basket changes
   * under them — picking a stylist, going back, and adding a service.
   *
   * Derived rather than corrected in an effect: writing state during an effect
   * costs a second render pass and, worse, leaves one render in which the
   * time step asks for a stylist who cannot serve the basket. Reading through
   * this constant means the invalid combination never exists.
   */
  const staffId =
    pickedStaffId && eligibleStaff.some((person) => person.id === pickedStaffId)
      ? pickedStaffId
      : null;

  return { eligibleStaff, staffId };
}
