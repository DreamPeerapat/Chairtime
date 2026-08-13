/**
 * Iron rule #7: "เข้า dashboard ได้ก็ต่อเมื่อ tenant.onboarded_at IS NOT NULL
 * เท่านั้น ไม่งั้น redirect กลับไป onboarding wizard เสมอ". The dashboard
 * layout already requires a session; this only adds the onboarding gate, so
 * someone who paid but hasn't finished the setup wizard can't skip it by
 * guessing a URL.
 *
 * Proxy files always run on the Node.js runtime (unlike the old middleware
 * convention's Edge default), which is what makes verifying the session
 * cookie's HMAC via `node:crypto` safe to do here.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, readSessionToken } from '@/lib/auth/session';

export function proxy(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  // No/invalid session: let the dashboard layout's own requireSession()
  // redirect to /login, so the "why" message stays in one place.
  if (!session) return NextResponse.next();

  if (!session.onboarded) {
    const url = request.nextUrl.clone();
    url.pathname = '/onboarding/setup';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
