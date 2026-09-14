/**
 * The LIFF id format.
 *
 * A wrong id fails in the worst possible way: the wizard saves it, the shop
 * sees a green tick, and the OA hands out a link that opens a LINE error page.
 * Nobody notices until a customer complains. So the format is checked before
 * it is stored.
 */
import { describe, expect, it } from 'vitest';

/** Mirrors liffIdSchema in app/(admin)/dashboard/settings/line/page.tsx. */
const LIFF_ID = /^\d{10}-[0-9a-zA-Z]+$/;

describe('LIFF id', () => {
  it('accepts the shape LINE issues', () => {
    expect(LIFF_ID.test('1234567890-abcdefgh')).toBe(true);
    expect(LIFF_ID.test('2006543210-AbC12xyz')).toBe(true);
  });

  it('rejects a whole LIFF URL pasted in by mistake', () => {
    // The likeliest wrong paste: the console shows this right beside the id.
    expect(LIFF_ID.test('https://liff.line.me/1234567890-abcdefgh')).toBe(false);
  });

  it('rejects a channel id with no LIFF suffix', () => {
    expect(LIFF_ID.test('1234567890')).toBe(false);
  });

  it('rejects the wrong number of leading digits', () => {
    expect(LIFF_ID.test('123456789-abcdefgh')).toBe(false);
    expect(LIFF_ID.test('12345678901-abcdefgh')).toBe(false);
  });

  it('rejects empty and whitespace', () => {
    expect(LIFF_ID.test('')).toBe(false);
    expect(LIFF_ID.test('  ')).toBe(false);
  });
});
