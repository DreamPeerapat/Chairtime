'use client';

import { useState } from 'react';
import { DateTime } from 'luxon';
import { useRouter } from 'next/navigation';
import type { ServiceListItem, StaffListItem } from '@/lib/booking/queries';
import type { Slot } from './booking-flow';
import { formatBaht, formatDuration, splitBaht, thaiDateFull, thaiTimeRange } from './format';

export function ConfirmStep({
  tenantId,
  tenantSlug,
  timezone,
  services,
  staff,
  slot,
  onBack,
  onSlotTaken,
}: {
  tenantId: string;
  tenantSlug: string;
  timezone: string;
  services: ServiceListItem[];
  staff: StaffListItem | null;
  slot: Slot;
  onBack: () => void;
  onSlotTaken: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = DateTime.fromISO(slot.startsAt).setZone(timezone);
  const end = DateTime.fromISO(slot.endsAt).setZone(timezone);
  const total = services.reduce((sum, s) => sum + Math.round(Number(s.price) * 100), 0) / 100;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          startsAt: slot.startsAt,
          serviceIds: services.map((s) => s.id),
          resourceId: slot.staffResourceId ?? undefined,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerNote: note.trim() || null,
        }),
      });

      if (response.status === 409) {
        // Somebody else took it while this form was open. docs/logic.md §2:
        // show fresh options rather than silently moving the customer.
        onSlotTaken();
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'จองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        return;
      }

      const booking = (await response.json()) as { code: string };
      router.push(`/${tenantSlug}/booking/${booking.code}`);
    } catch {
      setError('เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = name.trim().length > 0 && phone.trim().length >= 9 && !submitting;

  // A greyed-out button with no explanation is a dead end: the customer has
  // filled the form in and the app just refuses, silently. Say what is left —
  // but only once they have started, so the form does not open by nagging.
  const missing: string[] = [];
  if (name.trim().length === 0) missing.push('ชื่อ');
  if (phone.trim().length < 9) missing.push('เบอร์โทร 9 หลักขึ้นไป');
  const showMissing = missing.length > 0 && (name.length > 0 || phone.length > 0);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h2 className="text-base font-semibold">ยืนยันการจอง</h2>

      <dl className="rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
        <Row label="วันที่" value={thaiDateFull(start)} />
        <Row label="เวลา" value={thaiTimeRange(start, end)} />
        <Row label="ใช้เวลา" value={formatDuration(slot.durationMin)} />
        <Row label="บริการ" value={services.map((s) => s.name).join(', ')} />
        {staff ? <Row label="ช่าง" value={staff.name} /> : null}
        <Row label="รวม" value={formatBaht(total)} emphasis />
      </dl>

      <div className="flex flex-col gap-3">
        <Field label="ชื่อ" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
            placeholder="ชื่อที่ให้ร้านเรียก"
          />
        </Field>
        <Field label="เบอร์โทร" required>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
            placeholder="08xxxxxxxx"
          />
        </Field>
        <Field label="หมายเหตุถึงร้าน">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
            placeholder="เช่น แพ้น้ำยาบางชนิด, ขอที่จอดรถ"
          />
        </Field>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-5 mt-auto border-t border-slate-200 bg-white/95 px-5 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        {showMissing ? (
          <p className="mb-2 text-xs text-slate-500">ยังขาด {missing.join(' และ ')}</p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="ct-press rounded-xl border border-slate-200 px-5 py-3 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            ย้อนกลับ
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="flex-1 ct-press rounded-xl bg-teal-700 py-3 text-sm font-medium text-white hover:bg-teal-600 active:bg-teal-800 disabled:opacity-40"
          >
            {submitting ? 'กำลังจอง…' : 'ยืนยันการจอง'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  const { symbol, digits } = splitBaht(value);
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800/60">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={emphasis ? 'font-semibold' : 'text-right'}>
        {symbol ? <span className="mr-0.5">{symbol}</span> : null}
        <span className={emphasis ? 'tabular-nums' : ''}>{digits}</span>
      </dd>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}
