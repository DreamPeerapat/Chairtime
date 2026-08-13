'use client';

/**
 * The customer booking flow: service → staff → time → confirm.
 *
 * A client component because it is four dependent steps of local state. It owns
 * no business logic — availability comes from /api/availability and the booking
 * itself from POST /api/bookings, so the rules live on the server where the
 * database can enforce them.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import type { ServiceListItem, StaffListItem } from '@/lib/booking/queries';
import { ServiceStep } from './service-step';
import { StaffStep } from './staff-step';
import { TimeStep } from './time-step';
import { ConfirmStep } from './confirm-step';

export interface BookingFlowProps {
  tenantId: string;
  tenantSlug: string;
  timezone: string;
  maxAdvanceDays: number;
  allowCustomerPickStaff: boolean;
  services: ServiceListItem[];
  staff: StaffListItem[];
  liffId: string | null;
}

export interface Slot {
  startsAt: string;
  endsAt: string;
  durationMin: number;
  staffResourceId: string | null;
}

const STEPS = ['บริการ', 'ช่าง', 'เวลา', 'ยืนยัน'] as const;

export function BookingFlow(props: BookingFlowProps) {
  const [step, setStep] = useState(0);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(() => DateTime.now().setZone(props.timezone).toISODate()!);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // With staff selection turned off, the shop assigns whoever is free.
  const staffStepEnabled = props.allowCustomerPickStaff && props.staff.length > 0;

  const eligibleStaff = useMemo(() => props.staff, [props.staff]);

  const loadSlots = useCallback(
    async (forDate: string) => {
      if (selectedServiceIds.length === 0) return;
      setLoadingSlots(true);
      setError(null);
      setSlot(null);
      try {
        const params = new URLSearchParams({
          tenantId: props.tenantId,
          date: forDate,
          serviceIds: selectedServiceIds.join(','),
        });
        if (staffId) params.set('resourceId', staffId);

        const response = await fetch(`/api/availability?${params}`);
        if (!response.ok) throw new Error('load failed');
        const body = (await response.json()) as { slots: Slot[] };
        setSlots(body.slots);
      } catch {
        setError('โหลดเวลาว่างไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    },
    [props.tenantId, selectedServiceIds, staffId],
  );

  useEffect(() => {
    if (step === 2) void loadSlots(date);
  }, [step, date, loadSlots]);

  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const skipStaffStep = () => {
    setStaffId(null);
    setStep(2);
  };

  return (
    <div className="flex flex-col gap-5">
      <StepIndicator current={step} disabled={staffStepEnabled ? [] : [1]} />

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <ServiceStep
          services={props.services}
          selected={selectedServiceIds}
          onChange={setSelectedServiceIds}
          onNext={() => (staffStepEnabled ? goNext() : skipStaffStep())}
        />
      ) : null}

      {step === 1 ? (
        <StaffStep
          staff={eligibleStaff}
          selected={staffId}
          onChange={setStaffId}
          onBack={goBack}
          onNext={goNext}
        />
      ) : null}

      {step === 2 ? (
        <TimeStep
          timezone={props.timezone}
          maxAdvanceDays={props.maxAdvanceDays}
          date={date}
          onDateChange={setDate}
          slots={slots}
          loading={loadingSlots}
          selected={slot}
          onSelect={setSlot}
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
          onBack={goBack}
          onSlotTaken={() => {
            setError('ช่วงเวลานี้เพิ่งถูกจองไป กรุณาเลือกเวลาใหม่');
            setStep(2);
            void loadSlots(date);
          }}
        />
      ) : null}
    </div>
  );
}

function StepIndicator({ current, disabled }: { current: number; disabled: number[] }) {
  return (
    <ol className="flex items-center gap-1.5 text-xs">
      {STEPS.map((label, index) => {
        const skipped = disabled.includes(index);
        return (
          <li key={label} className="flex flex-1 items-center gap-1.5">
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-medium',
                index === current
                  ? 'bg-teal-700 text-white'
                  : index < current
                    ? 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800',
                skipped && 'opacity-40',
              )}
            >
              {index + 1}
            </span>
            <span className={cn('truncate', index === current ? 'font-medium' : 'text-slate-400')}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
