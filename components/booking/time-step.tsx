'use client';

import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import type { Slot } from './booking-flow';
import { shortThaiDate } from './format';

export function TimeStep({
  timezone,
  maxAdvanceDays,
  date,
  onDateChange,
  slots,
  loading,
  selected,
  onSelect,
  onBack,
  onNext,
}: {
  timezone: string;
  maxAdvanceDays: number;
  date: string;
  onDateChange: (date: string) => void;
  slots: Slot[];
  loading: boolean;
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const today = DateTime.now().setZone(timezone).startOf('day');
  const days = Array.from({ length: Math.min(maxAdvanceDays, 30) }, (_, i) =>
    today.plus({ days: i }).toISODate()!,
  );

  // Morning / afternoon / evening reads better than one long column of times.
  const groups = groupByPartOfDay(slots, timezone);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">เลือกวันและเวลา</h2>

      <div className="-mx-5 overflow-x-auto px-5">
        <div className="flex gap-2 pb-1">
          {days.map((day) => {
            const { day: dayName, date: dayNum, month } = shortThaiDate(day, timezone);
            const active = day === date;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onDateChange(day)}
                aria-pressed={active}
                className={cn(
                  'flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 text-xs',
                  active
                    ? 'border-teal-600 bg-teal-700 text-white'
                    : 'border-slate-200 dark:border-slate-800',
                )}
              >
                <span className={active ? 'text-teal-100' : 'text-slate-400'}>{dayName}</span>
                <span className="text-base font-semibold">{dayNum}</span>
                <span className={active ? 'text-teal-100' : 'text-slate-400'}>{month}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">กำลังหาเวลาว่าง…</p>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center dark:border-slate-700">
          <p className="text-sm text-slate-500">วันนี้ไม่มีเวลาว่าง</p>
          <p className="mt-1 text-xs text-slate-400">ลองเลือกวันอื่น หรือเปลี่ยนช่างดูนะคะ</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([label, items]) =>
            items.length === 0 ? null : (
              <section key={label} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-slate-500">{label}</h3>
                <div className="grid grid-cols-4 gap-2">
                  {items.map((slot) => {
                    const active = selected?.startsAt === slot.startsAt;
                    return (
                      <button
                        key={slot.startsAt}
                        type="button"
                        onClick={() => onSelect(slot)}
                        aria-pressed={active}
                        className={cn(
                          'rounded-lg border py-2 text-sm tabular-nums transition',
                          active
                            ? 'border-teal-600 bg-teal-700 text-white'
                            : 'border-slate-200 hover:border-teal-500 dark:border-slate-800',
                        )}
                      >
                        {DateTime.fromISO(slot.startsAt).setZone(timezone).toFormat('HH:mm')}
                      </button>
                    );
                  })}
                </div>
              </section>
            ),
          )}
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-200 px-5 py-3 text-sm dark:border-slate-800"
        >
          ย้อนกลับ
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={onNext}
          className="flex-1 rounded-xl bg-teal-700 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          ถัดไป
        </button>
      </div>
    </div>
  );
}

function groupByPartOfDay(slots: Slot[], timezone: string): Array<[string, Slot[]]> {
  const morning: Slot[] = [];
  const afternoon: Slot[] = [];
  const evening: Slot[] = [];

  for (const slot of slots) {
    const hour = DateTime.fromISO(slot.startsAt).setZone(timezone).hour;
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }

  return [
    ['ช่วงเช้า', morning],
    ['ช่วงบ่าย', afternoon],
    ['ช่วงเย็น', evening],
  ];
}
