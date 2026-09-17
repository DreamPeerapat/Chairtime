/**
 * What the slip checker does with each answer it can get.
 *
 * The rule that matters: a verification service being unreachable must never
 * stop a shop paying. "Unchecked" leaves the payment exactly where it sat
 * before any of this existed — extended, and waiting for a human to reconcile
 * it — while "rejected" is a real answer that the transfer did not happen.
 * Collapsing the two would either lock out paying shops when an API is down,
 * or wave through slips nobody read.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { checkSlip, slipCheckingEnabled } from '@/lib/billing/slip';

const claimedAt = DateTime.fromISO('2026-09-17T10:00:00', { zone: 'Asia/Bangkok' });
const input = { slipUrl: 'https://blob.example/slip.webp', expectedAmount: '590.00', claimedAt };

function answering(body: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 502,
    json: async () => body,
  })) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('slipCheckingEnabled', () => {
  it('is off until a key is configured', () => {
    vi.stubEnv('SLIPOK_API_KEY', '');
    expect(slipCheckingEnabled()).toBe(false);
    vi.stubEnv('SLIPOK_API_KEY', 'k_test');
    expect(slipCheckingEnabled()).toBe(true);
  });
});

describe('checkSlip', () => {
  it('does not call out at all without a key', async () => {
    vi.stubEnv('SLIPOK_API_KEY', '');
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const result = await checkSlip(input, fetchImpl);

    expect(result.outcome).toBe('unchecked');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('verifies a slip whose amount matches', async () => {
    vi.stubEnv('SLIPOK_API_KEY', 'k_test');
    const result = await checkSlip(
      input,
      answering({
        success: true,
        data: { amount: 590, transRef: 'TR123', transTimestamp: '2026-09-17T09:12:00+07:00' },
      }),
    );

    expect(result).toEqual({
      outcome: 'verified',
      amount: '590.00',
      reference: 'TR123',
      transferredAt: '2026-09-17T09:12:00+07:00',
    });
  });

  it('rejects a slip for the wrong amount', async () => {
    vi.stubEnv('SLIPOK_API_KEY', 'k_test');
    const result = await checkSlip(input, answering({ success: true, data: { amount: 100 } }));

    expect(result.outcome).toBe('rejected');
    expect(result.outcome === 'rejected' && result.reason).toContain('ไม่ตรง');
  });

  it('compares money in satang, not as floats', async () => {
    vi.stubEnv('SLIPOK_API_KEY', 'k_test');
    // 590 and "590.00" are the same money written two ways, and a naive
    // comparison of the strings or of the floats gets one of them wrong.
    for (const amount of [590, '590', '590.00', 590.0]) {
      const result = await checkSlip(input, answering({ success: true, data: { amount } }));
      expect(result.outcome, `${amount} should match`).toBe('verified');
    }
  });

  it('treats an unreachable service as unchecked, never as rejected', async () => {
    vi.stubEnv('SLIPOK_API_KEY', 'k_test');
    const throwing = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    expect((await checkSlip(input, throwing)).outcome).toBe('unchecked');
    expect((await checkSlip(input, answering({}, false))).outcome).toBe('unchecked');
  });

  it('treats an unreadable slip as rejected, because that is an answer', async () => {
    vi.stubEnv('SLIPOK_API_KEY', 'k_test');
    const result = await checkSlip(input, answering({ success: false, message: 'ไม่พบรายการนี้' }));

    expect(result).toEqual({ outcome: 'rejected', reason: 'ไม่พบรายการนี้' });
  });
});
