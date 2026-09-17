/**
 * The PromptPay payload, field by field.
 *
 * A wrong payload fails in two ways and both are bad: the banking app refuses
 * to scan, or — worse, with a mangled amount — it offers to send a different
 * number and the shop taps through. There is no way to spot either from the
 * code, so the structure is asserted here rather than eyeballed.
 *
 * The expected strings are built from the EMVCo spec by hand, not captured
 * from this implementation, which is the only way a test like this is worth
 * anything.
 */
import { describe, expect, it } from 'vitest';
import { crc16, parseTarget, promptPayFor, promptPayPayload } from '@/lib/billing/promptpay';

describe('crc16', () => {
  it('matches the CCITT-FALSE check value', () => {
    // The standard check: "123456789" under CRC-16/CCITT-FALSE is 0x29B1.
    expect(crc16('123456789')).toBe('29B1');
  });

  it('pads a short result to four digits', () => {
    // Whatever the input, the field is fixed width — a three-digit CRC would
    // shift every byte after it and break the whole payload.
    for (const input of ['A', 'AB', 'ABC', 'hello', '00020101']) {
      expect(crc16(input)).toHaveLength(4);
    }
  });
});

describe('parseTarget', () => {
  it('reads the kind from the shape', () => {
    expect(parseTarget('0812345678')).toEqual({ kind: 'mobile', value: '0812345678' });
    expect(parseTarget('1234567890123')).toEqual({ kind: 'nationalId', value: '1234567890123' });
    expect(parseTarget('123456789012345')).toEqual({ kind: 'eWallet', value: '123456789012345' });
  });

  it('ignores the punctuation people type', () => {
    expect(parseTarget('081-234-5678')).toEqual({ kind: 'mobile', value: '0812345678' });
    expect(parseTarget('0 8 1 2 3 4 5 6 7 8')).toEqual({ kind: 'mobile', value: '0812345678' });
  });

  it('refuses anything else rather than guessing', () => {
    expect(parseTarget('')).toBeNull();
    expect(parseTarget('12345')).toBeNull();
    expect(parseTarget('812345678')).toBeNull(); // 9 digits, no leading zero
    expect(parseTarget('ไม่ใช่เบอร์')).toBeNull();
  });
});

describe('promptPayPayload', () => {
  const mobile = { kind: 'mobile' as const, value: '0812345678' };

  it('builds the fields the spec names, in order', () => {
    const payload = promptPayPayload({ target: mobile, amount: '590.00' });

    expect(payload.startsWith('000201')).toBe(true); // format indicator
    expect(payload).toContain('010212'); // one-time, because it carries an amount
    expect(payload).toContain('0016A000000677010111'); // the PromptPay AID
    expect(payload).toContain('01130066812345678'); // 0 dropped, 0066 prefixed
    expect(payload).toContain('5303764'); // THB
    expect(payload).toContain('5406590.00'); // amount, two decimals
    expect(payload).toContain('5802TH');
  });

  it('closes with a CRC over everything before it, its own header included', () => {
    const payload = promptPayPayload({ target: mobile, amount: '590.00' });
    const body = payload.slice(0, -4);
    const checksum = payload.slice(-4);

    expect(body.endsWith('6304')).toBe(true);
    expect(checksum).toBe(crc16(body));
  });

  it('is reusable when there is no amount', () => {
    const payload = promptPayPayload({ target: mobile });
    expect(payload).toContain('010211');
    expect(payload).not.toContain('5406');
  });

  it('treats a zero amount as no amount', () => {
    // A QR for zero baht is not a request for money, it is a broken one.
    const payload = promptPayPayload({ target: mobile, amount: '0.00' });
    expect(payload).toContain('010211');
    expect(payload).not.toContain('5406');
  });

  it('always writes the amount with two decimals', () => {
    expect(promptPayPayload({ target: mobile, amount: '590' })).toContain('5406590.00');
    expect(promptPayPayload({ target: mobile, amount: '1200.5' })).toContain('54071200.50');
    expect(promptPayPayload({ target: mobile, amount: '12000' })).toContain('540812000.00');
  });

  it('uses tag 02 for a national id and 03 for an e-wallet', () => {
    expect(promptPayPayload({ target: { kind: 'nationalId', value: '1234567890123' } })).toContain(
      '02131234567890123',
    );
    expect(promptPayPayload({ target: { kind: 'eWallet', value: '123456789012345' } })).toContain(
      '0315123456789012345',
    );
  });

  it('declares every length correctly, so the payload parses back', () => {
    // Walk the TLV structure the way a banking app does. Anything with a
    // wrong length runs off the end or lands mid-field.
    const payload = promptPayPayload({ target: mobile, amount: '590.00' });
    const tags: string[] = [];

    let i = 0;
    while (i < payload.length) {
      const tag = payload.slice(i, i + 2);
      const length = Number(payload.slice(i + 2, i + 4));
      expect(Number.isFinite(length)).toBe(true);
      tags.push(tag);
      i += 4 + length;
    }

    expect(i).toBe(payload.length);
    expect(tags).toEqual(['00', '01', '29', '53', '54', '58', '63']);
  });
});

describe('promptPayFor', () => {
  it('returns null rather than a broken QR when the id makes no sense', () => {
    expect(promptPayFor('not a number', '590.00')).toBeNull();
    expect(promptPayFor('', '590.00')).toBeNull();
  });

  it('builds the payload for a usable id', () => {
    expect(promptPayFor('081-234-5678', '590.00')).toBe(
      promptPayPayload({ target: { kind: 'mobile', value: '0812345678' }, amount: '590.00' }),
    );
  });
});
