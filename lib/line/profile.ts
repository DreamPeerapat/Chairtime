/**
 * Verifying who is on the other end of a LINE access token.
 *
 * `GET /v2/profile` validates the token itself and hands back the profile it
 * belongs to — the caller here supplies no client id/secret, so this works
 * for a token from any LINE login surface (LIFF, LINE Login OAuth, ...).
 * Used to trust a LIFF page's client-reported identity: never take a
 * customer-supplied lineUserId at face value, always resolve it from a token
 * LINE itself vouches for.
 */
export interface LineProfile {
  userId: string;
  displayName: string | null;
  pictureUrl: string | null;
}

export async function fetchLineProfile(accessToken: string): Promise<LineProfile | null> {
  let response: Response;
  try {
    response = await fetch('https://api.line.me/v2/profile', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const data = (await response.json().catch(() => null)) as {
    userId?: string;
    displayName?: string;
    pictureUrl?: string;
  } | null;
  if (!data?.userId) return null;

  return { userId: data.userId, displayName: data.displayName ?? null, pictureUrl: data.pictureUrl ?? null };
}
