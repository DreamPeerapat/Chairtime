'use client';

import { useState } from 'react';

/**
 * A value the shop is meant to send to someone, with the button that sends it.
 *
 * The booking link used to be a `<code>` with `select-all` on it: correct,
 * and useless on the phone this shop is actually holding, where selecting
 * text means a long-press and a pair of drag handles. A button is one tap.
 *
 * The clipboard API needs a secure context and permission, and it rejects
 * rather than throws; the text stays selectable so there is still a way
 * through when it refuses.
 */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Blocked, or an insecure origin. The value is on screen and selectable.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-xl bg-surface-muted px-3 py-3 text-sm select-all">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={`คัดลอก${label}`}
        className="ct-press inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-muted"
      >
        {copied ? (
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 text-brand"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h8" />
          </svg>
        )}
        {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
      </button>
    </div>
  );
}
