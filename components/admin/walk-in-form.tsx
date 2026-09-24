'use client';

/**
 * Creating a walk-in at the counter.
 *
 * Speed is the whole point: the customer is standing there. So it defaults to
 * "now, rounded up to the next slot" and asks for the least it can — a service
 * and a name. Availability still comes from the server, and the booking still
 * goes through the exclusion constraint.
 */
import { MODAL_TITLE_ID, Modal } from '@/components/ui/modal';
import { useState, useTransition } from 'react';
import { DateTime } from 'luxon';
import type { DayCalendar } from '@/lib/admin/queries';
import { createWalkIn } from '@/lib/admin/actions';
import { WalkInChoices, type Slot } from './walk-in-choices';

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

  return (
    // Escape, the scroll lock and the exit animation all live in Modal now.
    <Modal onClose={onClose} labelledBy={MODAL_TITLE_ID}>
      {(close) => (
        <>
        <h2 id={MODAL_TITLE_ID} className="text-lg font-semibold">
          สร้างคิว Walk-in
        </h2>

        <WalkInChoices
          services={services}
          staff={staff}
          timezone={calendar.timezone}
          serviceId={serviceId}
          staffId={staffId}
          slots={slots}
          slot={slot}
          loading={loading}
          onPickService={pickService}
          onPickStaff={pickStaff}
          onPickSlot={setSlot}
        />

        <section className="mt-4 flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อลูกค้า (ไม่ใส่ก็ได้)"
            className="rounded-lg border border-line px-3 py-2.5 text-sm"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="เบอร์โทร (ไม่ใส่ก็ได้)"
            className="rounded-lg border border-line px-3 py-2.5 text-sm"
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
            onClick={close}
            className="ct-press rounded-xl border border-line px-5 py-3 text-sm hover:bg-surface-muted"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={!slot || pending}
            onClick={submit}
            className="ct-press flex-1 rounded-xl bg-brand py-3 text-sm font-medium text-brand-contrast hover:bg-brand-strong active:bg-brand-strong disabled:opacity-40"
          >
            {pending ? 'กำลังสร้าง…' : 'สร้างคิว'}
          </button>
        </div>
        </>
      )}
    </Modal>
  );
}
