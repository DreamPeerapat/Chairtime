/**
 * LINE Login and Google Sign-In, talked to directly over `fetch`.
 *
 * Iron rule #7 requires OAuth-only auth, but nothing here requires a new
 * dependency: both providers expose plain JSON token endpoints, and both let
 * a server verify the result by calling back with the access/id token rather
 * than needing a JWT library — LINE has `GET /v2/profile` (Bearer access
 * token), Google has `GET /tokeninfo?id_token=...`. That is what `exchangeCode`
 * below does.
 */
import { randomBytes } from 'node:crypto';

export type OAuthProviderId = 'line' | 'google';

export interface OAuthProfile {
  provider: OAuthProviderId;
  providerUid: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export class OAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthConfigError';
  }
}

/** The provider said no, or said something we could not parse. Message is Thai-safe to show. */
export class OAuthExchangeError extends Error {
  constructor(
    readonly provider: OAuthProviderId,
    message = 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง',
  ) {
    super(message);
    this.name = 'OAuthExchangeError';
  }
}

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
}

function lineConfig(): ProviderConfig {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  const clientSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!clientId || !clientSecret) {
    throw new OAuthConfigError('LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET is not set');
  }
  return { clientId, clientSecret };
}

function googleConfig(): ProviderConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new OAuthConfigError('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET is not set');
  }
  return { clientId, clientSecret };
}

/** A fresh, unguessable state value for the CSRF check around the redirect round-trip. */
export function generateState(): string {
  return randomBytes(24).toString('base64url');
}

export function buildAuthorizeUrl(
  provider: OAuthProviderId,
  params: { redirectUri: string; state: string },
): string {
  if (provider === 'line') {
    const { clientId } = lineConfig();
    const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('state', params.state);
    url.searchParams.set('scope', 'profile openid email');
    return url.toString();
  }

  const { clientId } = googleConfig();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  url.searchParams.set('scope', 'openid email profile');
  return url.toString();
}

/** Exchange an authorization code for a verified profile. Never trusts the client for identity. */
export async function exchangeCode(
  provider: OAuthProviderId,
  code: string,
  redirectUri: string,
): Promise<OAuthProfile> {
  return provider === 'line'
    ? exchangeLineCode(code, redirectUri)
    : exchangeGoogleCode(code, redirectUri);
}

async function exchangeLineCode(code: string, redirectUri: string): Promise<OAuthProfile> {
  const { clientId, clientSecret } = lineConfig();

  const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!tokenResponse.ok) throw new OAuthExchangeError('line');
  const token = (await tokenResponse.json()) as { access_token?: string; id_token?: string };
  if (!token.access_token) throw new OAuthExchangeError('line');

  const profileResponse = await fetch('https://api.line.me/v2/profile', {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) throw new OAuthExchangeError('line');
  const profile = (await profileResponse.json()) as {
    userId?: string;
    displayName?: string;
    pictureUrl?: string;
  };
  if (!profile.userId) throw new OAuthExchangeError('line');

  return {
    provider: 'line',
    providerUid: profile.userId,
    // LINE only returns email through the id_token, and only when the `email`
    // scope was granted; a login must still work when it was not.
    email: await lineEmailFromIdToken(token, clientId),
    displayName: profile.displayName ?? null,
    avatarUrl: profile.pictureUrl ?? null,
  };
}

async function lineEmailFromIdToken(
  token: { id_token?: string },
  clientId: string,
): Promise<string | null> {
  if (!token.id_token) return null;
  try {
    const verifyResponse = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: token.id_token, client_id: clientId }),
    });
    if (!verifyResponse.ok) return null;
    const decoded = (await verifyResponse.json()) as { email?: string };
    return decoded.email ?? null;
  } catch {
    return null;
  }
}

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthProfile> {
  const { clientId, clientSecret } = googleConfig();

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!tokenResponse.ok) throw new OAuthExchangeError('google');
  const token = (await tokenResponse.json()) as { id_token?: string };
  if (!token.id_token) throw new OAuthExchangeError('google');

  // Google's tokeninfo endpoint verifies the id_token's signature and
  // expiry server-side and hands back the decoded claims — no JWT library
  // needed to check it ourselves.
  const infoResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token.id_token)}`,
  );
  if (!infoResponse.ok) throw new OAuthExchangeError('google');
  const claims = (await infoResponse.json()) as {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    picture?: string;
  };
  if (!claims.sub || claims.aud !== clientId) throw new OAuthExchangeError('google');

  return {
    provider: 'google',
    providerUid: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
    avatarUrl: claims.picture ?? null,
  };
}
