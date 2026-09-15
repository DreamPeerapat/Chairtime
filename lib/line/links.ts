/**
 * The customer-facing URLs that go into LINE messages.
 *
 * They live together because they drifted apart once: the worker pointed the
 * "ดู / เลื่อน / ยกเลิกคิว" button at the booking it was about, while the
 * webhook pointed the same button at the new-booking page — so a customer
 * asking to see their appointment was offered a way to make another one.
 */
function appBase(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  return base ? base.replace(/\/$/, '') : null;
}

/** One booking's own page: what it is, and the buttons to move or cancel it. */
export function manageBookingUrl(tenantSlug: string, code: string): string | null {
  const base = appBase();
  return base ? `${base}/${tenantSlug}/booking/${code}` : null;
}

/** The shop's portfolio. */
export function galleryUrl(tenantSlug: string): string | null {
  const base = appBase();
  return base ? `${base}/${tenantSlug}/gallery` : null;
}

/**
 * The points page.
 *
 * Not a liff.line.me deep link like the booking page: the shop registers one
 * LIFF endpoint and it is the booking flow. The plain URL still opens
 * correctly — PointsView calls liff.init with withLoginOnExternalBrowser.
 */
export function pointsUrl(tenantSlug: string): string | null {
  const base = appBase();
  return base ? `${base}/${tenantSlug}/points` : null;
}
