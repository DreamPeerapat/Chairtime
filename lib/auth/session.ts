/**
 * Staff sessions.
 *
 * A signed, stateless cookie: `<base64url payload>.<hmac>`. No session table
 * and no store to keep alive — for a solo dev that is one fewer moving part,
 * and the trade-off (a session cannot be revoked before it expires) is bounded
 * by a short lifetime.
 *
 * The payload carries the tenant a staff member picked (a person can belong to
 * several shops via `staff_tenant`), and every admin query then scopes to it.
 * It is signed, not encrypted: it holds no secret, and tampering is what the
 * HMAC catches.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'chairtime_session';
const MAX_AGE_SECONDS = 12 * 60 * 60; // a working day

export type StaffRole = 'owner' | 'manager' | 'staff';

export interface SessionPayload {
  staffUserId: string;
  tenantId: string;
  tenantSlug: string;
  displayName: string | null;
  role: StaffRole;
  /** the resource row, when this staff member is also a bookable person */
  resourceId: string | null;
  /** tenant.onboarded_at IS NOT NULL — iron rule #7: false means the dashboard stays locked. */
  onboarded: boolean;
  expiresAt: number; // epoch seconds
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error(
      'SESSION_SECRET is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  return value;
}

export function createSessionToken(
  payload: Omit<SessionPayload, 'expiresAt'>,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const full: SessionPayload = { ...payload, expiresAt: nowSeconds + MAX_AGE_SECONDS };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readSessionToken(
  token: string | undefined | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!verify(body, signature)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= nowSeconds) return null;
  if (!payload.tenantId || !payload.staffUserId) return null;
  return payload;
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

function verify(body: string, signature: string): boolean {
  const expected = Buffer.from(sign(body), 'utf8');
  const received = Buffer.from(signature, 'utf8');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE_SECONDS,
};

/**
 * Between "we know which auth_identity this is" and "a tenant has been
 * chosen" there is no tenant to put in a real session yet — a brand-new
 * signup has none, someone with several shops hasn't picked one. This is a
 * second, much shorter-lived signed cookie that carries only the staff_user
 * id, so /onboarding/plan and /select-store know who is asking without
 * granting dashboard access to anything.
 */
export const PENDING_IDENTITY_COOKIE = 'chairtime_pending_identity';
const PENDING_MAX_AGE_SECONDS = 10 * 60;

interface PendingIdentityPayload {
  staffUserId: string;
  expiresAt: number;
}

export function createPendingIdentityToken(
  staffUserId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const payload: PendingIdentityPayload = { staffUserId, expiresAt: nowSeconds + PENDING_MAX_AGE_SECONDS };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readPendingIdentityToken(
  token: string | undefined | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  if (!verify(body, token.slice(dot + 1))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PendingIdentityPayload;
    if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= nowSeconds) return null;
    return payload.staffUserId || null;
  } catch {
    return null;
  }
}

export const PENDING_IDENTITY_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: PENDING_MAX_AGE_SECONDS,
};

/** Role ranking, so a check reads as "at least a manager". */
const RANK: Record<StaffRole, number> = { staff: 1, manager: 2, owner: 3 };

export function hasRole(session: SessionPayload, minimum: StaffRole): boolean {
  return (RANK[session.role] ?? 0) >= RANK[minimum];
}
