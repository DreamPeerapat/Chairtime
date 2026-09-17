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

/** A 400 with one of the service's own error codes, as its documentation shows. */
function refusing(code: number, message: string) {
  return vi.fn(async () => ({
    ok: false,
    status: code === 1002 ? 401 : 400,
    json: async () => ({ code, message }),
  })) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('slipCheckingEnabled', () => {
  it('needs both the key and the branch it belongs to', () => {
    vi.stubEnv('SLIPOK_API_KEY', '');
    vi.stubEnv('SLIPOK_BRANCH_ID', '');
    expect(slipCheckingEnabled()).toBe(false);

    // A key with no branch addresses nothing and every call comes back 1001.
    vi.stubEnv('SLIPOK_API_KEY', 'k_test');
    expect(slipCheckingEnabled()).toBe(false);

    vi.stubEnv('SLIPOK_BRANCH_ID', '12345');
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

  it('asks the service to check the receiver and the amount too', async () => {
    vi.stubEnv('SLIPOK_API_KEY', 'k_test');
    const fetchImpl = answering({ success: true, data: { amount: 590 } });

    await checkSlip(input, fetchImpl);

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    // Without log the service neither checks whose account was paid nor
    // remembers the slip, and a screenshot could then be spent twice.
    expect(body.log).toBe(true);
    expect(body.amount).toBe(590);
    expect(body.url).toBe(input.slipUrl);
  });
});

/**
 * The service's own refusal codes.
 *
 * The split is whose problem the refusal describes. A slip that is a repeat,
 * for the wrong sum, or paid into somebody else's account is a shop's problem
 * and a definite no. A lapsed package or a bank that is down is ours, and a
 * shop must not lose a month of service over it.
 */
describe('checkSlip refusals', () => {
  const rejected: [number, string][] = [
    [1007, 'รูปภาพไม่มี QR Code'],
    [1008, 'QR ดังกล่าวไม่ใช่ QR สำหรับการตรวจสอบการชำระเงิน'],
    [1011, 'QR Code หมดอายุ หรือ ไม่มีรายการอยู่จริง'],
    [1012, 'สลิปซ้ำ สลิปนี้เคยส่งเข้ามาในระบบเมื่อ 2026-08-17'],
    [1013, 'ยอดที่ส่งมาไม่ตรงกับยอดสลิป'],
    [1014, 'บัญชีผู้รับไม่ตรงกับบัญชีหลักของร้าน'],
  ];

  const unchecked: [number, string][] = [
    [1001, 'ไม่พบข้อมูลสาขา'],
    [1002, 'Authorization Header ไม่ถูกต้อง'],
    [1003, 'Package ของคุณหมดอายุแล้ว'],
    [1004, 'Package ของคุณใช้เกินโควต้า'],
    [1009, 'ข้อมูลธนาคารขัดข้องชั่วคราว'],
    [1010, 'กรุณารอการตรวจสอบสลิปประมาณ 5 นาที'],
  ];

  it.each(rejected)('refuses on %i, and says why in the service\'s own words', async (code, message) => {
    vi.stubEnv('SLIPOK_API_KEY', 'k_test');
    const result = await checkSlip(input, refusing(code, message));

    expect(result.outcome).toBe('rejected');
    expect(result.outcome === 'rejected' && result.reason).toBe(message);
  });

  it.each(unchecked)('leaves %i unchecked, so the shop keeps its month', async (code, message) => {
    vi.stubEnv('SLIPOK_API_KEY', 'k_test');
    const result = await checkSlip(input, refusing(code, message));

    expect(result.outcome).toBe('unchecked');
  });

  it('never lets a repeated slip through as merely unchecked', async () => {
    vi.stubEnv('SLIPOK_API_KEY', 'k_test');
    // The whole reason for paying for this: last month's screenshot must not
    // buy this month.
    const result = await checkSlip(input, refusing(1012, 'สลิปซ้ำ'));
    expect(result.outcome).not.toBe('unchecked');
  });
});
