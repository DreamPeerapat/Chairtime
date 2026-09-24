/**
 * What a shop may save as a membership tier.
 *
 * lib/loyalty/tier.ts walks tiers highest level first and gives a customer the
 * first one they clear, and lib/loyalty/rules.ts multiplies earned points by
 * the tier's multiplier. So the numbers here are ones those two will act on
 * the next night — a zero or negative multiplier would quietly stop a whole
 * tier earning.
 */
import { describe, expect, it } from 'vitest';
import { tierFormSchema } from '@/lib/loyalty/validation';

const base = {
  name: 'Gold',
  level: '2',
  qualifySpend: '15000',
  qualifyVisits: '8',
  qualifyWindowMonths: '12',
  pointMultiplier: '1.25',
};

describe('tierFormSchema', () => {
  it('accepts a tier like the seeded Gold', () => {
    expect(tierFormSchema.parse(base)).toEqual({
      name: 'Gold',
      level: 2,
      qualifySpend: 15000,
      qualifyVisits: 8,
      qualifyWindowMonths: 12,
      pointMultiplier: 1.25,
    });
  });

  it('accepts an entry tier anyone qualifies for', () => {
    expect(tierFormSchema.safeParse({ ...base, level: '1', qualifySpend: '0', qualifyVisits: '0', pointMultiplier: '1' }).success).toBe(true);
  });

  it.each([
    ['no name', { name: '  ' }],
    ['level 0, which means "no tier"', { level: '0' }],
    ['a fractional level', { level: '1.5' }],
    ['negative spend', { qualifySpend: '-1' }],
    ['spend with fractions of a satang', { qualifySpend: '10.555' }],
    ['a zero-month window', { qualifyWindowMonths: '0' }],
    ['a window over five years', { qualifyWindowMonths: '61' }],
    ['a zero multiplier', { pointMultiplier: '0' }],
    ['a multiplier above 10', { pointMultiplier: '10.5' }],
    ['a multiplier finer than the column holds', { pointMultiplier: '1.255' }],
  ])('refuses %s', (_label, patch) => {
    expect(tierFormSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });

  it('gives its reasons in Thai', () => {
    const result = tierFormSchema.safeParse({ ...base, pointMultiplier: '0' });
    expect(result.error?.issues[0]?.message).toMatch(/[฀-๿]/);
  });
});
