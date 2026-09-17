'use client';

/**
 * One portfolio photo, full width, with a way through the rest without closing.
 *
 * Lives apart from the staff step because the step itself is a list of cards
 * and this is a lightbox; keeping both in one file pushed it past the length
 * CLAUDE.md allows for a component.
 */
import Image from 'next/image';
import { MODAL_TITLE_ID, Modal } from '@/components/ui/modal';
import type { PortfolioPhoto } from '@/lib/portfolio/queries';

export function PhotoViewer({
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
        ผลงานของ{staffName}
      </h2>

      <div className="relative mt-3 aspect-square w-full overflow-hidden rounded-xl bg-surface-muted">
        <Image
          src={photo.imageUrl}
          alt={photo.caption ?? `ผลงานของ${staffName}`}
          fill
          sizes="(max-width: 640px) 90vw, 512px"
          className="object-contain"
        />
      </div>

      {photo.caption ? <p className="mt-3 text-sm">{photo.caption}</p> : null}
      {photo.serviceName ? (
        <p className="mt-1 text-xs text-muted">{photo.serviceName}</p>
      ) : null}

      {photos.length > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onIndexChange(index - 1)}
            className="ct-press rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-30"
          >
            ‹ ก่อนหน้า
          </button>
          <span className="text-xs tabular-nums text-muted">
            {index + 1} / {photos.length}
          </span>
          <button
            type="button"
            disabled={index === photos.length - 1}
            onClick={() => onIndexChange(index + 1)}
            className="ct-press rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-30"
          >
            ถัดไป ›
          </button>
        </div>
      ) : null}
    </Modal>
  );
}
