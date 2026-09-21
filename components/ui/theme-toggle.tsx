'use client';

import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

/**
 * The light/dark switch.
 *
 * Three states, not two: "ตามเครื่อง" is where a shop already is before it
 * touches this, and a two-way switch would silently take that away — a phone
 * that goes dark at sunset should take the booking page with it unless the
 * owner said otherwise. Only an explicit choice is written down.
 *
 * One button that cycles rather than three pills, because this sits in a nav
 * bar that also has to hold a logo, a login link and the trial button at
 * 375px. The label names the state it is in and the state the next press
 * gives, so the cycle is not something you have to discover by pressing.
 *
 * The choice lives in localStorage under THEME_KEY and is applied to
 * <html data-theme> before first paint by the inline script in
 * app/layout.tsx; this component only writes it. Both files have to agree on
 * the key and on the three values.
 */
export const THEME_KEY = 'chairtime-theme';

type Choice = 'light' | 'dark' | 'system';

/* The cycle, written as the map it is: indexing an array for "the one after
   this" makes the compiler ask what happens at the end, and there is no end. */
const NEXT: Record<Choice, Choice> = { system: 'light', light: 'dark', dark: 'system' };

const LABEL: Record<Choice, string> = {
  system: 'ตามเครื่อง',
  light: 'สว่าง',
  dark: 'มืด',
};

const ICON: Record<Choice, React.ReactNode> = {
  system: (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m4.9 19.1 1.4-1.4" />
      <path d="m17.7 6.3 1.4-1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />,
};

/*
 * localStorage as an external store.
 *
 * The obvious shape — useState plus an effect that reads storage — is a
 * setState during render-commit, which the hooks lint rule rejects for good
 * reason: it is a second render pass on every mount. useSyncExternalStore is
 * built for exactly this, and it is what keeps the server's guess ('system',
 * the only honest answer when there is no browser) from being a hydration
 * mismatch: React renders the server snapshot, then swaps in the real one.
 *
 * The listener set exists because the `storage` event fires in *other* tabs,
 * never the one that wrote. Our own writes are announced by hand.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readChoice(): Choice {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private mode, or storage blocked. Falling through to the OS setting is
    // the right answer anyway.
  }
  return 'system';
}

function apply(next: Choice) {
  const root = document.documentElement;
  if (next === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = next;

  try {
    if (next === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // The switch still works for this page; it just will not be remembered.
  }

  for (const listener of listeners) listener();
}

export function ThemeToggle({ className }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, readChoice, () => 'system' as Choice);
  const next = NEXT[choice];

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={`ธีม: ${LABEL[choice]} — กดเพื่อเปลี่ยนเป็น${LABEL[next]}`}
      title={`ธีม: ${LABEL[choice]}`}
      className={cn(
        'ct-press grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-foreground',
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[18px]"
      >
        {ICON[choice]}
      </svg>
    </button>
  );
}
