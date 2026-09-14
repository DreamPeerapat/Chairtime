/**
 * Proof that tests/support/loyalty-enabled.ts actually works.
 *
 * The loyalty integration suites depend on that override to keep asserting
 * their real behaviour while the feature is hidden. If the mock silently
 * stopped applying, those suites would fail in CI with a confusing message
 * about a missing notification rather than about the flag — so the mechanism
 * gets its own test, in the project that can run without a database.
 */
import { describe, expect, it } from 'vitest';
import '../support/loyalty-enabled';
import { LOYALTY_ENABLED, isLoyaltyTemplate } from '@/lib/features';

describe('loyalty-enabled test override', () => {
  it('flips LOYALTY_ENABLED on for the importing file', () => {
    expect(LOYALTY_ENABLED).toBe(true);
  });

  it('leaves the rest of the module intact', () => {
    expect(isLoyaltyTemplate('points_earned')).toBe(true);
    expect(isLoyaltyTemplate('booking_confirmed')).toBe(false);
  });
});
