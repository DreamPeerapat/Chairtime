/**
 * The code the shop owner sends to their own OA to claim alerts.
 *
 * Two things can silently break it: a generated code the webhook's pattern
 * does not recognise (the owner sends it and gets the help text back), and an
 * alphabet with characters that are ambiguous on a phone screen.
 */
import { describe, expect, it } from 'vitest';
import { generateLinkCode } from '@/lib/line/owner-link';

/** Kept in step with LINK_CODE in lib/line/webhook.ts. */
const WEBHOOK_PATTERN = /^CT-[A-Z2-9]{6}$/i;

describe('generateLinkCode', () => {
  it('produces something the webhook will recognise', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateLinkCode()).toMatch(WEBHOOK_PATTERN);
    }
  });

  it('never uses characters that are read wrong off a screen', () => {
    const codes = Array.from({ length: 200 }, () => generateLinkCode()).join('');
    // 0/O and 1/I are the pairs people mistype when copying from a laptop to
    // a phone keyboard.
    expect(codes).not.toMatch(/[01OI]/);
  });

  it('does not hand the same code to two shops', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateLinkCode()));
    expect(codes.size).toBe(500);
  });
});
