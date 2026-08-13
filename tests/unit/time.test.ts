import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import {
  businessHourToInterval,
  candidateStarts,
  fromTstzRange,
  intersectIntervals,
  mergeIntervals,
  subtractIntervals,
  toTstzRange,
  weekdayOf,
} from '@/lib/time';

const BKK = 'Asia/Bangkok';

function iv(from: string, to: string, zone = BKK) {
  return { start: DateTime.fromISO(from, { zone }), end: DateTime.fromISO(to, { zone }) };
}

describe('businessHourToInterval', () => {
  it('anchors a bare time to a day in the tenant timezone', () => {
    const i = businessHourToInterval('2026-03-16', '10:00:00', '20:00:00', BKK);
    expect(i.start.toUTC().toISO()).toBe('2026-03-16T03:00:00.000Z');
    expect(i.end.toUTC().toISO()).toBe('2026-03-16T13:00:00.000Z');
  });

  it('rolls a closing time past midnight onto the next day', () => {
    const i = businessHourToInterval('2026-03-16', '18:00:00', '02:00:00', BKK);
    expect(i.end.setZone(BKK).toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-17 02:00');
  });

  it('keeps local opening time fixed across a DST change', () => {
    // Europe/London springs forward on 2026-03-29 at 01:00.
    const before = businessHourToInterval('2026-03-28', '09:00:00', '17:00:00', 'Europe/London');
    const after = businessHourToInterval('2026-03-30', '09:00:00', '17:00:00', 'Europe/London');

    expect(before.start.toFormat('HH:mm')).toBe('09:00');
    expect(after.start.toFormat('HH:mm')).toBe('09:00');
    // ...even though the UTC instants differ by an hour
    expect(before.start.toUTC().toFormat('HH:mm')).toBe('09:00');
    expect(after.start.toUTC().toFormat('HH:mm')).toBe('08:00');
  });
});

describe('weekdayOf', () => {
  it('uses 0 = Sunday, matching the business_hour column', () => {
    expect(weekdayOf('2026-03-15', BKK)).toBe(0); // Sunday
    expect(weekdayOf('2026-03-16', BKK)).toBe(1); // Monday
    expect(weekdayOf('2026-03-21', BKK)).toBe(6); // Saturday
  });
});

describe('interval algebra', () => {
  it('merges overlapping and touching intervals', () => {
    const merged = mergeIntervals([
      iv('2026-03-16T10:00', '2026-03-16T12:00'),
      iv('2026-03-16T12:00', '2026-03-16T13:00'),
      iv('2026-03-16T11:00', '2026-03-16T11:30'),
      iv('2026-03-16T15:00', '2026-03-16T16:00'),
    ]);
    expect(merged.map((i) => `${i.start.toFormat('HH:mm')}-${i.end.toFormat('HH:mm')}`)).toEqual([
      '10:00-13:00',
      '15:00-16:00',
    ]);
  });

  it('punches a hole in the middle when subtracting', () => {
    const out = subtractIntervals(
      [iv('2026-03-16T10:00', '2026-03-16T20:00')],
      [iv('2026-03-16T12:00', '2026-03-16T13:00')],
    );
    expect(out.map((i) => `${i.start.toFormat('HH:mm')}-${i.end.toFormat('HH:mm')}`)).toEqual([
      '10:00-12:00',
      '13:00-20:00',
    ]);
  });

  it('drops an interval swallowed whole by a cut', () => {
    const out = subtractIntervals(
      [iv('2026-03-16T10:00', '2026-03-16T11:00')],
      [iv('2026-03-16T09:00', '2026-03-16T12:00')],
    );
    expect(out).toEqual([]);
  });

  it('intersects two sets of windows', () => {
    const out = intersectIntervals(
      [iv('2026-03-16T10:00', '2026-03-16T20:00')],
      [iv('2026-03-16T09:00', '2026-03-16T13:00'), iv('2026-03-16T18:00', '2026-03-16T22:00')],
    );
    expect(out.map((i) => `${i.start.toFormat('HH:mm')}-${i.end.toFormat('HH:mm')}`)).toEqual([
      '10:00-13:00',
      '18:00-20:00',
    ]);
  });
});

describe('candidateStarts', () => {
  it('anchors the grid to local midnight, not to the window start', () => {
    const starts = [...candidateStarts([iv('2026-03-16T10:10', '2026-03-16T11:00')], 15, BKK)];
    expect(starts.map((s) => s.toFormat('HH:mm'))).toEqual(['10:15', '10:30', '10:45']);
  });

  it('never yields the window end itself', () => {
    const starts = [...candidateStarts([iv('2026-03-16T10:00', '2026-03-16T10:30')], 15, BKK)];
    expect(starts.map((s) => s.toFormat('HH:mm'))).toEqual(['10:00', '10:15']);
  });
});

describe('tstzrange bridging', () => {
  it('round-trips an interval through the postgres literal form', () => {
    const original = iv('2026-03-16T10:00', '2026-03-16T11:30');
    const literal = toTstzRange(original);
    expect(literal).toBe('[2026-03-16T03:00:00.000Z,2026-03-16T04:30:00.000Z)');

    const parsed = fromTstzRange('["2026-03-16 03:00:00+00","2026-03-16 04:30:00+00")', BKK);
    expect(parsed.start.toMillis()).toBe(original.start.toMillis());
    expect(parsed.end.toMillis()).toBe(original.end.toMillis());
  });
});
