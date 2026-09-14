'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { MODAL_TITLE_ID, Modal } from '@/components/ui/modal';
import type { PortfolioPhoto } from '@/lib/portfolio/queries';

/**
 * The shop's work, for customers.
 *
 * A filter strip on top because "show me nail art" and "show me this stylist's
 * work" are the two questions people actually arrive with — and both come free
 * from the same table, since a photo carries an optional staff member and an
 * optional service.
 */
export function GalleryView({ photos, shopName }: { photos: PortfolioPhoto[]; shopName: string }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<PortfolioPhoto | null>(null);

  // Only offer a filter the shop actually filled in.
  const staffNames = [...new Set(photos.map((p) => p.resourceName).filter(Boolean))] as string[];
  const serviceNames = [...new Set(photos.map((p) => p.serviceName).filter(Boolean))] as string[];
  const filters = [...serviceNames, ...staffNames];

  const shown = filter
    ? photos.filter((p) => p.serviceName === filter || p.resourceName === filter)
    : photos;

  if (photos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-400 dark:border-slate-700">
        ร้านยังไม่ได้ลงรูปผลงาน
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {filters.length > 0 ? (
        <div className="-mx-5 overflow-x-auto px-5">
          <div role="group" aria-label="กรองผลงาน" className="flex gap-2 pb-1">
            <FilterChip label="ทั้งหมด" active={filter === null} onClick={() => setFilter(null)} />
            {filters.map((name) => (
              <FilterChip
                key={name}
                label={name}
                active={filter === name}
                onClick={() => setFilter(name)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((photo) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setOpen(photo)}
              className="ct-press group relative block aspect-square w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800"
            >
              <Image
                src={photo.imageUrl}
                alt={photo.caption ?? `ผลงานของ ${shopName}`}
                fill
                sizes="(max-width: 640px) 50vw, 33vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>

      {open ? (
        <Modal onClose={() => setOpen(null)} labelledBy={MODAL_TITLE_ID} className="max-w-lg">
          <h2 id={MODAL_TITLE_ID} className="sr-only">
            {open.caption ?? `ผลงานของ ${shopName}`}
          </h2>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
            <Image
              src={open.imageUrl}
              alt={open.caption ?? `ผลงานของ ${shopName}`}
              fill
              sizes="(max-width: 640px) 90vw, 512px"
              className="object-contain"
            />
          </div>
          {open.caption ? <p className="mt-3 text-sm">{open.caption}</p> : null}
          <p className="mt-1 text-xs text-slate-500">
            {[open.serviceName, open.resourceName && `โดย ${open.resourceName}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'ct-press shrink-0 rounded-full border px-3.5 py-1.5 text-xs whitespace-nowrap',
        active
          ? 'border-teal-600 bg-teal-700 text-white'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-700',
      )}
    >
      {label}
    </button>
  );
}
