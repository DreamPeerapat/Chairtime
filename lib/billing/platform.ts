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
  accountNumber: '842-2-36615-3',
  accountName: 'นายพีรพัฒน์ วงศ์สุวรรณ์',
} as const;
