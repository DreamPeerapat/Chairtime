/**
 * `/auth/callback/{provider}` — docs/logic.md ข้อ 1.5.
 *
 * A route handler, not `next/navigation`'s `redirect()`: that helper depends
 * on framework internals meant for Server Components/Actions and does not
 * behave the same way from inside a Route Handler, so redirects here are
 * built as plain `NextResponse.redirect` and cookies are set on the response.
 */
import { NextResponse } from 'next/server';
import { findSqlState } from '@/lib/booking/errors';
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

  // Everything from here on touches the database and SESSION_SECRET. Letting
  // those throw hands the shop owner a blank browser 500 with nothing in the
  // URL to say what broke, so each stage is caught and named: the reason goes
  // to the runtime log, the person gets Thai copy on /login.
  let staffUserId: string;
  try {
    ({ staffUserId } = await findOrCreateStaffUser(profile));
  } catch (error) {
    logCallbackFailure(provider, 'find_or_create_staff_user', error);
    return toLogin(url, 'server');
  }

  try {
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
  } catch (error) {
    logCallbackFailure(provider, 'route_after_login', error);
    return toLogin(url, 'server');
  }
}

/**
 * One line per failed login, carrying the SQLSTATE when there is one, because
 * that is what names the cause: 42P01 (undefined table) means drizzle/0004 was
 * never applied to this database, 42501 (insufficient privilege) means the app
 * role never got the grants that migration hands out, 28P01/ECONNREFUSED mean
 * DATABASE_URL is wrong. The profile is deliberately not logged — it holds the
 * person's email and LINE user id.
 */
function logCallbackFailure(provider: OAuthProviderId, stage: string, error: unknown): void {
  const sqlState = findSqlState(error);
  console.error(
    `[auth] ${provider} callback failed at ${stage}${sqlState ? ` (SQLSTATE ${sqlState})` : ''}`,
    error,
  );
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
