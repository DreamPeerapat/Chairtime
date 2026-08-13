'use client';

import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { useState } from 'react';
import type { DayCalendar, DayStats } from '@/lib/admin/queries';
import { formatBaht } from '@/components/booking/format';
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
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800"
          >
            ‹
          </button>
          <div>
            <h1 className="text-lg font-semibold">
              {day.setLocale('th').toFormat('cccc d LLLL')}
              {isToday ? <span className="ml-2 text-xs text-teal-700">วันนี้</span> : null}
            </h1>
            <p className="text-xs text-slate-500">{shopName}</p>
          </div>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="วันถัดไป"
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800"
          >
            ›
          </button>
          {!isToday ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-800"
            >
              วันนี้
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setWalkInOpen(true)}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white"
        >
          + Walk-in
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="คิววันนี้" value={String(stats.total)} />
        <Stat label="รอมา" value={String(stats.upcoming)} />
        <Stat label="เสร็จแล้ว" value={String(stats.completed)} />
        <Stat label="ไม่มา" value={String(stats.noShow)} tone={stats.noShow > 0 ? 'warn' : undefined} />
        <Stat label="ยอดวันนี้" value={formatBaht(stats.revenue)} />
      </dl>

      {calendar.openWindows.length === 0 ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd
        className={`text-lg font-semibold tabular-nums ${tone === 'warn' ? 'text-red-600' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}
