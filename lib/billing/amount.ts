/**
 * What a shop owes for a number of months.
 *
 * Its own file, away from `renew.ts`, because the renewal form runs in the
 * browser and `renew.ts` reaches the database — importing one to get the
 * other would pull Drizzle into the client bundle.
 *
 * Iron rule #5: the multiplication happens in satang, as integers. `590.00 *
 * 3` in floating point is 1770.0000000000002, and a QR built from that is a
 * QR a banking app refuses.
 */

/** numeric(10,2) in, satang out. */
export function toSatang(amount: string): number {
  return Math.round(Number(amount) * 100);
}

/** Satang in, numeric(10,2) out — the only shape the rest of the system takes. */
export function fromSatang(satang: number): string {
  return (satang / 100).toFixed(2);
}

/** The bill: one month's price times the months being bought. */
export function totalForMonths(priceMonthly: string, months: number): string {
  const price = toSatang(priceMonthly);
  if (!Number.isFinite(price) || !Number.isInteger(months) || months < 1) return '';
  return fromSatang(price * months);
}

/** "1770.00" → "1,770 บาท". Display only — never read back as a number. */
export function formatBaht(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} บาท`;
  return `${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`;
}
