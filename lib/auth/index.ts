/** Server-side helpers for the admin screens. */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { verifyPassword } from './password';
import {
  SESSION_COOKIE,
  createSessionToken,
  hasRole,
  readSessionToken,
  type SessionPayload,
  type StaffRole,
} from './session';

export * from './session';
export { hashPassword, verifyPassword, PasswordTooWeakError } from './password';

export class LoginFailedError extends Error {
  readonly code = 'LOGIN_FAILED';
  constructor() {
    // One message for both "no such account" and "wrong password", so the form
    // cannot be used to discover which emails exist.
    super('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    this.name = 'LoginFailedError';
  }
}

/**
 * Check credentials and mint a session token.
 *
 * The staff_user lookup crosses tenants by design — a person logging in has not
 * told us which shop they belong to yet, and the email is unique per tenant.
 * This is the one query that legitimately spans tenants, and it reads nothing
 * but the login row.
 */
export async function authenticate(email: string, password: string): Promise<string> {
  const rows = await db
    .select({
      id: schema.staffUser.id,
      tenantId: schema.staffUser.tenantId,
      email: schema.staffUser.email,
      passwordHash: schema.staffUser.passwordHash,
      role: schema.staffUser.role,
      resourceId: schema.staffUser.resourceId,
      isActive: schema.staffUser.isActive,
      tenantSlug: schema.tenant.slug,
      tenantStatus: schema.tenant.status,
    })
    .from(schema.staffUser)
    .innerJoin(schema.tenant, eq(schema.tenant.id, schema.staffUser.tenantId))
    .where(eq(schema.staffUser.email, email.trim().toLowerCase()));

  const user = rows.find((r) => r.isActive && r.tenantStatus === 'active');

  // Hash even when there is no user, so a missing account and a wrong password
  // take the same amount of time.
  const ok = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !ok) throw new LoginFailedError();

  return createSessionToken({
    staffUserId: user.id,
    tenantId: user.tenantId,
    tenantSlug: user.tenantSlug,
    email: user.email,
    role: normaliseRole(user.role),
    resourceId: user.resourceId,
  });
}

function normaliseRole(raw: string): StaffRole {
  return raw === 'owner' || raw === 'manager' ? raw : 'staff';
}

/** The current session, or null. Safe to call from any server component. */
export async function currentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

/** The current session, or a redirect to the login page. */
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

/** Set an owner's password — used by the seed and the account screen. */
export async function setStaffPassword(staffUserId: string, hash: string): Promise<void> {
  await db.update(schema.staffUser).set({ passwordHash: hash }).where(eq(schema.staffUser.id, staffUserId));
}

export async function findStaffUser(tenantId: string, email: string) {
  const [row] = await db
    .select()
    .from(schema.staffUser)
    .where(and(eq(schema.staffUser.tenantId, tenantId), eq(schema.staffUser.email, email)));
  return row ?? null;
}
