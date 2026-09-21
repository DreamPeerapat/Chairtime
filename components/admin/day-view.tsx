'use client';

import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { useState } from 'react';
import type { DayCalendar, DayStats } from '@/lib/admin/queries';
import { formatBaht, thaiDateFull } from '@/components/booking/format';
import { DayCalendar as CalendarGrid } from './day-calendar';
import { WalkInForm } from './walk-in-form';

export function DayView({
  calendar,
  stats,
  services,
  shopName,
}: {
  calendar: DayCalendar;
  stats: DayStats;
  services: Array<{ id: string; name: string }>;
  shopName: string;
}) {
  const router = useRouter();
  const [walkInOpen, setWalkInOpen] = useState(false);

  const day = DateTime.fromISO(calendar.date, { zone: calendar.timezone });
  const isToday = day.hasSame(DateTime.now().setZone(calendar.timezone), 'day');

  const move = (delta: number) => {
    const next = day.plus({ days: delta }).toISODate()!;
    router.push(`/dashboard?date=${next}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="วันก่อนหน้า"
            className="ct-press grid size-11 place-items-center rounded-xl border border-line bg-surface text-base hover:bg-surface-muted"
          >
            ‹
          </button>
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">
              {thaiDateFull(day)}
              {isToday ? <span className="ml-2 align-middle text-xs text-brand">วันนี้</span> : null}
            </h1>
            <p className="mt-0.5 text-xs text-muted">{shopName}</p>
          </div>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="วันถัดไป"
            className="ct-press grid size-11 place-items-center rounded-xl border border-line bg-surface text-base hover:bg-surface-muted"
          >
            ›
          </button>
          {!isToday ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="ct-press h-11 rounded-xl border border-line bg-surface px-4 text-xs hover:bg-surface-muted"
            >
              วันนี้
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setWalkInOpen(true)}
          className="ct-press h-11 rounded-xl bg-brand px-5 text-sm font-medium text-brand-contrast hover:bg-brand-strong"
        >
          + Walk-in
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="คิววันนี้" value={String(stats.total)} />
        <Stat label="รอมา" value={String(stats.upcoming)} />
        <Stat label="เสร็จแล้ว" value={String(stats.completed)} />
        <Stat label="ไม่มา" value={String(stats.noShow)} tone={stats.noShow > 0 ? 'warn' : undefined} />
        <Stat label="ยอดวันนี้" value={formatBaht(stats.revenue)} />
      </dl>

      {calendar.openWindows.length === 0 ? (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted">
          วันนี้ร้านปิด
        </p>
      ) : null}

      <CalendarGrid calendar={calendar} onRefresh={() => router.refresh()} />

      {walkInOpen ? (
        <WalkInForm
          calendar={calendar}
          services={services}
          onClose={() => setWalkInOpen(false)}
          onCreated={() => {
            setWalkInOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * `tabular-nums` gives every glyph a digit's advance width — including the ฿
 * sign, which is wider and ends up overlapping the first digit. So the tabular
 * figures go on the digits only.
 */
function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  const currency = value.startsWith('฿');
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`mt-1.5 font-display text-2xl leading-none font-semibold ${
          tone === 'warn' ? 'text-red-600' : ''
        }`}
      >
        {currency ? (
          <>
            <span className="mr-0.5">฿</span>
            <span className="tabular-nums">{value.slice(1)}</span>
          </>
        ) : (
          <span className="tabular-nums">{value}</span>
        )}
      </dd>
    </div>
  );
}
