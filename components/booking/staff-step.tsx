'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { PortfolioPhoto } from '@/lib/portfolio/queries';
import type { StaffListItem } from '@/lib/booking/queries';
import { initialOf } from './format';
import { PhotoViewer } from './photo-viewer';

/**
 * Four, because a 375px phone fits four 64px thumbnails inside the card and
 * clips the fifth — and the fifth is the one carrying the "+N" badge, so five
 * would hide the very thing that says there is more to see.
 */
const THUMBS_SHOWN = 4;

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

      <ul className="flex flex-col gap-2.5">
        <li>
          <Card active={selected === null} onSelect={() => onChange(null)}>
            <Avatar name="ช่างคนไหนก็ได้" photoUrl={null} anyone />
            <Text
              name="ช่างคนไหนก็ได้"
              hint="ระบบจะจัดช่างที่ว่างให้ — มักได้เวลาที่ต้องการมากกว่า"
            />
            <Tick shown={selected === null} />
          </Card>
        </li>

        {staff.map((person) => {
          const photos = portfolio[person.id] ?? [];
          return (
            <li key={person.id}>
              <Card
                active={selected === person.id}
                onSelect={() => onChange(person.id)}
                label={person.name}
                below={
                  photos.length > 0 ? (
                    <PortfolioStrip
                      photos={photos}
                      staffName={person.name}
                      onOpen={(index) => setViewing({ photos, index, staffName: person.name })}
                    />
                  ) : null
                }
              >
                <Avatar name={person.name} photoUrl={person.photoUrl} />
                <Text name={person.name} hint={person.bio} />
                <Tick shown={selected === person.id} />
              </Card>
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

/**
 * One person: the tap target and their work, in the same box.
 *
 * The photos used to sit under the card, edge to edge, which read as a strip
 * belonging to nobody — or worse, to the person listed below. They belong
 * inside, but a button cannot contain another button: the browser drops the
 * inner one. So the selection button stretches its own hit area across the
 * whole card with `after:inset-0`, and the thumbnails sit above it on z-10.
 *
 * `ct-press` goes on the card rather than the button because its :active
 * transform would make the button the containing block, shrinking the
 * stretched overlay away from under the finger mid-press.
 */
function Card({
  active,
  onSelect,
  label,
  children,
  below,
}: {
  active: boolean;
  onSelect: () => void;
  label?: string;
  children: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'ct-press relative overflow-hidden rounded-2xl border',
        active
          ? 'border-teal-600 bg-teal-50 dark:border-teal-500 dark:bg-teal-950/40'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        aria-label={label}
        className="flex w-full items-center gap-3 px-4 py-3 text-left after:absolute after:inset-0"
      >
        {children}
      </button>
      {below}
    </div>
  );
}

/** Their face if the shop uploaded one, their initial if not. */
function Avatar({
  name,
  photoUrl,
  anyone,
}: {
  name: string;
  photoUrl: string | null;
  anyone?: boolean;
}) {
  if (photoUrl) {
    return (
      <span className="relative size-11 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <Image src={photoUrl} alt="" fill sizes="44px" className="object-cover" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full text-sm font-medium',
        anyone
          ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          : 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200',
      )}
    >
      {anyone ? '✨' : initialOf(name)}
    </span>
  );
}

function Text({ name, hint }: { name: string; hint: string | null }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{name}</span>
      {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
    </span>
  );
}

function Tick({ shown }: { shown: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full border text-[11px] leading-none',
        shown
          ? 'border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500'
          : 'border-slate-300 text-transparent dark:border-slate-700',
      )}
    >
      ✓
    </span>
  );
}

/**
 * The strip of work, captioned.
 *
 * A thumbnail this size cannot show whether the work is any good, which is the
 * question this screen exists to answer — so each one opens full size.
 */
function PortfolioStrip({
  photos,
  staffName,
  onOpen,
}: {
  photos: PortfolioPhoto[];
  staffName: string;
  onOpen: (index: number) => void;
}) {
  const shown = photos.slice(0, THUMBS_SHOWN);
  const hidden = photos.length - shown.length;

  return (
    <div className="relative z-10 px-4 pb-3">
      <p className="mb-1.5 text-[11px] text-slate-500">ผลงานของ{staffName}</p>
      <div className="ct-scroll-x flex gap-2 overflow-x-auto">
        {shown.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => onOpen(index)}
            aria-label={`ดูผลงานของ${staffName} รูปที่ ${index + 1}`}
            className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-black/5 dark:bg-slate-800 dark:ring-white/10"
          >
            <Image
              src={photo.imageUrl}
              alt={photo.caption ?? `ผลงานของ${staffName}`}
              fill
              sizes="64px"
              className="object-cover"
            />
            {hidden > 0 && index === shown.length - 1 ? (
              <span className="absolute inset-0 grid place-items-center bg-slate-900/60 text-xs font-medium text-white">
                +{hidden}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
