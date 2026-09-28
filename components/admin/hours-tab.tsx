'use client';

/**
 * Opening hours, with as many ranges per day as the shop actually keeps.
 *
 * The previous editor read one row per weekday with `find()` and wrote back
 * only what it had shown. A shop that closes over lunch keeps two rows per day,
 * so opening this tab and pressing save deleted every afternoon without saying
 * a word — and the shop then took bookings while its doors were shut.
 *
 * The grouping and the rules live in lib/admin/hours.ts so the same checks run
 * here and in the server action.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { saveHours } from '@/lib/admin/actions';
import {
  groupByWeekday,
  toRows,
  validateHourRows,
  type HourRow,
  type WeekdayHours,
} from '@/lib/admin/hours';
import { HoursDayRow } from './hours-day-row';
import type { AdminResource } from './resource-manager';
import { ErrorText, activeChip, idleChip, primaryButton } from './ui';

export function HoursTab({
  resources,
  shopHours,
}: {
  resources: AdminResource[];
  shopHours: HourRow[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null); // null = whole shop
  const [days, setDays] = useState<WeekdayHours[]>(() => groupByWeekday(shopHours));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function hoursOf(next: string | null): HourRow[] {
    if (next === null) return shopHours;
    return resources.find((r) => r.id === next)?.hours ?? [];
  }

  function switchTarget(next: string | null) {
    setTarget(next);
    setDays(groupByWeekday(hoursOf(next)));
    setError(null);
  }

  function update(weekday: number, change: (day: WeekdayHours) => WeekdayHours) {
    setDays((prev) => prev.map((day) => (day.weekday === weekday ? change(day) : day)));
    setError(null);
  }

  function save() {
    const rows = toRows(days);
    // Same rules the action enforces, run here so the shop sees the problem
    // against the field it just typed rather than after a round trip.
    const problem = validateHourRows(rows);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await saveHours({ resourceId: target, rows });
      if (result.ok) router.refresh();
      else setError(result.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => switchTarget(null)}
          className={cn('rounded-lg border px-3 py-1.5 text-xs', target === null ? activeChip : idleChip)}
        >
          ทั้งร้าน
        </button>
        {resources
          .filter((r) => r.isHuman && r.isActive)
          .map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => switchTarget(person.id)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs',
                target === person.id ? activeChip : idleChip,
              )}
            >
              {person.name}
            </button>
          ))}
      </div>

      <p className="text-xs text-muted">
        {target === null
          ? 'เวลาเปิด-ปิดของร้าน ใช้กับทุกคนที่ไม่ได้ตั้งเวลาเฉพาะตัว'
          : 'ถ้าไม่ติ๊กวันไหนเลย คนนี้จะใช้เวลาของร้านแทน'}
      </p>

      <ul className="flex flex-col gap-3">
        {days.map((day) => (
          <HoursDayRow
            key={day.weekday}
            day={day}
            onUpdate={(change) => update(day.weekday, change)}
          />
        ))}
      </ul>

      <p className="text-xs text-muted">
        ร้านที่พักกลางวันให้เพิ่มช่วงที่สอง เช่น 10:00–13:00 และ 14:00–20:00
      </p>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <button type="button" onClick={save} disabled={pending} className={primaryButton}>
        {pending ? 'กำลังบันทึก…' : 'บันทึกเวลาทำการ'}
      </button>
    </div>
  );
}
