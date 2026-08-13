/**
 * `/auth/callback/{provider}` — docs/logic.md ข้อ 1.5.
 *
 * A route handler, not `next/navigation`'s `redirect()`: that helper depends
 * on framework internals meant for Server Components/Actions and does not
 * behave the same way from inside a Route Handler, so redirects here are
 * built as plain `NextResponse.redirect` and cookies are set on the response.
 */
import { NextResponse } from 'next/server';
import { exchangeCode, OAuthConfigError, OAuthExchangeError, type OAuthProviderId } from './oauth';
import { findOrCreateStaffUser, routeAfterLogin } from './identity';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  PENDING_IDENTITY_COOKIE,
  PENDING_IDENTITY_COOKIE_OPTIONS,
  createPendingIdentityToken,
} from './session';

export const OAUTH_STATE_COOKIE = 'chairtime_oauth_state';

export const OAUTH_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 10 * 60,
};

/** Must exactly match what is registered in the LINE Login / Google console. */
export function redirectUriFor(provider: OAuthProviderId): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `${base}/auth/callback/${provider}`;
}

export async function handleOAuthCallback(
  provider: OAuthProviderId,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const providerDeniedLogin = url.searchParams.get('error');
  const expectedState = readCookie(request, OAUTH_STATE_COOKIE);

  // Covers: the user hit "cancel" on the provider's consent screen, the
  // round-trip took long enough for the state cookie to expire, or someone is
  // replaying/forging a callback URL that never went through /auth/start.
  if (providerDeniedLogin || !code || !state || !expectedState || state !== expectedState) {
    return toLogin(url, 'oauth');
  }

  let profile;
  try {
    profile = await exchangeCode(provider, code, redirectUriFor(provider));
  } catch (error) {
    if (error instanceof OAuthExchangeError || error instanceof OAuthConfigError) {
      return toLogin(url, 'oauth');
    }
    throw error;
  }

  const { staffUserId } = await findOrCreateStaffUser(profile);
  const route = await routeAfterLogin(staffUserId);

  if (route.kind === 'dashboard') {
    const response = NextResponse.redirect(new URL('/dashboard', url.origin));
    response.cookies.set(SESSION_COOKIE, route.token, SESSION_COOKIE_OPTIONS);
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  }

  // 0 shops -> pick a plan; >1 shop -> pick which one. Either way there is a
  // person but no tenant yet, so only the short-lived pending identity is set.
  const destination = route.kind === 'onboarding' ? '/onboarding/plan' : '/select-store';
  const response = NextResponse.redirect(new URL(destination, url.origin));
  response.cookies.set(
    PENDING_IDENTITY_COOKIE,
    createPendingIdentityToken(staffUserId),
    PENDING_IDENTITY_COOKIE_OPTIONS,
  );
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

function toLogin(url: URL, error: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/login?error=${error}`, url.origin));
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}
