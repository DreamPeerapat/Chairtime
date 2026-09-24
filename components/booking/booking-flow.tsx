'use client';

/**
 * The customer booking flow: service → staff → time → confirm.
 *
 * A client component because it is four dependent steps of local state. It owns
 * no business logic — availability comes from /api/availability and the booking
 * itself from POST /api/bookings, so the rules live on the server where the
 * database can enforce them.
 */
import { useState } from 'react';
import { DateTime } from 'luxon';
import type { ServiceListItem, StaffListItem } from '@/lib/booking/queries';
import type { PortfolioPhoto } from '@/lib/portfolio/queries';
import { ServiceStep } from './service-step';
import { StaffStep } from './staff-step';
import { TimeStep } from './time-step';
import { ConfirmStep } from './confirm-step';
import { SlotTakenNotice } from './slot-taken-notice';
import { STEPS, StepIndicator } from './step-indicator';
import { useAvailabilitySlots } from './use-availability-slots';
import { useEligibleStaff } from './use-eligible-staff';

export type { Slot } from './use-availability-slots';

export interface BookingFlowProps {
  tenantId: string;
  tenantSlug: string;
  timezone: string;
  maxAdvanceDays: number;
  allowCustomerPickStaff: boolean;
  /** offered as the way through when the shop cannot take online bookings yet */
  phone: string | null;
  services: ServiceListItem[];
  staff: StaffListItem[];
  /** published photos by resource id, shown on the staff step */
  portfolio: Record<string, PortfolioPhoto[]>;
  liffId: string | null;
}

export function BookingFlow(props: BookingFlowProps) {
  const [step, setStep] = useState(0);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [pickedStaffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(() => DateTime.now().setZone(props.timezone).toISODate()!);

  /**
   * Somebody took the slot while this customer was filling in the form.
   *
   * Kept apart from `error` on purpose: loadSlots() clears `error` the moment
   * it starts, and it starts in the same click that reports the clash, so the
   * message used to be wiped before it ever rendered — the customer was thrown
   * back to the time step with no idea why. This flag survives that, and it
   * carries a way out rather than only an apology.
   */
  const [slotTaken, setSlotTaken] = useState(false);

  // With staff selection turned off, the shop assigns whoever is free.
  const staffStepEnabled = props.allowCustomerPickStaff && props.staff.length > 0;

  // Narrowed to who can do the whole basket; a pick that no longer can reads as none.
  const { eligibleStaff, staffId } = useEligibleStaff(
    props.staff,
    selectedServiceIds,
    pickedStaffId,
  );

  const { slots, setupIncomplete, slot, setSlot, loadingSlots, error, loadSlots } =
    useAvailabilitySlots({
      tenantId: props.tenantId,
      serviceIds: selectedServiceIds,
      staffId,
    });

  // Slots are fetched from the interaction that needs them, not from an effect:
  // the trigger is always a user action (entering the step, or changing the
  // day), so there is nothing to synchronise after the fact.
  const goToTimeStep = (forDate = date) => {
    setStep(2);
    void loadSlots(forDate);
  };

  const changeDate = (next: string) => {
    setSlotTaken(false);
    setDate(next);
    void loadSlots(next);
  };

  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="flex flex-1 flex-col gap-5">
      <StepIndicator current={step} disabled={staffStepEnabled ? [] : [1]} />

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {slotTaken ? (
        <SlotTakenNotice
          staffStepEnabled={staffStepEnabled}
          onPickOtherStaff={() => {
            setSlotTaken(false);
            setStep(1);
          }}
        />
      ) : null}

      {/* Keyed on the step so React remounts on every move, which replays
          .ct-enter — the customer sees the panel arrive rather than the page
          silently becoming a different page. */}
      <div key={step} className="ct-enter flex flex-1 flex-col">
        {step === 0 ? (
          <ServiceStep
            services={props.services}
            selected={selectedServiceIds}
            onChange={setSelectedServiceIds}
            onNext={() => {
              if (staffStepEnabled) goNext();
              else {
                setStaffId(null);
                goToTimeStep();
              }
            }}
          />
        ) : null}

        {step === 1 ? (
          <StaffStep
            staff={eligibleStaff}
            hiddenCount={props.staff.length - eligibleStaff.length}
            portfolio={props.portfolio}
            selected={staffId}
            onChange={(next) => {
              setSlotTaken(false);
              setStaffId(next);
            }}
            onBack={goBack}
            onNext={() => goToTimeStep()}
          />
        ) : null}

        {step === 2 ? (
          <TimeStep
            timezone={props.timezone}
            maxAdvanceDays={props.maxAdvanceDays}
            date={date}
            onDateChange={changeDate}
            slots={slots}
            loading={loadingSlots}
            setupIncomplete={setupIncomplete}
            shopPhone={props.phone}
            selected={slot}
            onSelect={(next) => {
              setSlotTaken(false);
              setSlot(next);
            }}
            onBack={() => setStep(staffStepEnabled ? 1 : 0)}
            onNext={goNext}
          />
        ) : null}

        {step === 3 && slot ? (
          <ConfirmStep
            tenantId={props.tenantId}
            tenantSlug={props.tenantSlug}
            timezone={props.timezone}
            services={props.services.filter((s) => selectedServiceIds.includes(s.id))}
            staff={props.staff.find((s) => s.id === slot.staffResourceId) ?? null}
            slot={slot}
            liffId={props.liffId}
            onBack={goBack}
            onSlotTaken={() => {
              // No automatic retry (docs/logic.md §2) — the customer sees the
              // refreshed options and decides, rather than being moved silently.
              setSlotTaken(true);
              goToTimeStep();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
