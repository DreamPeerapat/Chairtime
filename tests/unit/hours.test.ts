import { describe, expect, it } from 'vitest';
import {
  MAX_RANGES_PER_DAY,
  groupByWeekday,
  toRows,
  validateHourRows,
  type HourRow,
} from '@/lib/admin/hours';

const MONDAY = 1;
const TUESDAY = 2;

describe('groupByWeekday', () => {
  it('keeps every range of a day rather than the first one', () => {
    // The salon that closes over lunch — the case the old editor silently ate.
    const rows: HourRow[] = [
      { weekday: MONDAY, openTime: '10:00:00', closeTime: '13:00:00' },
      { weekday: MONDAY, openTime: '14:00:00', closeTime: '20:00:00' },
    ];

    const monday = groupByWeekday(rows)[MONDAY]!;

    expect(monday.open).toBe(true);
    expect(monday.ranges).toEqual([
      { openTime: '10:00', closeTime: '13:00' },
      { openTime: '14:00', closeTime: '20:00' },
    ]);
  });

  it('returns all seven days, with the ones that have no rows closed', () => {
    const days = groupByWeekday([{ weekday: MONDAY, openTime: '09:00:00', closeTime: '18:00:00' }]);

    expect(days).toHaveLength(7);
    expect(days[MONDAY]!.open).toBe(true);
    expect(days.filter((day) => day.open)).toHaveLength(1);
    // A closed day still carries a range so the inputs are not blank when ticked.
    expect(days[TUESDAY]!.ranges).toHaveLength(1);
  });

  it('sorts the ranges of a day by opening time', () => {
    const days = groupByWeekday([
      { weekday: MONDAY, openTime: '14:00:00', closeTime: '20:00:00' },
      { weekday: MONDAY, openTime: '10:00:00', closeTime: '13:00:00' },
    ]);

    expect(days[MONDAY]!.ranges.map((r) => r.openTime)).toEqual(['10:00', '14:00']);
  });
});

describe('toRows', () => {
  it('drops closed days and flattens the rest', () => {
    const days = groupByWeekday([
      { weekday: MONDAY, openTime: '10:00:00', closeTime: '13:00:00' },
      { weekday: MONDAY, openTime: '14:00:00', closeTime: '20:00:00' },
    ]);

    expect(toRows(days)).toEqual([
      { weekday: MONDAY, openTime: '10:00', closeTime: '13:00' },
      { weekday: MONDAY, openTime: '14:00', closeTime: '20:00' },
    ]);
  });

  it('survives a round trip through the editor shape', () => {
    const rows: HourRow[] = [
      { weekday: MONDAY, openTime: '10:00:00', closeTime: '13:00:00' },
      { weekday: MONDAY, openTime: '14:00:00', closeTime: '20:00:00' },
      { weekday: TUESDAY, openTime: '09:00:00', closeTime: '21:00:00' },
    ];

    expect(toRows(groupByWeekday(rows))).toHaveLength(rows.length);
  });
});

describe('validateHourRows', () => {
  it('accepts a lunch break', () => {
    expect(
      validateHourRows([
        { weekday: MONDAY, openTime: '10:00', closeTime: '13:00' },
        { weekday: MONDAY, openTime: '14:00', closeTime: '20:00' },
      ]),
    ).toBeNull();
  });

  it('accepts two ranges that touch exactly', () => {
    expect(
      validateHourRows([
        { weekday: MONDAY, openTime: '10:00', closeTime: '13:00' },
        { weekday: MONDAY, openTime: '13:00', closeTime: '20:00' },
      ]),
    ).toBeNull();
  });

  it('rejects a close that is not after the open', () => {
    expect(validateHourRows([{ weekday: MONDAY, openTime: '18:00', closeTime: '09:00' }])).toMatch(
      /เวลาปิดต้องหลังเวลาเปิด/,
    );
  });

  it('rejects two ranges that overlap on the same day', () => {
    // The database CHECK only sees one row at a time, so nothing else catches this.
    expect(
      validateHourRows([
        { weekday: MONDAY, openTime: '10:00', closeTime: '15:00' },
        { weekday: MONDAY, openTime: '14:00', closeTime: '20:00' },
      ]),
    ).toMatch(/ทับกัน/);
  });

  it('allows the same times on different days', () => {
    expect(
      validateHourRows([
        { weekday: MONDAY, openTime: '10:00', closeTime: '20:00' },
        { weekday: TUESDAY, openTime: '10:00', closeTime: '20:00' },
      ]),
    ).toBeNull();
  });

  it('refuses more ranges in a day than the editor allows', () => {
    const rows: HourRow[] = Array.from({ length: MAX_RANGES_PER_DAY + 1 }, (_, index) => ({
      weekday: MONDAY,
      openTime: `${String(8 + index * 3).padStart(2, '0')}:00`,
      closeTime: `${String(9 + index * 3).padStart(2, '0')}:00`,
    }));

    expect(validateHourRows(rows)).toMatch(/ไม่เกิน/);
  });
});
