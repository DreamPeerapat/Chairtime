/**
 * Turning what a shop owner has into coordinates.
 *
 * Asking a salon owner for latitude and longitude gets you nothing. Asking
 * them to drop a pin on an embedded map costs a mapping library and a tile
 * server. What every Thai shop already has is the Google Maps link they send
 * customers — so that is what this reads, along with a plain pair of numbers
 * for anyone who does have them.
 *
 * Parsing is pure and the network call is separate, because the shapes below
 * are the part that silently rots when Google changes a URL format.
 */
export interface MapLocation {
  latitude: number;
  longitude: number;
}

/**
 * Hosts whose redirects we are willing to follow.
 *
 * The input is a URL typed by a user and fetched by the server, which is the
 * definition of SSRF. An allowlist of link shorteners keeps that from being a
 * way to make this server fetch anything at all.
 */
const SHORTENERS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co', 'maps.google.com']);

const COORD_PAIR = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/**
 * `!3d<lat>!4d<lng>` in the data segment is the *place* — the pin itself —
 * while `@lat,lng` is wherever the map happened to be centred when the link
 * was made. They differ by a street or two, so the pin wins when both exist.
 */
const PLACE_PIN = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const MAP_CENTRE = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;

export function parseMapLocation(input: string): MapLocation | null {
  const text = input.trim();
  if (!text) return null;

  const pair = COORD_PAIR.exec(text);
  if (pair) return validate(Number(pair[1]), Number(pair[2]));

  const pin = PLACE_PIN.exec(text);
  if (pin) return validate(Number(pin[1]), Number(pin[2]));

  // ?q=13.75,100.50 and ?query=13.75,100.50 — what the "share" sheet and the
  // Maps URL API produce.
  const query = queryCoords(text);
  if (query) return query;

  const centre = MAP_CENTRE.exec(text);
  if (centre) return validate(Number(centre[1]), Number(centre[2]));

  return null;
}

function queryCoords(text: string): MapLocation | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  for (const key of ['q', 'query', 'destination', 'center', 'll']) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    const pair = COORD_PAIR.exec(value);
    if (pair) return validate(Number(pair[1]), Number(pair[2]));
  }
  return null;
}

function validate(latitude: number, longitude: number): MapLocation | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // 0,0 is in the Atlantic. It is what a half-parsed URL yields, never a shop.
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/** Is this one of the short links that has to be expanded before it says anything? */
export function isShortMapLink(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && SHORTENERS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Parse, expanding a short link if that is what it takes.
 *
 * Server-side only: it makes a network request. A shortener that is slow or
 * down yields null rather than hanging the form — the shop can paste the long
 * link instead.
 */
export async function resolveMapLocation(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MapLocation | null> {
  const direct = parseMapLocation(input);
  if (direct) return direct;
  if (!isShortMapLink(input)) return null;

  try {
    const response = await fetchImpl(input.trim(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    // The coordinates live in the URL the redirect lands on, not in the body.
    return parseMapLocation(response.url);
  } catch {
    return null;
  }
}
