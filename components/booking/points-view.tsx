'use client';

/**
 * The LIFF points page's client half. Identity comes from LIFF's own login
 * (`liff.getAccessToken()`), never from a prop or query string — the server
 * route re-verifies that token against LINE before answering, so this
 * component cannot be tricked into showing someone else's balance just by
 * being handed a different tenantSlug.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import liff from '@line/liff';
import { DateTime } from 'luxon';
import { thaiDateFull } from './format';

interface PointsData {
  shopName: string;
  balance: number;
  nextExpiry: { points: number; expiresAt: string } | null;
}

type Status = 'loading' | 'error' | 'ready';

export function PointsView({ tenantSlug, liffId }: { tenantSlug: string; liffId: string | null }) {
  const [status, setStatus] = useState<Status>(liffId ? 'loading' : 'error');
  const [data, setData] = useState<PointsData | null>(null);
  const [message, setMessage] = useState<string | null>(
    liffId ? null : 'ร้านนี้ยังไม่ได้เปิดใช้งานหน้าดูแต้ม',
  );

  useEffect(() => {
    if (!liffId) return;

    let cancelled = false;

    async function run() {
      try {
        // withLoginOnExternalBrowser lets this page also work when opened
        // outside the LINE app (e.g. a plain browser link), not just via a
        // liff.line.me deep link.
        await liff.init({ liffId: liffId!, withLoginOnExternalBrowser: true });
        if (!liff.isLoggedIn()) {
          liff.login(); // full-page redirect; this render never gets further
          return;
        }

        const accessToken = liff.getAccessToken();
        if (!accessToken) throw new Error('no access token');

        const response = await fetch('/api/liff/points', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tenantSlug, accessToken }),
        });
        if (!response.ok) throw new Error(`request failed: ${response.status}`);

        const json = (await response.json()) as PointsData;
        if (!cancelled) {
          setData(json);
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setMessage('โหลดข้อมูลแต้มไม่สำเร็จ กรุณาลองใหม่');
          setStatus('error');
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [liffId, tenantSlug]);

  if (status === 'loading') {
    return <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด...</p>;
  }

  if (status === 'error' || !data) {
    return <p className="py-10 text-center text-sm text-slate-500">{message}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 p-6 text-center dark:border-slate-800">
        <p className="text-xs text-slate-500">{data.shopName}</p>
        <p className="mt-2 text-4xl font-semibold text-teal-700 dark:text-teal-400">{data.balance}</p>
        <p className="text-xs text-slate-500">แต้มคงเหลือ</p>
      </div>

      {data.nextExpiry ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {data.nextExpiry.points} แต้มจะหมดอายุ {thaiDateFull(DateTime.fromISO(data.nextExpiry.expiresAt))}
        </p>
      ) : null}

      <Link
        href={`/${tenantSlug}/rewards`}
        className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-medium dark:border-slate-800"
      >
        แลกแต้มเป็นรางวัล →
      </Link>
    </div>
  );
}
