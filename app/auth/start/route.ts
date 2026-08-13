/** GET /auth/start?provider=line|google — kicks off the OAuth round trip. */
import { NextResponse } from 'next/server';
import { buildAuthorizeUrl, generateState, redirectUriFor } from '@/lib/auth';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_OPTIONS } from '@/lib/auth/callback';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');

  if (provider !== 'line' && provider !== 'google') {
    return NextResponse.redirect(new URL('/login?error=oauth', url.origin));
  }

  const state = generateState();
  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl(provider, { redirectUri: redirectUriFor(provider), state });
  } catch {
    // Provider not configured (missing client id/secret) — nothing to send
    // the browser to, so fail back to login with a message instead of a 500.
    return NextResponse.redirect(new URL('/login?error=oauth_config', url.origin));
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, OAUTH_STATE_COOKIE_OPTIONS);
  return response;
}
