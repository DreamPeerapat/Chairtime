/** Server-side helpers for the admin screens. */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
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
 * `staff_user` is under FORCE row-level security like every other tenant table,
 * and a person typing their email has not told us which shop they belong to
 * yet — so a plain SELECT here returns nothing. The lookup goes through
 * `staff_login_lookup`, a SECURITY DEFINER function that returns exactly the
 * login columns for one email and nothing else (see drizzle/0003).
 */
export async function authenticate(email: string, password: string): Promise<string> {
  const rows = await db.execute<{
    id: string;
    tenant_id: string;
    email: string;
    password_hash: string | null;
    role: string;
    resource_id: string | null;
    is_active: boolean;
    tenant_slug: string;
    tenant_status: string;
  }>(sql`SELECT * FROM staff_login_lookup(${email})`);

  const user = [...rows][0];

  // Hash even when there is no user, so a missing account and a wrong password
  // take the same amount of time.
  const ok = await verifyPassword(password, user?.password_hash ?? null);
  if (!user || !ok) throw new LoginFailedError();

  return createSessionToken({
    staffUserId: user.id,
    tenantId: user.tenant_id,
    tenantSlug: user.tenant_slug,
    email: user.email,
    role: normaliseRole(user.role),
    resourceId: user.resource_id,
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

/**
 * Set a staff member's password. Tenant-scoped, unlike the login lookup: by the
 * time anyone is changing a password we know which shop they belong to.
 */
export async function setStaffPassword(
  tenantId: string,
  staffUserId: string,
  hash: string,
): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx
      .update(schema.staffUser)
      .set({ passwordHash: hash })
      .where(
        and(eq(schema.staffUser.tenantId, tenantId), eq(schema.staffUser.id, staffUserId)),
      ),
  );
}

export async function findStaffUser(tenantId: string, email: string) {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.staffUser)
      .where(and(eq(schema.staffUser.tenantId, tenantId), eq(schema.staffUser.email, email)));
    return row ?? null;
  });
}
