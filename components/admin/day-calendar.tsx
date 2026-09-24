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
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import type { EventClickArg, EventDropArg } from '@fullcalendar/core';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import type { CalendarBooking, DayCalendar } from '@/lib/admin/queries';
import { rescheduleBooking } from '@/lib/admin/actions';
import { BookingDrawer } from './booking-drawer';
import { FilterChip } from './calendar-filter-chip';
import { bookingEvents, buildColorMap, gridBounds, timeOffEvents } from './day-calendar-events';

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

  /**
   * Move the grid when the day changes.
   *
   * `initialDate` is read once, at mount, and never again — which is why
   * stepping to tomorrow left the grid sitting on today. The new day's events
   * did arrive as props, but they fell outside the range being drawn, so the
   * calendar looked empty until a full page reload remounted the component
   * with a fresh `initialDate`. That reload was the workaround staff had
   * found; this is the fix.
   */
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (DateTime.fromJSDate(api.getDate()).toISODate() !== calendar.date) {
      api.gotoDate(calendar.date);
    }
  }, [calendar.date]);

  const staff = useMemo(() => calendar.resources.filter((r) => r.isHuman), [calendar.resources]);
  const colorOf = useMemo(() => buildColorMap(staff), [staff]);

  // A cancelled booking is free time, and drawing it as a grey block makes the
  // day look fuller than it is — staff read the calendar to answer "can I fit
  // someone in at three". The row is not lost: it is in the summary page,
  // where a cancellation is worth counting rather than worth stepping around.
  const live = calendar.bookings.filter((b) => b.status !== 'cancelled');

  const visible = staffFilter
    ? live.filter((b) => b.staffResourceId === staffFilter)
    : live;

  const events = bookingEvents(visible, colorOf);
  const background = timeOffEvents(calendar, staffFilter);

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
          /**
           * FullCalendar stacks concurrent events on top of each other by
           * default, so a booking that starts later covers the one underneath.
           * With one column for every member of staff that happens constantly,
           * and the covered booking cannot be clicked at all — not by the
           * e2e test, and not by whoever is standing at the counter.
           * Laying them out side by side keeps every booking reachable.
           */
          slotEventOverlap={false}
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
