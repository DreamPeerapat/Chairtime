/**
 * The string inside a PromptPay QR.
 *
 * It is an EMVCo QR payload: a flat list of tag-length-value fields, ending
 * with a CRC over everything before it. Every Thai banking app reads it, and
 * nothing about it is proprietary — which is why this is fifty lines of
 * string building rather than a payment integration.
 *
 * Getting it wrong is silent in the worst way: the app either refuses to scan
 * or, with a bad amount field, offers to send a different number. So the
 * pieces are built by one function each and the whole thing is checked
 * against payloads with known CRCs in the tests.
 *
 * Money arrives here as a numeric(10,2) string and is formatted, never summed
 * — iron rule #5 keeps arithmetic in satang, and there is none of it here.
 */

/** EMVCo field ids, named so the builder below reads as the spec does. */
const TAG = {
  payloadFormat: '00',
  initiationMethod: '01',
  merchantAccount: '29',
  currency: '53',
  amount: '54',
  country: '58',
  crc: '63',
} as const;

/** Sub-fields of tag 29, the PromptPay merchant account block. */
const PROMPTPAY = {
  applicationId: '00',
  mobile: '01',
  nationalId: '02',
  eWallet: '03',
} as const;

const APPLICATION_ID = 'A000000677010111';
const THB = '764';
const THAILAND = 'TH';

/** Static: the QR may be scanned any number of times. Dynamic: once, for one amount. */
const ONE_TIME = '12';
const REUSABLE = '11';

export type PromptPayTarget =
  | { kind: 'mobile'; value: string }
  | { kind: 'nationalId'; value: string }
  | { kind: 'eWallet'; value: string };

/**
 * Work out what kind of PromptPay id this is from its shape.
 *
 * 10 digits is a mobile number, 13 is a national id, 15 is an e-wallet. Asking
 * the shop to pick from a dropdown would be asking them a question the number
 * already answers.
 */
export function parseTarget(raw: string): PromptPayTarget | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return { kind: 'mobile', value: digits };
  if (digits.length === 13) return { kind: 'nationalId', value: digits };
  if (digits.length === 15) return { kind: 'eWallet', value: digits };
  return null;
}

/** `0812345678` becomes `0066812345678` — country code, no leading zero. */
function formatMobile(mobile: string): string {
  return `0066${mobile.slice(1)}`;
}

/** One field: two-digit tag, two-digit length, then the value. */
function field(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

function merchantAccount(target: PromptPayTarget): string {
  const body =
    field(PROMPTPAY.applicationId, APPLICATION_ID) +
    (target.kind === 'mobile'
      ? field(PROMPTPAY.mobile, formatMobile(target.value))
      : target.kind === 'nationalId'
        ? field(PROMPTPAY.nationalId, target.value)
        : field(PROMPTPAY.eWallet, target.value));

  return field(TAG.merchantAccount, body);
}

/**
 * CRC-16/CCITT-FALSE: polynomial 0x1021, seed 0xFFFF, no reflection, no final
 * XOR. The four hex digits go on the end in upper case, and the length of the
 * CRC field is part of what is summed — which is why the tag and its length
 * are appended before the sum rather than after.
 */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface PromptPayPayloadInput {
  /** the payee: a mobile number, national id or e-wallet id */
  target: PromptPayTarget;
  /** baht as a numeric(10,2) string; omitted makes the QR reusable */
  amount?: string | null;
}

export function promptPayPayload({ target, amount }: PromptPayPayloadInput): string {
  const hasAmount = Boolean(amount) && Number(amount) > 0;

  const body =
    field(TAG.payloadFormat, '01') +
    field(TAG.initiationMethod, hasAmount ? ONE_TIME : REUSABLE) +
    merchantAccount(target) +
    field(TAG.currency, THB) +
    (hasAmount ? field(TAG.amount, Number(amount).toFixed(2)) : '') +
    field(TAG.country, THAILAND);

  // The CRC covers its own tag and length, so they are appended first.
  const withCrcHeader = `${body}${TAG.crc}04`;
  return `${withCrcHeader}${crc16(withCrcHeader)}`;
}

/** Everything the payment page needs, or null when no payee is configured. */
export function promptPayFor(id: string, amount?: string | null): string | null {
  const target = parseTarget(id);
  return target ? promptPayPayload({ target, amount }) : null;
}
