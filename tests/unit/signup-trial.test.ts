/**
 * Every signup starts on a trial, whatever plan it picked.
 *
 * Until this, a paid plan went to /onboarding/payment, where "ยืนยันว่าโอนเงินแล้ว"
 * turned the shop on with neither `paid_until` nor `trial_ends_at` set. The
 * expiry cron leaves a tenant with no date alone, so that one button bought
 * the product for ever. Now the shop tries it first and pays through the
 * billing page, which checks the slip.
 */
import { describe, expect, it } from 'vitest';
import { signupTrialDays } from '@/lib/onboarding/create-tenant';
import { entitlementsForPlanCode, entitlementsForTenant } from '@/lib/billing/entitlements';
import { planByCode } from '@/lib/billing/catalog';

describe('signupTrialDays', () => {
  it('uses the chosen plan when it is itself a trial', () => {
    expect(signupTrialDays({ trialDays: 15 }, { trialDays: 30 })).toBe(15);
  });

  it('gives a paid plan the trial plan’s length', () => {
    expect(signupTrialDays({ trialDays: 0 }, { trialDays: 15 })).toBe(15);
  });

  it('falls back to the catalogue when the trial row is missing', () => {
    expect(signupTrialDays({ trialDays: 0 }, undefined)).toBe(planByCode('trial')?.trialDays);
  });

  it('never returns zero, which would leave the shop with no end date', () => {
    expect(signupTrialDays({ trialDays: 0 }, { trialDays: 0 })).toBeGreaterThan(0);
  });
});

describe('entitlementsForTenant', () => {
  const trialEndsAt = new Date('2026-10-09T00:00:00Z');
  const paidUntil = new Date('2026-11-09T00:00:00Z');

  it('treats a Pro shop that has not paid yet as Basic', () => {
    expect(entitlementsForTenant({ code: 'pro', paidUntil: null, trialEndsAt })).toEqual(
      entitlementsForPlanCode('basic'),
    );
  });

  it('gives Pro once the shop has paid, trial date or not', () => {
    expect(entitlementsForTenant({ code: 'pro', paidUntil, trialEndsAt })).toEqual(
      entitlementsForPlanCode('pro'),
    );
  });

  it('leaves a plan sold without dates to its code', () => {
    expect(entitlementsForTenant({ code: 'pro', paidUntil: null, trialEndsAt: null })).toEqual(
      entitlementsForPlanCode('pro'),
    );
  });
});
