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

export function slipCheckingEnabled(): boolean {
  return apiKey() !== null;
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
  try {
    const response = await fetchImpl(`${endpoint()}/${process.env.SLIPOK_BRANCH_ID ?? ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-authorization': key },
      body: JSON.stringify({ url: input.slipUrl, log: true }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { outcome: 'unchecked', reason: `บริการตรวจสลิปตอบกลับ ${response.status}` };
    }
    payload = (await response.json()) as SlipOkResponse;
  } catch {
    return { outcome: 'unchecked', reason: 'เรียกบริการตรวจสลิปไม่ได้' };
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

/** Only the fields this code reads; the service returns a good deal more. */
interface SlipOkResponse {
  success?: boolean;
  message?: string;
  data?: {
    amount?: number | string;
    transRef?: string;
    transTimestamp?: string;
  };
}
