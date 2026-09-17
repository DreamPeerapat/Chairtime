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
  MAX_RANGES_PER_DAY,
  groupByWeekday,
  toRows,
  validateHourRows,
  type HourRow,
  type WeekdayHours,
} from '@/lib/admin/hours';
import type { AdminResource } from './resource-manager';
import { ErrorText, WEEKDAYS, activeChip, idleChip, inputClass, primaryButton } from './ui';

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
          <li key={day.weekday} className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={day.open}
                onChange={(e) => update(day.weekday, (d) => ({ ...d, open: e.target.checked }))}
                className="h-4 w-4"
              />
              {WEEKDAYS[day.weekday]}
              {day.open && day.ranges.length > 1 ? (
                <span className="text-xs text-slate-400">({day.ranges.length} ช่วง)</span>
              ) : null}
            </label>

            {day.ranges.map((range, index) => (
              <div key={index} className="flex items-center gap-2 ps-6">
                <input
                  type="time"
                  value={range.openTime}
                  disabled={!day.open}
                  aria-label={`${WEEKDAYS[day.weekday]} ช่วงที่ ${index + 1} เวลาเปิด`}
                  onChange={(e) =>
                    update(day.weekday, (d) => ({
                      ...d,
                      ranges: d.ranges.map((r, i) =>
                        i === index ? { ...r, openTime: e.target.value } : r,
                      ),
                    }))
                  }
                  className={cn(inputClass, 'w-28')}
                />
                <span className="text-slate-400">–</span>
                <input
                  type="time"
                  value={range.closeTime}
                  disabled={!day.open}
                  aria-label={`${WEEKDAYS[day.weekday]} ช่วงที่ ${index + 1} เวลาปิด`}
                  onChange={(e) =>
                    update(day.weekday, (d) => ({
                      ...d,
                      ranges: d.ranges.map((r, i) =>
                        i === index ? { ...r, closeTime: e.target.value } : r,
                      ),
                    }))
                  }
                  className={cn(inputClass, 'w-28')}
                />
                {day.open && day.ranges.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      update(day.weekday, (d) => ({
                        ...d,
                        ranges: d.ranges.filter((_, i) => i !== index),
                      }))
                    }
                    aria-label={`ลบช่วงที่ ${index + 1} ของวัน${WEEKDAYS[day.weekday]}`}
                    className="rounded-lg border border-line px-2 py-1 text-xs text-muted"
                  >
                    ลบ
                  </button>
                ) : null}
              </div>
            ))}

            {day.open && day.ranges.length < MAX_RANGES_PER_DAY ? (
              <button
                type="button"
                onClick={() =>
                  update(day.weekday, (d) => ({
                    ...d,
                    ranges: [...d.ranges, { openTime: '14:00', closeTime: '20:00' }],
                  }))
                }
                className="ms-6 w-fit rounded-lg border border-line px-2.5 py-1 text-xs"
              >
                + เพิ่มช่วง
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="text-xs text-slate-400">
        ร้านที่พักกลางวันให้เพิ่มช่วงที่สอง เช่น 10:00–13:00 และ 14:00–20:00
      </p>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <button type="button" onClick={save} disabled={pending} className={primaryButton}>
        {pending ? 'กำลังบันทึก…' : 'บันทึกเวลาทำการ'}
      </button>
    </div>
  );
}
