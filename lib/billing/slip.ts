/**
 * Checking that a transfer actually happened.
 *
 * Today a shop presses "แจ้งชำระเงิน" and the period extends on trust — the
 * row lands as `pending_review` and somebody reconciles it against the bank
 * statement later. That is the hole: nothing stops a shop pressing it without
 * transferring anything.
 *
 * A slip verification service closes it. The shop uploads the slip image, the
 * service reads the QR inside it and asks the bank whether that transaction
 * exists, for how much, and to whom. What comes back is a fact, not a claim.
 *
 * Written as an interface with a null implementation so the feature ships
 * before the account does: with no API key configured every payment behaves
 * exactly as it does now, and the day a key appears the same rows start
 * arriving `verified`.
 */
import type { DateTime } from 'luxon';

export type SlipCheck =
  /** the service confirmed a transfer matching what the shop claimed */
  | { outcome: 'verified'; transferredAt: string; amount: string; reference: string | null }
  /** the service answered, and the answer was no */
  | { outcome: 'rejected'; reason: string }
  /** nobody asked: no key configured, or the service could not be reached */
  | { outcome: 'unchecked'; reason: string };

export interface SlipCheckInput {
  slipUrl: string;
  /** what the shop said they sent, in baht */
  expectedAmount: string;
  /** the day they said they sent it, in the shop's own zone */
  claimedAt: DateTime;
}

/** Configured per deployment, never per shop — it is the platform's account. */
function apiKey(): string | null {
  return process.env.SLIPOK_API_KEY?.trim() || null;
}

function endpoint(): string {
  return process.env.SLIPOK_API_URL?.trim() || 'https://api.slipok.com/api/line/apikey';
}

/** The branch the key belongs to — it is part of the address, not a header. */
function branchId(): string | null {
  return process.env.SLIPOK_BRANCH_ID?.trim() || null;
}

/**
 * Both halves, or nothing.
 *
 * A key without a branch id addresses no branch and every call comes back
 * 1001, which this treats as our problem and waves through. The screens that
 * promise "แนบสลิปแล้วระบบตรวจให้" would then be lying, so half a
 * configuration counts as none.
 */
export function slipCheckingEnabled(): boolean {
  return apiKey() !== null && branchId() !== null;
}

/**
 * Ask the service about one slip.
 *
 * Never throws. A verification service being down must not stop a shop paying
 * — the answer in that case is `unchecked`, which leaves the row exactly where
 * it would have been before any of this existed.
 */
export async function checkSlip(
  input: SlipCheckInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SlipCheck> {
  const key = apiKey();
  if (!key) return { outcome: 'unchecked', reason: 'ยังไม่ได้ตั้งค่าบริการตรวจสลิป' };

  let payload: SlipOkResponse | null = null;
  let httpOk = false;
  try {
    const response = await fetchImpl(`${endpoint()}/${branchId() ?? ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-authorization': key },
      body: JSON.stringify({
        url: input.slipUrl,
        // `log: true` is what makes the service check the slip against the
        // account registered to this branch (error 1014) and remember it, so
        // the same screenshot sent again is caught (1012). Without it the call
        // only reads the slip, which would let last month's slip buy this month.
        log: true,
        // Their comparison as well as ours: theirs sees the amount the bank
        // recorded, before any rounding of ours.
        amount: Number(input.expectedAmount),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    httpOk = response.ok;
    payload = (await response.json().catch(() => null)) as SlipOkResponse | null;
  } catch {
    return { outcome: 'unchecked', reason: 'เรียกบริการตรวจสลิปไม่ได้' };
  }

  // A refusal is an answer, not a failure. Which kind depends on whose problem
  // it is: a slip that is wrong, duplicated or paid to somebody else is a no,
  // and our own expired package or the bank being down is not the shop's fault.
  if (!httpOk) {
    const code = typeof payload?.code === 'number' ? payload.code : null;
    const message = payload?.message?.trim();

    if (code !== null && OUR_PROBLEM.has(code)) {
      return { outcome: 'unchecked', reason: message ?? `บริการตรวจสลิปตอบกลับ ${code}` };
    }
    if (code !== null) {
      return { outcome: 'rejected', reason: message ?? `ตรวจสลิปไม่ผ่าน (${code})` };
    }
    return { outcome: 'unchecked', reason: 'บริการตรวจสลิปตอบกลับผิดรูปแบบ' };
  }

  if (!payload?.success || !payload.data) {
    return { outcome: 'rejected', reason: payload?.message ?? 'อ่านสลิปไม่ได้' };
  }

  const paid = Number(payload.data.amount);
  const expected = Number(input.expectedAmount);

  // Satang, not baht, and compared as integers: a float comparison on money
  // is how 590.00 stops equalling 590.
  if (Math.round(paid * 100) !== Math.round(expected * 100)) {
    return {
      outcome: 'rejected',
      reason: `ยอดในสลิป ${paid.toLocaleString('th-TH')} บาท ไม่ตรงกับที่แจ้ง ${expected.toLocaleString('th-TH')} บาท`,
    };
  }

  return {
    outcome: 'verified',
    transferredAt: payload.data.transTimestamp ?? input.claimedAt.toISO()!,
    amount: paid.toFixed(2),
    reference: payload.data.transRef ?? null,
  };
}

/**
 * Refusals that say nothing about the slip.
 *
 * 1001–1004 are our account: a wrong branch id, a bad key, a lapsed package,
 * a spent quota. 1009 and 1010 are the bank: temporarily unreachable, or a
 * slip that cannot be read yet because that bank publishes late. None of them
 * is evidence that a shop did not pay, so the claim goes through on trust and
 * a human sorts it out — which is exactly how the product behaved before any
 * of this existed.
 *
 * Everything else — no QR in the image, a QR that is not a payment, an expired
 * one, a repeat, a wrong amount, a payment to somebody else's account — is a
 * definite no, and refusing it is the entire point of paying for this.
 */
const OUR_PROBLEM = new Set([1001, 1002, 1003, 1004, 1009, 1010]);

/** Only the fields this code reads; the service returns a good deal more. */
interface SlipOkResponse {
  success?: boolean;
  /** present on a refusal — see OUR_PROBLEM and docs/status.md */
  code?: number;
  message?: string;
  data?: {
    amount?: number | string;
    transRef?: string;
    transTimestamp?: string;
  };
}
