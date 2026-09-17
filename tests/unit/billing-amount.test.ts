/**
 * The bill.
 *
 * Small arithmetic, but it is money and it feeds a QR code: a figure a
 * hundredth of a baht out is a transfer the slip check then refuses.
 */
import { describe, expect, it } from 'vitest';
import { formatBaht, fromSatang, toSatang, totalForMonths } from '@/lib/billing/amount';

describe('totalForMonths', () => {
  it('multiplies in satang, so no float creeps into the figure', () => {
    // 590 * 3 in floating point baht is 1770.0000000000002.
    expect(totalForMonths('590.00', 3)).toBe('1770.00');
    expect(totalForMonths('1200.00', 12)).toBe('14400.00');
    expect(totalForMonths('0.10', 3)).toBe('0.30');
  });

  it('keeps two decimals whatever the price looks like', () => {
    expect(totalForMonths('590', 1)).toBe('590.00');
    expect(totalForMonths('99.9', 2)).toBe('199.80');
  });

  it('gives nothing back for a month count no plan is sold in', () => {
    expect(totalForMonths('590.00', 0)).toBe('');
    expect(totalForMonths('590.00', 1.5)).toBe('');
    expect(totalForMonths('ไม่ใช่ตัวเลข', 1)).toBe('');
  });
});

describe('satang', () => {
  it('rounds to the nearest satang and back', () => {
    expect(toSatang('590.00')).toBe(59000);
    expect(toSatang('0.005')).toBe(1);
    expect(fromSatang(59000)).toBe('590.00');
  });
});

describe('formatBaht', () => {
  it('groups thousands and drops the trailing zeros', () => {
    expect(formatBaht('14400.00')).toBe('14,400 บาท');
    expect(formatBaht('590.50')).toBe('590.5 บาท');
  });

  it('shows whatever it was given rather than NaN', () => {
    expect(formatBaht('—')).toBe('— บาท');
  });
});
