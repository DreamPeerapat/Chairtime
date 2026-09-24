'use client';

import { Children, useCallback, useEffect, useRef, useState } from 'react';

/**
 * The pricing row: three columns from `lg`, a sideways slide below that.
 *
 * Stacked on a phone the three cards were three screens of scrolling, and by
 * the third a shop had forgotten what the first one cost. Side by side with a
 * snap, the plans stay the same distance apart and comparing them is a swipe.
 *
 * The row is native scrolling — CSS scroll-snap, not a slider library — so
 * touch, trackpad, keyboard and screen readers all behave the way they do
 * everywhere else. The arrows and dots are a convenience on top of it and
 * only move the row; they hold no state the row does not already have.
 *
 * It opens on the recommended plan, not the first: the trial is still one
 * swipe to the left, and the plan most shops should pick is the one they see.
 */
export function PlanCarousel({
  children,
  labels,
  startAt,
}: {
  children: React.ReactNode;
  /** each slide's name, for the dots */
  labels: string[];
  startAt: number;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(startAt);
  const count = Children.count(children);

  const slides = useCallback(() => Array.from(rowRef.current?.children ?? []) as HTMLElement[], []);

  const goTo = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const row = rowRef.current;
      const slide = slides()[index];
      if (!row || !slide) return;
      // scrollTo on the row, not scrollIntoView on the card: the latter also
      // scrolls the page vertically when the row is below the fold.
      row.scrollTo({ left: slide.offsetLeft - (row.clientWidth - slide.clientWidth) / 2, behavior });
    },
    [slides],
  );

  useEffect(() => {
    // Only where the row actually slides; at `lg` it is a grid and this is a no-op.
    if (rowRef.current && rowRef.current.scrollWidth > rowRef.current.clientWidth) goTo(startAt, 'instant');
  }, [goTo, startAt]);

  function onScroll() {
    const row = rowRef.current;
    if (!row) return;
    const centre = row.scrollLeft + row.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    slides().forEach((slide, i) => {
      const distance = Math.abs(slide.offsetLeft + slide.clientWidth / 2 - centre);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    if (nearest !== active) setActive(nearest);
  }

  return (
    <div className="mt-9">
      <div
        ref={rowRef}
        onScroll={onScroll}
        className="ct-carousel ct-stagger ct-scroll-x -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[8%] pt-4 pb-2 sm:px-[21%] lg:mx-0 lg:grid lg:snap-none lg:grid-cols-3 lg:items-start lg:gap-5 lg:overflow-visible lg:px-0"
      >
        {children}
      </div>

      <div className="mt-5 flex items-center justify-center gap-3 lg:hidden">
        <Arrow direction="prev" disabled={active === 0} onClick={() => goTo(active - 1)} />
        <div className="flex items-center">
          {labels.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`ดูแพ็กเกจ ${label}`}
              aria-current={i === active ? 'true' : undefined}
              className="grid size-11 place-items-center"
            >
              <span
                className={`block h-2 rounded-full transition-all duration-300 ${
                  i === active ? 'w-6 bg-brand' : 'w-2 bg-line'
                }`}
              />
            </button>
          ))}
        </div>
        <Arrow direction="next" disabled={active === count - 1} onClick={() => goTo(active + 1)} />
      </div>
    </div>
  );
}

function Arrow({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'prev' ? 'แพ็กเกจก่อนหน้า' : 'แพ็กเกจถัดไป'}
      className="ct-press grid size-11 place-items-center rounded-full border border-line bg-surface text-foreground disabled:opacity-35"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        {direction === 'prev' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
      </svg>
    </button>
  );
}
