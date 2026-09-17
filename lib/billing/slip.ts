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
import { PLATFORM_PAYEE } from './platform';

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

    // 1014 is "paid into an account that is not the one registered to this
    // branch", and the service decides that against a number typed into its
    // own settings. A PromptPay transfer names the payee by phone, so a
    // branch registered by bank account can refuse a slip that paid us
    // perfectly well. The slip itself comes back with the refusal, so the
    // question is answerable here: if the payee on it is ours, it is ours.
    if (code === WRONG_RECEIVER && payload?.data && whosePayee(payload.data.receiver) === 'ours') {
      return settle(payload.data, input);
    }

    if (code !== null) {
      return { outcome: 'rejected', reason: message ?? `ตรวจสลิปไม่ผ่าน (${code})` };
    }
    return { outcome: 'unchecked', reason: 'บริการตรวจสลิปตอบกลับผิดรูปแบบ' };
  }

  if (!payload?.success || !payload.data) {
    return { outcome: 'rejected', reason: payload?.message ?? 'อ่านสลิปไม่ได้' };
  }

  // Checked here as well as there: whoever the service was told to expect, a
  // slip that names somebody else is not evidence that we were paid. Only a
  // positive reading of another payee refuses — where the bank printed nothing
  // legible, the service's own check (which `log` turned on) is what stands.
  if (whosePayee(payload.data.receiver) === 'someone else') {
    return { outcome: 'rejected', reason: 'สลิปนี้โอนเข้าบัญชีอื่น ไม่ใช่บัญชีของระบบ' };
  }

  return settle(payload.data, input);
}

/** The amount is the last thing left to disagree about. */
function settle(data: NonNullable<SlipOkResponse['data']>, input: SlipCheckInput): SlipCheck {
  const paid = Number(data.amount);
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
    transferredAt: data.transTimestamp ?? input.claimedAt.toISO()!,
    amount: paid.toFixed(2),
    reference: data.transRef ?? null,
  };
}

/** "บัญชีผู้รับไม่ตรงกับบัญชีหลักของร้าน" — see the note where it is handled. */
const WRONG_RECEIVER = 1014;

/**
 * Who does this slip say was paid?
 *
 * Three answers, not two, and the third is the one that matters. Banks mask
 * what they print — `090xxx9156`, `xxx-x-x8909-6` — and some print a payee
 * nothing can be read from at all. Treating that as "not us" would refuse
 * honest payments; treating it as "us" would accept anything. So it is
 * `unknown`, and the caller decides what an unknown is worth in context.
 *
 * Both of our forms count as ours: the QR pays a PromptPay id registered to
 * the account printed beside it, and which of the two a slip shows is the
 * sending bank's choice, not ours.
 */
type Payee = 'ours' | 'someone else' | 'unknown';

function whosePayee(receiver: SlipOkReceiver | undefined): Payee {
  const ours = [PLATFORM_PAYEE.promptPayId, PLATFORM_PAYEE.accountNumber].map(digitsOf);

  const legible = [receiver?.proxy?.value, receiver?.account?.value].filter(
    (value): value is string => typeof value === 'string' && /[0-9]/.test(value),
  );
  if (legible.length === 0) return 'unknown';

  const mine = legible.some((value) => ours.some((id) => maskedMatches(value, id)));
  return mine ? 'ours' : 'someone else';
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Compare a masked value against one of ours.
 *
 * Only the digits and the mask characters survive the strip, so the dashes a
 * bank adds for readability cannot make two identical accounts look different.
 * A masked value with no visible digits at all matches nothing — it would
 * otherwise match everything.
 */
function maskedMatches(masked: string, mine: string): boolean {
  const pattern = masked.replace(/[^0-9xX*]/g, '');
  if (pattern.length !== mine.length) return false;
  if (!/[0-9]/.test(pattern)) return false;

  for (let i = 0; i < pattern.length; i += 1) {
    const character = pattern[i]!;
    if (character === 'x' || character === 'X' || character === '*') continue;
    if (character !== mine[i]) return false;
  }
  return true;
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

/** Masked as the bank printed it: `090xxx9156`, `xxx-x-x8909-6`. */
interface SlipOkReceiver {
  proxy?: { type?: string | null; value?: string | null };
  account?: { type?: string | null; value?: string | null };
}

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
    receiver?: SlipOkReceiver;
  };
}
