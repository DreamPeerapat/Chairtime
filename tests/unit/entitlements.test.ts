/**
 * What each plan is allowed to do.
 *
 * The rule worth testing is the one about uncertainty: anything this file does
 * not recognise gets the smaller set. Guessing upwards hands a shop what
 * somebody else is paying for, and the guesses arrive from real places — a
 * trial, a deleted plan row, a code from a catalogue edited later than this.
 */
import { describe, expect, it } from 'vitest';
import { entitlementsForPlanCode } from '@/lib/billing/entitlements';
import { PLANS, planByCode, yearlySavingPercent } from '@/lib/billing/catalog';

describe('entitlementsForPlanCode', () => {
  it('gives Pro the reports and no portfolio cap', () => {
    expect(entitlementsForPlanCode('pro')).toEqual({
      maxPortfolioItems: null,
      reports: true,
      loyalty: true,
    });
  });

  it('caps Basic and keeps the reports out of it', () => {
    const basic = entitlementsForPlanCode('basic');
    expect(basic.maxPortfolioItems).toBe(10);
    expect(basic.reports).toBe(false);
    expect(basic.loyalty).toBe(false);
  });

  it('treats a trial as Basic, not as Pro', () => {
    expect(entitlementsForPlanCode('trial')).toEqual(entitlementsForPlanCode('basic'));
  });

  it.each([null, undefined, '', 'enterprise', 'PRO'])(
    'falls back to Basic for %s rather than guessing upwards',
    (code) => {
      expect(entitlementsForPlanCode(code).reports).toBe(false);
      expect(entitlementsForPlanCode(code).maxPortfolioItems).toBe(10);
    },
  );

  it('takes the portfolio cap from the catalogue, so it moves in one place', () => {
    expect(entitlementsForPlanCode('basic').maxPortfolioItems).toBe(
      planByCode('basic')?.maxPortfolioItems,
    );
  });
});

describe('catalog', () => {
  it('prices a year below twelve months, on every plan that sells one', () => {
    for (const plan of PLANS) {
      if (!plan.priceYearly) continue;
      expect(Number(plan.priceYearly)).toBeLessThan(Number(plan.priceMonthly) * 12);
    }
  });

  it('works the yearly saving out rather than storing it', () => {
    // 499 * 12 = 5,988 against 4,990 — near enough two months free.
    expect(yearlySavingPercent(planByCode('basic')!)).toBe(17);
    expect(yearlySavingPercent(planByCode('pro')!)).toBe(17);
    expect(yearlySavingPercent(planByCode('trial')!)).toBeNull();
  });

  it('has exactly one recommended plan, and one trial', () => {
    expect(PLANS.filter((p) => p.recommended)).toHaveLength(1);
    expect(PLANS.filter((p) => p.trialDays > 0)).toHaveLength(1);
  });
});
