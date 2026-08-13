/** Server-side helpers for the admin screens and the OAuth login flow. */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  PENDING_IDENTITY_COOKIE,
  SESSION_COOKIE,
  readPendingIdentityToken,
  readSessionToken,
  hasRole,
  type SessionPayload,
  type StaffRole,
} from './session';

export * from './session';
export * from './identity';
export * from './oauth';
export * from './callback';

/** The current session, or null. Safe to call from any server component. */
export async function currentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

/** The current session, or a redirect to the marketing/login page. */
export async function requireSession(minimum: StaffRole = 'staff'): Promise<SessionPayload> {
  const session = await currentSession();
  if (!session) redirect('/login');
  if (!hasRole(session, minimum)) redirect('/dashboard?error=forbidden');
  return session;
}

/** For route handlers, which should answer 401/403 rather than redirect. */
export async function sessionForApi(
  minimum: StaffRole = 'staff',
): Promise<{ session: SessionPayload } | { status: 401 | 403 }> {
  const session = await currentSession();
  if (!session) return { status: 401 };
  if (!hasRole(session, minimum)) return { status: 403 };
  return { session };
}

/**
 * Who /onboarding and /select-store are talking to before a tenant has been
 * chosen. Redirects to /login when the short-lived pending cookie is missing
 * or expired, which also covers "someone bookmarked this page".
 */
export async function requirePendingStaffUserId(): Promise<string> {
  const store = await cookies();
  const staffUserId = readPendingIdentityToken(store.get(PENDING_IDENTITY_COOKIE)?.value);
  if (!staffUserId) redirect('/login');
  return staffUserId;
}
