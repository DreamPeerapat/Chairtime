'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { PortfolioPhoto } from '@/lib/portfolio/queries';
import type { StaffListItem } from '@/lib/booking/queries';

export function StaffStep({
  staff,
  portfolio,
  selected,
  onChange,
  onBack,
  onNext,
}: {
  staff: StaffListItem[];
  /** published photos by resource id — the work each person has done */
  portfolio: Record<string, PortfolioPhoto[]>;
  selected: string | null;
  onChange: (id: string | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
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
              photos={portfolio[person.id] ?? []}
            />
          </li>
        ))}
      </ul>

      <div className="sticky bottom-0 -mx-5 mt-auto flex gap-2 border-t border-slate-200 bg-white/95 px-5 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <button
          type="button"
          onClick={onBack}
          className="ct-press rounded-xl border border-slate-200 px-5 py-3 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
        >
          ย้อนกลับ
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 ct-press rounded-xl bg-teal-700 py-3 text-sm font-medium text-white hover:bg-teal-600 active:bg-teal-800"
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
  photos = [],
}: {
  label: string;
  hint: string | null;
  active: boolean;
  onClick: () => void;
  photos?: PortfolioPhoto[];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'ct-press w-full rounded-xl border px-4 py-3 text-left',
        active
          ? 'border-teal-600 bg-teal-50 dark:border-teal-500 dark:bg-teal-950/40'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800',
      )}
    >
      <span className="block text-sm font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}

      {/* Whose work is this? — the question people are actually answering on
          this screen. A name alone cannot answer it. */}
      {photos.length > 0 ? (
        <span className="ct-scroll-x mt-2.5 flex gap-1.5 overflow-x-auto">
          {photos.slice(0, 6).map((photo) => (
            <span
              key={photo.id}
              className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800"
            >
              <Image
                src={photo.imageUrl}
                alt={photo.caption ?? `ผลงานของ ${label}`}
                fill
                sizes="56px"
                className="object-cover"
              />
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}
