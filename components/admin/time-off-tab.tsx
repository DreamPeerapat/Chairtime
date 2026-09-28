'use client';

/**
 * Staff leave and whole-shop closures, entered as whole days.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { createTimeOff, deleteTimeOff } from '@/lib/admin/actions';
import { thaiDayMonth } from '@/components/booking/format';
import type { AdminResource } from './resource-manager';
import { ErrorText, inputClass, primaryButton } from './ui';

export function TimeOffTab({
  resources,
  timeOff,
  timezone,
}: {
  resources: AdminResource[];
  timeOff: Array<{ id: string; resourceId: string | null; start: string; end: string; reason: string | null }>;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const resourceId = String(formData.get('resourceId') ?? '');
      const startDate = String(formData.get('startDate') ?? '');
      const endDate = String(formData.get('endDate') ?? '');
      if (!startDate || !endDate) {
        setError('กรุณาเลือกวันที่');
        return;
      }

      // Whole days, in the shop's timezone: the end is exclusive, so a one-day
      // leave runs to the start of the next day.
      const start = DateTime.fromISO(startDate, { zone: timezone }).startOf('day');
      const end = DateTime.fromISO(endDate, { zone: timezone }).startOf('day').plus({ days: 1 });

      const result = await createTimeOff({
        resourceId: resourceId || null,
        start: start.toISO(),
        end: end.toISO(),
        reason: formData.get('reason') || null,
      });
      if (result.ok) router.refresh();
      else setError(result.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteTimeOff({ id });
      router.refresh();
    });
  }

  const today = DateTime.now().setZone(timezone).toISODate()!;

  return (
    <div className="flex flex-col gap-5">
      <form action={add} className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <h2 className="text-sm font-medium">เพิ่มวันลา / ปิดร้าน</h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">ใคร</span>
          <select name="resourceId" className={inputClass}>
            <option value="">ปิดทั้งร้าน</option>
            {resources
              .filter((r) => r.isHuman && r.isActive)
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">ตั้งแต่</span>
            <input type="date" name="startDate" required defaultValue={today} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">ถึง</span>
            <input type="date" name="endDate" required defaultValue={today} className={inputClass} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">เหตุผล</span>
          <input name="reason" placeholder="เช่น ลาพักร้อน, ปิดปรับปรุงร้าน" className={inputClass} />
        </label>

        {error ? <ErrorText>{error}</ErrorText> : null}

        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? 'กำลังบันทึก…' : 'เพิ่ม'}
        </button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">ที่กำหนดไว้</h2>
        {timeOff.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            ยังไม่มีวันลา
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {timeOff.map((off) => {
              const person = resources.find((r) => r.id === off.resourceId);
              const start = DateTime.fromISO(off.start).setZone(timezone);
              const end = DateTime.fromISO(off.end).setZone(timezone).minus({ minutes: 1 });
              return (
                <li
                  key={off.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{person?.name ?? 'ปิดทั้งร้าน'}</p>
                    <p className="text-xs text-muted">
                      {thaiDayMonth(start)}
                      {start.hasSame(end, 'day') ? '' : ` – ${thaiDayMonth(end)}`}
                      {off.reason ? ` · ${off.reason}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(off.id)}
                    disabled={pending}
                    className="text-xs text-red-600 disabled:opacity-50"
                  >
                    ลบ
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
