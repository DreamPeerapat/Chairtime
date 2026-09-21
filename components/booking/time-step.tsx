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
  setupIncomplete,
  shopPhone,
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
  /** no day will have a slot until the shop finishes setting itself up */
  setupIncomplete: boolean;
  shopPhone: string | null;
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
    <div className="flex flex-1 flex-col gap-4">
      <h2 className="text-base font-semibold">เลือกวันและเวลา</h2>

      <div className="ct-scroll-x -mx-5 overflow-x-auto px-5">
        {/* A labelled group so the strip announces itself as the day picker
            rather than as a run of unrelated buttons. */}
        <div role="group" aria-label="เลือกวัน" className="flex gap-2 pb-1">
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
                  'ct-press flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 text-xs',
                  active
                    ? 'border-brand bg-brand text-brand-contrast shadow-sm shadow-brand/30'
                    : 'border-line hover:border-line',
                )}
              >
                <span className={active ? 'text-brand-contrast/80' : 'text-muted'}>{dayName}</span>
                <span className="text-base font-semibold">{dayNum}</span>
                <span className={active ? 'text-brand-contrast/80' : 'text-muted'}>{month}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        // The shape of the answer, held while it loads: the grid does not jump
        // when the real times land, and the wait reads as progress.
        <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
          <span className="sr-only">กำลังหาเวลาว่าง</span>
          {[8, 6].map((count, group) => (
            <section key={group} className="flex flex-col gap-2">
              <div className="ct-skeleton h-3 w-16 rounded" />
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: count }, (_, i) => (
                  <div key={i} className="ct-skeleton h-9 rounded-lg" />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : setupIncomplete ? (
        // Telling this customer to try another day would send them round a
        // loop with no exit — no day has slots until the shop adds staff,
        // seats or opening hours. Hand them the phone instead.
        <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50 px-4 py-8 text-center dark:border-amber-700 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            ร้านยังไม่เปิดรับจองออนไลน์
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            ร้านกำลังตั้งค่าระบบอยู่ ยังไม่สามารถเลือกเวลาได้
          </p>
          {shopPhone ? (
            <a
              href={`tel:${shopPhone}`}
              className="mt-4 inline-block rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-medium text-white"
            >
              โทรจองที่ {shopPhone}
            </a>
          ) : null}
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line py-8 text-center">
          <p className="text-sm text-muted">วันนี้ไม่มีเวลาว่าง</p>
          <p className="mt-1 text-xs text-muted">ลองเลือกวันอื่น หรือเปลี่ยนช่างดูนะคะ</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([label, items]) =>
            items.length === 0 ? null : (
              <section key={label} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-muted">{label}</h3>
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
                          'ct-press rounded-lg border py-2 text-sm tabular-nums',
                          active
                            ? 'border-brand bg-brand text-brand-contrast shadow-sm shadow-brand/30'
                            : 'border-line hover:border-brand hover:bg-brand-soft',
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

      <div className="sticky bottom-0 -mx-5 mt-auto flex gap-2 border-t border-line bg-surface/95 px-5 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="ct-press rounded-xl border border-line px-5 py-3 text-sm hover:bg-surface-muted"
        >
          ย้อนกลับ
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={onNext}
          className="flex-1 ct-press rounded-xl bg-brand py-3 text-sm font-medium text-brand-contrast hover:bg-brand-strong active:bg-brand-strong disabled:opacity-40"
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
