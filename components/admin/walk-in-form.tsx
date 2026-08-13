'use client';

/**
 * Creating a walk-in at the counter.
 *
 * Speed is the whole point: the customer is standing there. So it defaults to
 * "now, rounded up to the next slot" and asks for the least it can — a service
 * and a name. Availability still comes from the server, and the booking still
 * goes through the exclusion constraint.
 */
import { useEffect, useState, useTransition } from 'react';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import type { DayCalendar } from '@/lib/admin/queries';
import { createWalkIn } from '@/lib/admin/actions';

interface Slot {
  startsAt: string;
  endsAt: string;
  durationMin: number;
  staffResourceId: string | null;
}

export function WalkInForm({
  calendar,
  services,
  onClose,
  onCreated,
}: {
  calendar: DayCalendar;
  services: Array<{ id: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const staff = calendar.resources.filter((r) => r.isHuman);

  async function loadSlots(nextServiceId: string, nextStaffId: string | null) {
    setLoading(true);
    setError(null);
    setSlot(null);
    try {
      // No tenantId: the admin endpoint reads it from the signed session.
      const params = new URLSearchParams({
        date: calendar.date,
        serviceIds: nextServiceId,
      });
      if (nextStaffId) params.set('resourceId', nextStaffId);

      const response = await fetch(`/api/admin/availability?${params}`);
      if (!response.ok) throw new Error('failed');
      const body = (await response.json()) as { slots: Slot[] };

      // The customer is here now, so lead with what is still to come today.
      const now = DateTime.now().setZone(calendar.timezone);
      const upcoming = body.slots.filter(
        (s) => DateTime.fromISO(s.startsAt) >= now.minus({ minutes: 30 }),
      );
      setSlots(upcoming.length > 0 ? upcoming : body.slots);
      setSlot(upcoming[0] ?? body.slots[0] ?? null);
    } catch {
      setError('โหลดเวลาว่างไม่สำเร็จ');
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }

  function pickService(id: string) {
    setServiceId(id);
    void loadSlots(id, staffId);
  }

  function pickStaff(id: string | null) {
    setStaffId(id);
    if (serviceId) void loadSlots(serviceId, id);
  }

  function submit() {
    if (!serviceId || !slot) return;
    setError(null);
    startTransition(async () => {
      const result = await createWalkIn({
        serviceIds: [serviceId],
        startsAt: slot.startsAt,
        resourceId: slot.staffResourceId ?? undefined,
        customerName: name.trim() || undefined,
        customerPhone: phone.trim() || undefined,
      });
      if (result.ok) onCreated();
      else setError(result.error ?? 'สร้างคิวไม่สำเร็จ');
    });
  }

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">สร้างคิว Walk-in</h2>

        <section className="mt-4">
          <h3 className="mb-2 text-xs font-medium text-slate-500">บริการ</h3>
          <div className="flex flex-wrap gap-1.5">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => pickService(service.id)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs',
                  serviceId === service.id
                    ? 'border-teal-600 bg-teal-700 text-white'
                    : 'border-slate-200 dark:border-slate-700',
                )}
              >
                {service.name}
              </button>
            ))}
          </div>
        </section>

        {serviceId ? (
          <section className="mt-4">
            <h3 className="mb-2 text-xs font-medium text-slate-500">ช่าง</h3>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => pickStaff(null)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs',
                  staffId === null
                    ? 'border-teal-600 bg-teal-700 text-white'
                    : 'border-slate-200 dark:border-slate-700',
                )}
              >
                ใครก็ได้
              </button>
              {staff.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => pickStaff(person.id)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs',
                    staffId === person.id
                      ? 'border-teal-600 bg-teal-700 text-white'
                      : 'border-slate-200 dark:border-slate-700',
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
            <h3 className="mb-2 text-xs font-medium text-slate-500">เวลา</h3>
            {loading ? (
              <p className="text-sm text-slate-400">กำลังหาเวลาว่าง…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-slate-500">ไม่มีเวลาว่างเหลือในวันนี้</p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {slots.slice(0, 16).map((option) => (
                  <button
                    key={option.startsAt}
                    type="button"
                    onClick={() => setSlot(option)}
                    className={cn(
                      'rounded-lg border py-1.5 text-xs tabular-nums',
                      slot?.startsAt === option.startsAt
                        ? 'border-teal-600 bg-teal-700 text-white'
                        : 'border-slate-200 dark:border-slate-700',
                    )}
                  >
                    {DateTime.fromISO(option.startsAt).setZone(calendar.timezone).toFormat('HH:mm')}
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <section className="mt-4 flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อลูกค้า (ไม่ใส่ก็ได้)"
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="เบอร์โทร (ไม่ใส่ก็ได้)"
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
          />
        </section>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm dark:border-slate-800"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={!slot || pending}
            onClick={submit}
            className="flex-1 rounded-xl bg-teal-700 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? 'กำลังสร้าง…' : 'สร้างคิว'}
          </button>
        </div>
      </div>
    </div>
  );
}
