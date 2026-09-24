import Image from 'next/image';
import type { PortfolioPhoto } from '@/lib/portfolio/queries';

/**
 * Four, because a 375px phone fits four 64px thumbnails inside the card and
 * clips the fifth — and the fifth is the one carrying the "+N" badge, so five
 * would hide the very thing that says there is more to see.
 */
const THUMBS_SHOWN = 4;

/**
 * The strip of work, captioned.
 *
 * A thumbnail this size cannot show whether the work is any good, which is the
 * question this screen exists to answer — so each one opens full size.
 */
export function PortfolioStrip({
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
      <p className="mb-1.5 text-[11px] text-muted">ผลงานของ{staffName}</p>
      <div className="ct-scroll-x flex gap-2 overflow-x-auto">
        {shown.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => onOpen(index)}
            aria-label={`ดูผลงานของ${staffName} รูปที่ ${index + 1}`}
            className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-muted ring-1 ring-black/5 dark:ring-white/10"
          >
            <Image
              src={photo.imageUrl}
              alt={photo.caption ?? `ผลงานของ${staffName}`}
              fill
              sizes="64px"
              className="object-cover"
            />
            {hidden > 0 && index === shown.length - 1 ? (
              <span className="absolute inset-0 grid place-items-center bg-[#14201f]/60 text-xs font-medium text-white">
                +{hidden}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
