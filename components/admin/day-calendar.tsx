'use client';

/**
 * The screen a shop lives in — docs/roadmap.md calls it 90% of usage.
 *
 * FullCalendar's resource timeline is a paid plugin, so this uses the free
 * timeGrid and gets the per-person view from a staff filter instead: chips
 * across the top, colour-coded events, and the stylist's name on every chip.
 * Selecting one person narrows the grid to their day.
 *
 * Dragging an event calls rescheduleBooking, which re-plans on the server and
 * still faces the EXCLUDE constraint — the drop is a request, not a decision.
 */
import { useMemo, useRef, useState, useTransition } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import type { EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import type { CalendarBooking, CalendarResource, DayCalendar } from '@/lib/admin/queries';
import { rescheduleBooking } from '@/lib/admin/actions';
import { BookingDrawer } from './booking-drawer';

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#0f766e',
  in_progress: '#2563eb',
  completed: '#64748b',
  cancelled: '#cbd5e1',
  no_show: '#dc2626',
};

// Distinct hues so two stylists never read as the same person at a glance.
const STAFF_COLORS = ['#0f766e', '#7c3aed', '#c2410c', '#0369a1', '#a21caf', '#4d7c0f', '#b91c1c', '#0e7490'];

export function DayCalendar({
  calendar,
  onRefresh,
}: {
  calendar: DayCalendar;
  onRefresh: () => void;
}) {
  const [staffFilter, setStaffFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const calendarRef = useRef<FullCalendar | null>(null);

  const staff = useMemo(() => calendar.resources.filter((r) => r.isHuman), [calendar.resources]);
  const colorOf = useMemo(() => buildColorMap(staff), [staff]);

  const visible = staffFilter
    ? calendar.bookings.filter((b) => b.staffResourceId === staffFilter)
    : calendar.bookings;

  const events: EventInput[] = visible.map((booking) => ({
    id: booking.id,
    title: booking.customerName,
    start: booking.startsAt,
    end: booking.endsAt,
    backgroundColor:
      booking.status === 'cancelled' || booking.status === 'no_show'
        ? STATUS_COLORS[booking.status]
        : (colorOf.get(booking.staffResourceId ?? '') ?? STATUS_COLORS[booking.status]),
    borderColor: STATUS_COLORS[booking.status] ?? '#94a3b8',
    editable: !['completed', 'cancelled', 'no_show'].includes(booking.status),
    extendedProps: { booking },
  }));

  // Shop closures and staff leave, drawn behind the bookings.
  const background: EventInput[] = calendar.timeOff
    .filter((off) => !staffFilter || off.resourceId === staffFilter || off.resourceId === null)
    .map((off, index) => ({
      id: `off-${index}`,
      start: off.start,
      end: off.end,
      display: 'background',
      backgroundColor: '#fecaca',
      title: off.reason ?? 'ปิด',
    }));

  const { slotMin, slotMax } = gridBounds(calendar);

  function handleDrop(info: EventDropArg) {
    const booking = info.event.extendedProps.booking as CalendarBooking;
    const newStart = info.event.start;
    if (!newStart) return;

    setError(null);
    startTransition(async () => {
      const result = await rescheduleBooking({
        bookingId: booking.id,
        startsAt: DateTime.fromJSDate(newStart).setZone(calendar.timezone).toISO(),
        resourceId: booking.staffResourceId ?? undefined,
      });
      if (!result.ok) {
        // The server said no — put the event back where it was.
        info.revert();
        setError(result.error ?? 'เลื่อนคิวไม่สำเร็จ');
      } else {
        onRefresh();
      }
    });
  }

  function handleClick(info: EventClickArg) {
    const booking = info.event.extendedProps.booking as CalendarBooking | undefined;
    if (booking) setSelected(booking);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip active={staffFilter === null} onClick={() => setStaffFilter(null)} label="ทั้งหมด" />
        {staff.map((person) => (
          <FilterChip
            key={person.id}
            active={staffFilter === person.id}
            onClick={() => setStaffFilter(person.id)}
            label={person.name}
            color={colorOf.get(person.id)}
            count={calendar.bookings.filter((b) => b.staffResourceId === person.id).length}
          />
        ))}
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className={cn('chairtime-calendar', pending && 'pointer-events-none opacity-60')}>
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin, luxonPlugin]}
          initialView="timeGridDay"
          initialDate={calendar.date}
          timeZone={calendar.timezone}
          headerToolbar={false}
          allDaySlot={false}
          nowIndicator
          height="auto"
          slotMinTime={slotMin}
          slotMaxTime={slotMax}
          slotDuration="00:15:00"
          slotLabelInterval="01:00"
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          locale="th"
          editable
          eventDurationEditable={false}
          events={[...events, ...background]}
          eventDrop={handleDrop}
          eventClick={handleClick}
          eventContent={(arg) => {
            const booking = arg.event.extendedProps.booking as CalendarBooking | undefined;
            if (!booking) return undefined;
            return (
              <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight">
                <div className="truncate font-medium">{booking.customerName}</div>
                <div className="truncate opacity-90">{booking.services.join(', ')}</div>
                {booking.staffName && !staffFilter ? (
                  <div className="truncate opacity-75">{booking.staffName}</div>
                ) : null}
              </div>
            );
          }}
        />
      </div>

      {selected ? (
        <BookingDrawer
          booking={selected}
          timezone={calendar.timezone}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            onRefresh();
          }}
        />
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string | undefined;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition',
        active
          ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
          : 'border-slate-200 hover:border-slate-400 dark:border-slate-700',
      )}
    >
      {color ? (
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      ) : null}
      {label}
      {typeof count === 'number' ? (
        <span className={active ? 'opacity-70' : 'text-slate-400'}>{count}</span>
      ) : null}
    </button>
  );
}

function buildColorMap(staff: CalendarResource[]): Map<string, string> {
  return new Map(staff.map((person, i) => [person.id, STAFF_COLORS[i % STAFF_COLORS.length]!]));
}

/**
 * Show the shop's opening hours, widened to cover anything booked outside them
 * (an overrunning appointment, or a booking left behind by an hours change).
 */
function gridBounds(calendar: DayCalendar): { slotMin: string; slotMax: string } {
  let min = calendar.openWindows[0]?.start ?? '08:00';
  let max = calendar.openWindows.at(-1)?.end ?? '21:00';

  for (const booking of calendar.bookings) {
    const start = DateTime.fromISO(booking.startsAt).setZone(calendar.timezone).toFormat('HH:mm');
    const end = DateTime.fromISO(booking.endsAt).setZone(calendar.timezone).toFormat('HH:mm');
    if (start < min) min = start;
    if (end > max && end !== '00:00') max = end;
  }

  return {
    slotMin: `${padHour(min, -1)}:00`,
    slotMax: max === '00:00' ? '24:00' : `${padHour(max, 1)}:00`,
  };
}

function padHour(time: string, delta: number): string {
  const hour = Number(time.slice(0, 2));
  const padded = Math.min(23, Math.max(0, hour + delta));
  return String(padded).padStart(2, '0');
}
