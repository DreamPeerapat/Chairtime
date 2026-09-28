/**
 * Turning a day's bookings and time off into what FullCalendar draws.
 *
 * Kept apart from the component so the colouring and grid-bounds rules can be
 * read without wading through calendar props.
 */
import type { EventInput } from '@fullcalendar/core';
import { DateTime } from 'luxon';
import type { CalendarBooking, CalendarResource, DayCalendar } from '@/lib/admin/queries';

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

export function buildColorMap(staff: CalendarResource[]): Map<string, string> {
  return new Map(staff.map((person, i) => [person.id, STAFF_COLORS[i % STAFF_COLORS.length]!]));
}

export function bookingEvents(
  visible: CalendarBooking[],
  colorOf: Map<string, string>,
): EventInput[] {
  return visible.map((booking) => ({
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
}

// Shop closures and staff leave, drawn behind the bookings.
export function timeOffEvents(calendar: DayCalendar, staffFilter: string | null): EventInput[] {
  return calendar.timeOff
    .filter((off) => !staffFilter || off.resourceId === staffFilter || off.resourceId === null)
    .map((off, index) => ({
      id: `off-${index}`,
      start: off.start,
      end: off.end,
      display: 'background',
      backgroundColor: '#fecaca',
      title: off.reason ?? 'ปิด',
    }));
}

/**
 * Show the shop's opening hours, widened to cover anything booked outside them
 * (an overrunning appointment, or a booking left behind by an hours change).
 */
export function gridBounds(calendar: DayCalendar): { slotMin: string; slotMax: string } {
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
