/**
 * The window each range name means.
 *
 * All of it is calendar arithmetic in the shop's own zone, which is where
 * revenue figures go quietly wrong: a Sunday-evening booking landing in next
 * week's total, or a month that ends at 07:00 because the boundary was taken
 * in UTC.
 */
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { periodFor } from '@/lib/admin/stats';

const ZONE = 'Asia/Bangkok';
const wednesday = DateTime.fromISO('2026-09-16T14:30:00', { zone: ZONE });

describe('periodFor', () => {
  it('runs a week from Monday to Monday', () => {
    const p = periodFor('week', wednesday);
    expect(p.start.toISO()).toBe(DateTime.fromISO('2026-09-14T00:00:00', { zone: ZONE }).toISO());
    expect(p.end.toISO()).toBe(DateTime.fromISO('2026-09-21T00:00:00', { zone: ZONE }).toISO());
  });

  it('keeps a Sunday night inside its own week', () => {
    // The half-open window is what does it: Sunday 23:59 is < next Monday.
    const p = periodFor('week', wednesday);
    const sundayNight = DateTime.fromISO('2026-09-20T23:59:00', { zone: ZONE });
    expect(sundayNight >= p.start && sundayNight < p.end).toBe(true);
  });

  it('starts and ends a month at the shop\'s midnight, not UTC\'s', () => {
    const p = periodFor('month', wednesday);
    expect(p.start.toISO()).toBe(DateTime.fromISO('2026-09-01T00:00:00', { zone: ZONE }).toISO());
    expect(p.end.toISO()).toBe(DateTime.fromISO('2026-10-01T00:00:00', { zone: ZONE }).toISO());
    expect(p.start.offset).toBe(7 * 60); // +07:00, not +00:00
  });

  it('labels a month and a year in the Buddhist era', () => {
    expect(periodFor('month', wednesday).label).toBe('กันยายน 2569');
    expect(periodFor('year', wednesday).label).toBe('ปี 2569');
  });

  it('steps back a whole period at a time', () => {
    expect(periodFor('month', wednesday, -1).label).toBe('สิงหาคม 2569');
    expect(periodFor('year', wednesday, -1).label).toBe('ปี 2568');
    expect(periodFor('week', wednesday, -1).start.toISODate()).toBe('2026-09-07');
  });

  it('steps back across a year boundary without landing on month 0', () => {
    const january = DateTime.fromISO('2026-01-10T09:00:00', { zone: ZONE });
    expect(periodFor('month', january, -1).label).toBe('ธันวาคม 2568');
  });
});
