'use client';

/**
 * Who is booking, when the page was opened from the shop's LINE OA.
 *
 * The point is not to save the customer two seconds of typing. It is that a
 * booking made in LIFF can carry the customer's LINE identity, which is what
 * lets the shop's OA send the confirmation and the reminders — and lets the
 * shop answer back — instead of the appointment living only as a phone number
 * nobody follows up.
 *
 * The access token, not the user id, is what gets sent on: /api/bookings
 * exchanges it with LINE. A client-reported id is a claim, and this endpoint
 * is public.
 *
 * Failure is never fatal. Outside LINE, on a shop with no LIFF id, or when
 * init fails, this reports `unavailable` and the form falls back to asking for
 * a name — a customer must not lose their appointment because LINE is having
 * a bad afternoon.
 */
import { useEffect, useState } from 'react';

export type LiffIdentity =
  | { status: 'checking' }
  | { status: 'unavailable' }
  | { status: 'ready'; accessToken: string; displayName: string | null };

export function useLiffIdentity(liffId: string | null): LiffIdentity {
  const [identity, setIdentity] = useState<LiffIdentity>(
    liffId ? { status: 'checking' } : { status: 'unavailable' },
  );

  useEffect(() => {
    if (!liffId) return;
    let cancelled = false;

    (async () => {
      try {
        // Imported here rather than at module scope: the SDK touches `window`
        // on import, and this file is reached by the server render too.
        const liff = (await import('@line/liff')).default;

        // No withLoginOnExternalBrowser: someone who opened the booking link
        // in Safari should get the ordinary form, not be bounced through a
        // LINE login they never asked for.
        await liff.init({ liffId });
        if (cancelled) return;

        const accessToken = liff.isLoggedIn() ? liff.getAccessToken() : null;
        if (!accessToken) {
          setIdentity({ status: 'unavailable' });
          return;
        }

        // Only for greeting them and prefilling the name. The identity that
        // counts is resolved server-side from the token.
        let displayName: string | null = null;
        try {
          displayName = (await liff.getProfile()).displayName || null;
        } catch {
          // Profile scope not granted — the token is still good.
        }

        if (!cancelled) setIdentity({ status: 'ready', accessToken, displayName });
      } catch {
        if (!cancelled) setIdentity({ status: 'unavailable' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [liffId]);

  return identity;
}
