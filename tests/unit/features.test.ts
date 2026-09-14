/**
 * The loyalty hide-switch.
 *
 * Points keep accruing while the feature is hidden, so the one thing that must
 * not happen is the shop's LINE OA telling a customer about a balance they
 * have no way to see or spend. Five call sites can enqueue such a message
 * (earn, expiry, birthday, tier up, tier at risk); these tests pin the single
 * guard that covers all five, and pin that booking messages still get through.
 */
import { describe, expect, it } from 'vitest';
import { LOYALTY_ENABLED, LOYALTY_TEMPLATES, isLoyaltyTemplate } from '@/lib/features';
import { NOTIFICATION_TEMPLATES, type NotificationTemplate } from '@/lib/notifications/templates';

/** Everything the loyalty code actually asks `enqueue` to send. */
const TEMPLATES_SENT_BY_LOYALTY: NotificationTemplate[] = [
  'points_earned',
  'points_expiring',
  'birthday',
  'tier_up',
  'tier_at_risk',
];

/** Messages about the appointment itself — these must never be suppressed. */
const BOOKING_TEMPLATES: NotificationTemplate[] = [
  'booking_confirmed',
  'booking_cancelled',
  'reminder_24h',
  'reminder_2h',
];

describe('loyalty feature flag', () => {
  it('is off — remove this test when loyalty launches', () => {
    expect(LOYALTY_ENABLED).toBe(false);
  });

  it('classifies every message the loyalty code sends as loyalty', () => {
    for (const template of TEMPLATES_SENT_BY_LOYALTY) {
      expect(isLoyaltyTemplate(template), `${template} would leak`).toBe(true);
    }
  });

  it('leaves booking messages alone', () => {
    for (const template of BOOKING_TEMPLATES) {
      expect(isLoyaltyTemplate(template), `${template} must still send`).toBe(false);
    }
  });

  it('names only templates that exist', () => {
    // A renamed template would otherwise sit in the set doing nothing, and its
    // messages would start going out again unnoticed.
    for (const template of LOYALTY_TEMPLATES) {
      expect(NOTIFICATION_TEMPLATES).toContain(template);
    }
  });

  it('covers every template whose copy mentions points or tiers', () => {
    // The real risk is a template added later that talks about แต้ม and is
    // never added to the set. This is the closest a unit test can get to
    // catching that: the loyalty list must account for all of them.
    const loyaltyish = NOTIFICATION_TEMPLATES.filter(
      (t) => t.startsWith('points_') || t.startsWith('tier_') || t === 'birthday',
    );
    for (const template of loyaltyish) {
      expect(isLoyaltyTemplate(template), `${template} looks like loyalty but is not listed`).toBe(
        true,
      );
    }
  });
});
