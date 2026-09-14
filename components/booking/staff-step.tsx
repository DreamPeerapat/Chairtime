'use client';

import Image from 'next/image';
import { useState } from 'react';
import { MODAL_TITLE_ID, Modal } from '@/components/ui/modal';
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
  const [viewing, setViewing] = useState<{
    photos: PortfolioPhoto[];
    index: number;
    staffName: string;
  } | null>(null);

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
        {staff.map((person) => {
          const photos = portfolio[person.id] ?? [];
          return (
            <li key={person.id} className="flex flex-col gap-2">
              <Option
                label={person.name}
                hint={person.bio}
                active={selected === person.id}
                onClick={() => onChange(person.id)}
              />

              {/* Outside the selection button, not inside it: a button within
                  a button is invalid, and the browser would have swallowed
                  the tap. A thumbnail this size cannot show whether the work
                  is any good, which is the question this screen exists to
                  answer — so each one opens. */}
              {photos.length > 0 ? (
                <div className="ct-scroll-x -mx-5 flex gap-2 overflow-x-auto px-5">
                  {photos.slice(0, 8).map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setViewing({ photos, index: photos.indexOf(photo), staffName: person.name })}
                      aria-label={`ดูผลงานของ ${person.name}`}
                      className="ct-press relative size-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800"
                    >
                      <Image
                        src={photo.imageUrl}
                        alt={photo.caption ?? `ผลงานของ ${person.name}`}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
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

      {viewing ? (
        <PhotoViewer
          photos={viewing.photos}
          index={viewing.index}
          staffName={viewing.staffName}
          onIndexChange={(index) => setViewing({ ...viewing, index })}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}

/** One photo, full width, with a way through the rest without closing. */
function PhotoViewer({
  photos,
  index,
  staffName,
  onIndexChange,
  onClose,
}: {
  photos: PortfolioPhoto[];
  index: number;
  staffName: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const photo = photos[index]!;

  return (
    <Modal onClose={onClose} labelledBy={MODAL_TITLE_ID} className="max-w-lg">
      <h2 id={MODAL_TITLE_ID} className="text-sm font-medium">
        ผลงานของ {staffName}
      </h2>

      <div className="relative mt-3 aspect-square w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
        <Image
          src={photo.imageUrl}
          alt={photo.caption ?? `ผลงานของ ${staffName}`}
          fill
          sizes="(max-width: 640px) 90vw, 512px"
          className="object-contain"
        />
      </div>

      {photo.caption ? <p className="mt-3 text-sm">{photo.caption}</p> : null}
      {photo.serviceName ? (
        <p className="mt-1 text-xs text-slate-500">{photo.serviceName}</p>
      ) : null}

      {photos.length > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onIndexChange(index - 1)}
            className="ct-press rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-30 dark:border-slate-700"
          >
            ‹ ก่อนหน้า
          </button>
          <span className="text-xs tabular-nums text-slate-500">
            {index + 1} / {photos.length}
          </span>
          <button
            type="button"
            disabled={index === photos.length - 1}
            onClick={() => onIndexChange(index + 1)}
            className="ct-press rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-30 dark:border-slate-700"
          >
            ถัดไป ›
          </button>
        </div>
      ) : null}
    </Modal>
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
        'ct-press w-full rounded-xl border px-4 py-3 text-left',
        active
          ? 'border-teal-600 bg-teal-50 dark:border-teal-500 dark:bg-teal-950/40'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800',
      )}
    >
      <span className="block text-sm font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}

    </button>
  );
}
