'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * How long the QR has left.
 *
 * Client-side because it ticks, but it is not the authority on anything: the
 * server decides whether an intent has expired, and reaching zero here only
 * asks the page to reload and be told. A clock that is a minute fast on a
 * shop's phone must not be able to close a window the server still considers
 * open — or the other way round.
 */
export function PaymentCountdown({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(() => secondsLeft(expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      const left = secondsLeft(expiresAt);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(timer);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, router]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="flex items-end justify-center gap-6">
      <Unit value={minutes} label="นาที" />
      <Unit value={seconds} label="วินาที" />
    </div>
  );
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-semibold tabular-nums">{String(value).padStart(2, '0')}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}
