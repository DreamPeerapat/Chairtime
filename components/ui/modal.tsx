'use client';

/**
 * The one modal in the app.
 *
 * Five screens had hand-rolled copies of the same overlay markup, which meant
 * five places to get the escape key, the scroll lock or the exit animation
 * wrong — and only one of them had even the escape key.
 *
 * It renders through a portal into <body> for a reason beyond tidiness: a
 * `position: fixed` element is positioned against the nearest ancestor with a
 * transform, not the viewport. Any animated wrapper up the tree therefore
 * drags the modal with it, which is exactly how the Walk-in dialog ended up
 * centred on the page instead of on the screen. Out here nothing can.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** Must outlast the .ct-panel-out animation, or the panel vanishes mid-fade. */
const EXIT_MS = 130;

/**
 * Put this on the heading inside a Modal. A constant rather than useId()
 * because only one modal is ever open at a time in this app, and a stable id
 * is easier to spot in the DOM than a generated one.
 */
export const MODAL_TITLE_ID = 'ct-modal-title';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function Modal({
  children,
  onClose,
  labelledBy,
  className,
}: {
  /**
   * Plain JSX, or a function given the animated `close`. Use the function form
   * for a dialog with its own ปิด/ยกเลิก button, so that button plays the exit
   * animation instead of making the panel disappear on the spot.
   */
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  onClose: () => void;
  /** id of the heading inside, so screen readers announce what this is */
  labelledBy?: string;
  /** extra classes for the panel — width and padding are set here */
  className?: string;
}) {
  const [leaving, setLeaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /** Play the exit, then tell the parent to unmount us. */
  const close = useCallback(() => {
    if (leaving) return; // a second Escape must not queue a second unmount
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setLeaving(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [leaving, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // Stop the page scrolling behind the modal — on a phone the calendar
  // underneath would otherwise move while a finger drags across the sheet.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Focus moves into the dialog so the keyboard lands somewhere sensible.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // A portal needs a DOM to target, and the server render has none. No
  // hydration mismatch to worry about: a modal only ever appears after a
  // click, so it is never part of the markup the server sent.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4',
        leaving ? 'ct-backdrop-out' : 'ct-backdrop-in',
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={(event) => {
        // mousedown, not click: a drag that starts inside the panel and ends
        // on the backdrop (selecting text, say) must not close the dialog.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl outline-none dark:bg-slate-900 sm:rounded-2xl',
          leaving ? 'ct-panel-out' : 'ct-panel-in',
          className,
        )}
      >
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>,
    document.body,
  );
}
