/**
 * The service, staff and time pickers of the walk-in form.
 *
 * Purely presentational: the form owns the state and the availability fetch,
 * so picking here only reports back what was tapped.
 */
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import type { CalendarResource } from '@/lib/admin/queries';

export interface Slot {
  startsAt: string;
  endsAt: string;
  durationMin: number;
  staffResourceId: string | null;
}

export function WalkInChoices({
  services,
  staff,
  timezone,
  serviceId,
  staffId,
  slots,
  slot,
  loading,
  onPickService,
  onPickStaff,
  onPickSlot,
}: {
  services: Array<{ id: string; name: string }>;
  staff: CalendarResource[];
  timezone: string;
  serviceId: string | null;
  staffId: string | null;
  slots: Slot[];
  slot: Slot | null;
  loading: boolean;
  onPickService: (id: string) => void;
  onPickStaff: (id: string | null) => void;
  onPickSlot: (slot: Slot) => void;
}) {
  return (
    <>
      <section className="mt-4">
        <h3 className="mb-2 text-xs font-medium text-muted">บริการ</h3>
        <div className="flex flex-wrap gap-1.5">
          {services.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => onPickService(service.id)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs',
                serviceId === service.id
                  ? 'border-brand bg-brand text-brand-contrast'
                  : 'border-line',
              )}
            >
              {service.name}
            </button>
          ))}
        </div>
      </section>

      {serviceId ? (
        <section className="mt-4">
          <h3 className="mb-2 text-xs font-medium text-muted">ช่าง</h3>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onPickStaff(null)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs',
                staffId === null
                  ? 'border-brand bg-brand text-brand-contrast'
                  : 'border-line',
              )}
            >
              ใครก็ได้
            </button>
            {staff.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => onPickStaff(person.id)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs',
                  staffId === person.id
                    ? 'border-brand bg-brand text-brand-contrast'
                    : 'border-line',
                )}
              >
                {person.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {serviceId ? (
        <section className="mt-4">
          <h3 className="mb-2 text-xs font-medium text-muted">เวลา</h3>
          {loading ? (
            <p className="text-sm text-muted">กำลังหาเวลาว่าง…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted">ไม่มีเวลาว่างเหลือในวันนี้</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {slots.slice(0, 16).map((option) => (
                <button
                  key={option.startsAt}
                  type="button"
                  onClick={() => onPickSlot(option)}
                  className={cn(
                    'rounded-lg border py-1.5 text-xs tabular-nums',
                    slot?.startsAt === option.startsAt
                      ? 'border-brand bg-brand text-brand-contrast'
                      : 'border-line',
                  )}
                >
                  {DateTime.fromISO(option.startsAt).setZone(timezone).toFormat('HH:mm')}
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
