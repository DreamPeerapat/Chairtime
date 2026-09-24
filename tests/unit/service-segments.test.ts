/**
 * What a shop may save as a service's segments.
 *
 * lib/availability trusts these rows: a service with no active segment would
 * book a chair with no stylist, and one that starts passive would have the
 * chair held before anyone has started the work.
 */
import { describe, expect, it } from 'vitest';
import { segmentsSchema, toSegmentRows } from '@/lib/admin/service-segments';

const active = (durationMin: number) => ({ kind: 'active', durationMin, label: null });
const passive = (durationMin: number) => ({ kind: 'passive', durationMin, label: null });

describe('segmentsSchema', () => {
  it('accepts the colour example from docs/logic.md', () => {
    expect(segmentsSchema.safeParse([active(30), passive(40), active(20)]).success).toBe(true);
  });

  it('accepts a single plain segment', () => {
    expect(segmentsSchema.safeParse([active(60)]).success).toBe(true);
  });

  it.each([
    ['nothing', []],
    ['only waiting', [passive(30)]],
    ['a wait first', [passive(10), active(30)]],
    ['a 3-minute step', [active(3)]],
    ['a half minute', [active(30.5)]],
    ['seven segments', Array.from({ length: 7 }, () => active(10))],
    ['more than twelve hours', [active(600), passive(200)]],
  ])('refuses %s', (_label, rows) => {
    expect(segmentsSchema.safeParse(rows).success).toBe(false);
  });

  it('gives the reason in Thai', () => {
    const result = segmentsSchema.safeParse([passive(30)]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/ช่าง/);
  });

  it('turns an empty label into null', () => {
    const result = segmentsSchema.parse([{ kind: 'active', durationMin: '45', label: '  ' }]);
    expect(result[0]).toEqual({ kind: 'active', durationMin: 45, label: null });
  });
});

describe('toSegmentRows', () => {
  it('numbers the rows from 1 in the order given', () => {
    const rows = toSegmentRows('s1', segmentsSchema.parse([active(30), passive(40), active(20)]));
    expect(rows.map((r) => [r.seq, r.kind, r.durationMin])).toEqual([
      [1, 'active', 30],
      [2, 'passive', 40],
      [3, 'active', 20],
    ]);
  });
});
