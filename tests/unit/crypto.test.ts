import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, parseKey, safeEqual } from '@/lib/crypto';

const key = randomBytes(32);

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a LINE channel token', () => {
    const token = 'aBcD1234567890/+chANNelToKEn==';
    expect(decryptSecret(encryptSecret(token, key), key)).toBe(token);
  });

  it('round-trips Thai text and emoji', () => {
    const text = 'ร้านทำเล็บอารีย์ 💅';
    expect(decryptSecret(encryptSecret(text, key), key)).toBe(text);
  });

  it('produces a different ciphertext every time', () => {
    const a = encryptSecret('same', key);
    const b = encryptSecret('same', key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe(decryptSecret(b, key));
  });

  it('never leaks the plaintext into the stored value', () => {
    const payload = encryptSecret('super-secret-token', key);
    expect(payload).not.toContain('super-secret-token');
    expect(payload.startsWith('v1.')).toBe(true);
  });

  it('refuses a ciphertext that has been tampered with', () => {
    const payload = encryptSecret('original', key);
    const parts = payload.split('.');
    const flipped = Buffer.from(parts[3]!, 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], flipped.toString('base64url')].join('.');

    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it('refuses the wrong key', () => {
    const payload = encryptSecret('original', key);
    expect(() => decryptSecret(payload, randomBytes(32))).toThrow();
  });

  it('refuses an unknown payload format', () => {
    expect(() => decryptSecret('not-a-payload', key)).toThrow(/unrecognised/i);
    expect(() => decryptSecret('v2.a.b.c', key)).toThrow(/unrecognised/i);
  });
});

describe('parseKey', () => {
  it('accepts both base64 and hex', () => {
    const raw = randomBytes(32);
    expect(parseKey(raw.toString('base64')).equals(raw)).toBe(true);
    expect(parseKey(raw.toString('hex')).equals(raw)).toBe(true);
  });

  it('rejects a key of the wrong length', () => {
    expect(() => parseKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});

describe('safeEqual', () => {
  it('compares without leaking length through early exit', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
