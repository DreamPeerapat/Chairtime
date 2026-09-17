/**
 * The QR encoder.
 *
 * Structure is checked here — the parts a scanner looks for before it reads
 * anything, and the error correction against the worked example in the
 * standard. That a real phone reads the result was confirmed separately by
 * decoding the generated symbol; the fingerprint at the bottom is what keeps
 * that true after an edit to this file's neighbours.
 */
import { describe, expect, it } from 'vitest';
import { encodeQr, qrSvg, reedSolomon } from '@/lib/billing/qr';
import { promptPayFor } from '@/lib/billing/promptpay';

describe('reedSolomon', () => {
  it('matches the worked example in ISO/IEC 18004', () => {
    // "01234567" as a version 1-M symbol: the data codewords, then the ten
    // error correction codewords the standard prints for them.
    const data = [
      0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec,
      0x11,
    ];

    expect(reedSolomon(data, 10)).toEqual([
      0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55,
    ]);
  });

  it('returns as many codewords as asked for, whatever the data', () => {
    expect(reedSolomon([1, 2, 3], 26)).toHaveLength(26);
    expect(reedSolomon([0, 0, 0, 0], 18)).toHaveLength(18);
  });
});

describe('encodeQr', () => {
  const at = (modules: boolean[][], x: number, y: number): boolean => modules[y]?.[x] ?? false;

  const finderAt = (modules: boolean[][], x0: number, y0: number): boolean[][] =>
    Array.from({ length: 7 }, (_, dy) =>
      Array.from({ length: 7 }, (_, dx) => at(modules, x0 + dx, y0 + dy)),
    );

  const FINDER = [
    [true, true, true, true, true, true, true],
    [true, false, false, false, false, false, true],
    [true, false, true, true, true, false, true],
    [true, false, true, true, true, false, true],
    [true, false, true, true, true, false, true],
    [true, false, false, false, false, false, true],
    [true, true, true, true, true, true, true],
  ];

  it('grows a version at a time as the payload does', () => {
    expect(encodeQr('hello').version).toBe(1);
    expect(encodeQr('x'.repeat(30)).version).toBe(3);
    // A PromptPay payload with an amount is around eighty bytes.
    expect(encodeQr('x'.repeat(80)).version).toBe(5);
    expect(encodeQr('x'.repeat(213)).version).toBe(10);
  });

  it('sizes the grid at four modules per version plus seventeen', () => {
    const code = encodeQr('hello');
    expect(code.size).toBe(21);
    expect(code.modules).toHaveLength(21);
    expect(code.modules.every((row) => row.length === 21)).toBe(true);
  });

  it('puts a finder pattern in three corners and not the fourth', () => {
    const { modules, size } = encodeQr('hello');
    expect(finderAt(modules, 0, 0)).toEqual(FINDER);
    expect(finderAt(modules, size - 7, 0)).toEqual(FINDER);
    expect(finderAt(modules, 0, size - 7)).toEqual(FINDER);
    expect(finderAt(modules, size - 7, size - 7)).not.toEqual(FINDER);
  });

  it('alternates the timing patterns and fixes the dark module', () => {
    const { modules, size } = encodeQr('hello');
    for (let i = 8; i < size - 8; i += 1) {
      expect(at(modules, i, 6)).toBe(i % 2 === 0);
      expect(at(modules, 6, i)).toBe(i % 2 === 0);
    }
    expect(at(modules, 8, size - 8)).toBe(true);
  });

  it('refuses a payload longer than it can encode', () => {
    expect(() => encodeQr('x'.repeat(300))).toThrow(/too long/);
  });

  /**
   * A fingerprint of the exact symbol for one payload. It is not meaningful on
   * its own — its job is to fail loudly if masking, interleaving or placement
   * ever shifts, because every one of those changes still produces a
   * plausible-looking square of dots that no phone can read.
   */
  it('produces a stable symbol for a known PromptPay payload', () => {
    const payload = promptPayFor('0906749156', '590.00')!;
    const code = encodeQr(payload);
    const dark = code.modules.flat().filter(Boolean).length;

    expect(code.version).toBe(5);
    expect(code.size).toBe(37);
    expect(dark).toBe(FINGERPRINT_DARK_MODULES);
    expect(rowSignature(code.modules)).toBe(FINGERPRINT_ROWS);
  });
});

describe('qrSvg', () => {
  it('draws on white with a quiet zone, at the width asked for', () => {
    const svg = qrSvg('hello', { width: 200, margin: 4 });
    expect(svg).toContain('width="200"');
    // 21 modules plus four either side.
    expect(svg).toContain('viewBox="0 0 29 29"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
  });

  it('never inverts for dark mode', () => {
    // A light-on-dark QR is unreadable to a good number of phone cameras, and
    // this one is scanned to send money. currentColor must not appear here.
    expect(qrSvg('hello')).not.toContain('currentColor');
  });
});

/** One hex digit per row: the count of dark modules in it. */
function rowSignature(modules: boolean[][]): string {
  return modules.map((row) => row.filter(Boolean).length.toString(16).padStart(2, '0')).join('');
}

const FINGERPRINT_DARK_MODULES = 715;
const FINGERPRINT_ROWS =
  '190d14171410190a1513141512131114141311161514111812150d141a0e17131515110a19';
