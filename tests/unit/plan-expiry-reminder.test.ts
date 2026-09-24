/**
 * Warning a shop before its plan runs out.
 *
 * Until this a shop found out when it opened the billing page, or when it
 * could no longer take bookings — which for a salon is a customer on the
 * phone. Two messages: a week ahead, and the day before.
 */
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import {
  planReminderDedupeKey,
  planReminderSendAt,
  planReminderStage,
} from '@/lib/billing/expiry-reminder';
import { planExpiringMessage } from '@/lib/line/messages';

describe('planReminderStage', () => {
  it.each([
    [8, null],
    [7, '7d'],
    [3, '7d'],
    [2, '7d'],
    [1, '1d'],
    [0, '1d'],
    [-1, null],
  ] as const)('%s days left → %s', (daysLeft, stage) => {
    expect(planReminderStage(daysLeft)).toBe(stage);
  });

  it('says nothing for a plan with no end', () => {
    expect(planReminderStage(null)).toBeNull();
  });
});

describe('planReminderDedupeKey', () => {
  const end = DateTime.fromISO('2026-10-01T16:59:59Z');

  it('is one message per stage per period', () => {
    expect(planReminderDedupeKey('t1', end, '7d')).toBe(planReminderDedupeKey('t1', end, '7d'));
    expect(planReminderDedupeKey('t1', end, '7d')).not.toBe(planReminderDedupeKey('t1', end, '1d'));
  });

  it('starts over once the shop renews and the end moves', () => {
    expect(planReminderDedupeKey('t1', end, '7d')).not.toBe(
      planReminderDedupeKey('t1', end.plus({ months: 1 }), '7d'),
    );
  });
});

describe('planReminderSendAt', () => {
  const zone = 'Asia/Bangkok';

  it('holds a run in the small hours until nine in the morning', () => {
    const now = DateTime.fromISO('2026-09-24T01:00', { zone });
    expect(planReminderSendAt(now, zone).toISO()).toBe(
      DateTime.fromISO('2026-09-24T09:00', { zone }).toISO(),
    );
  });

  it('sends straight away during the day', () => {
    const now = DateTime.fromISO('2026-09-24T14:30', { zone });
    expect(planReminderSendAt(now, zone).toMillis()).toBe(now.toMillis());
  });

  it('holds a late-night run until the next morning', () => {
    const now = DateTime.fromISO('2026-09-24T22:00', { zone });
    expect(planReminderSendAt(now, zone).toISO()).toBe(
      DateTime.fromISO('2026-09-25T09:00', { zone }).toISO(),
    );
  });
});

describe('planExpiringMessage', () => {
  const periodEnd = DateTime.fromISO('2026-10-01T23:59', { zone: 'Asia/Bangkok' });

  it('names the days left and links to the billing page', () => {
    const msg = planExpiringMessage({
      shopName: 'The Hair',
      periodEnd,
      daysLeft: 7,
      onTrial: false,
      billingUrl: 'https://example.com/dashboard/billing',
    });
    expect(msg.altText).toContain('7 วัน');
    expect(JSON.stringify(msg)).toContain('https://example.com/dashboard/billing');
  });

  it('says "today" rather than "0 days"', () => {
    const msg = planExpiringMessage({
      shopName: 'The Hair',
      periodEnd,
      daysLeft: 0,
      onTrial: true,
      billingUrl: null,
    });
    expect(msg.altText).toContain('วันนี้');
    expect(msg.altText).toContain('ทดลองใช้');
  });
});
