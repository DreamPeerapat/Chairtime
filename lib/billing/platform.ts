/**
 * Where a shop sends the money.
 *
 * One copy, because there were two: the onboarding payment page had the
 * account number typed into its JSX, and the renewal page would have been a
 * second place to forget when the account changes.
 *
 * Not in the database and not an env var on purpose — it is the same for
 * every shop, it belongs in the repo's history when it changes, and a missing
 * env var here would render a payment page with no account number on it.
 */
export const PLATFORM_PAYEE = {
  bank: 'ธนาคารกสิกรไทย',
  accountNumber: '152-1-48909-6',
  accountName: 'นายพีรพัฒน์ วงศ์สุวรรณ์',
  /**
   * The PromptPay id the QR pays into — a mobile number, a national id or an
   * e-wallet id; lib/billing/promptpay.ts works out which from its shape.
   *
   * Separate from the account number above because they are not always the
   * same thing, and a QR built from a bank account number scans into nothing.
   *
   * This number is registered to the account above, which is what the slip
   * checker is told to expect: a QR that pays into one bank while SlipOK
   * watches another refuses every slip as 1014, and the shop is blamed for it.
   * Move the PromptPay registration and this file and SlipOK's own settings
   * have to move together.
   */
  promptPayId: '0906749156',
} as const;
