'use client';

import { cn } from '@/lib/utils';
import type { StaffListItem } from '@/lib/booking/queries';

export function StaffStep({
  staff,
  selected,
  onChange,
  onBack,
  onNext,
}: {
  staff: StaffListItem[];
  selected: string | null;
  onChange: (id: string | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">เลือกช่าง</h2>

      <ul className="flex flex-col gap-2">
        <li>
          <Option
            label="ช่างคนไหนก็ได้"
            hint="ระบบจะจัดช่างที่ว่างให้ — มักได้เวลาที่ต้องการมากกว่า"
            active={selected === null}
            onClick={() => onChange(null)}
          />
        </li>
        {staff.map((person) => (
          <li key={person.id}>
            <Option
              label={person.name}
              hint={person.bio}
              active={selected === person.id}
              onClick={() => onChange(person.id)}
            />
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-200 px-5 py-3 text-sm dark:border-slate-800"
        >
          ย้อนกลับ
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-xl bg-teal-700 py-3 text-sm font-medium text-white"
        >
          ถัดไป
        </button>
      </div>
    </div>
  );
}

function Option({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'w-full rounded-xl border px-4 py-3 text-left transition',
        active
          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800',
      )}
    >
      <span className="block text-sm font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
    </button>
  );
}
