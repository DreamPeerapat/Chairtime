/**
 * One weekday in the hours editor: open or closed, and each of its ranges.
 *
 * The tab owns the list; this row only describes how to change its own day,
 * so a lunch break stays a second range rather than a separate weekday.
 */
import { cn } from '@/lib/utils';
import { MAX_RANGES_PER_DAY, type WeekdayHours } from '@/lib/admin/hours';
import { WEEKDAYS, inputClass } from './ui';

export function HoursDayRow({
  day,
  onUpdate,
}: {
  day: WeekdayHours;
  onUpdate: (change: (day: WeekdayHours) => WeekdayHours) => void;
}) {
  return (
    <li className="flex flex-col gap-2 border-b border-line pb-3 last:border-0">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={day.open}
          onChange={(e) => onUpdate((d) => ({ ...d, open: e.target.checked }))}
          className="h-4 w-4"
        />
        {WEEKDAYS[day.weekday]}
        {day.open && day.ranges.length > 1 ? (
          <span className="text-xs text-muted">({day.ranges.length} ช่วง)</span>
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
              onUpdate((d) => ({
                ...d,
                ranges: d.ranges.map((r, i) =>
                  i === index ? { ...r, openTime: e.target.value } : r,
                ),
              }))
            }
            className={cn(inputClass, 'w-28')}
          />
          <span className="text-muted">–</span>
          <input
            type="time"
            value={range.closeTime}
            disabled={!day.open}
            aria-label={`${WEEKDAYS[day.weekday]} ช่วงที่ ${index + 1} เวลาปิด`}
            onChange={(e) =>
              onUpdate((d) => ({
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
                onUpdate((d) => ({
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
            onUpdate((d) => ({
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
  );
}
