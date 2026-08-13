import { beforeAll, describe, expect, it } from 'vitest';
import {
  createSessionToken,
  hasRole,
  readSessionToken,
  type SessionPayload,
} from '@/lib/auth/session';

beforeAll(() => {
  process.env.SESSION_SECRET ??= 'dGVzdC1zZWNyZXQtZm9yLXVuaXQtdGVzdHMtMzJieXRlcw==';
});

describe('session tokens', () => {
  const payload: Omit<SessionPayload, 'expiresAt'> = {
    staffUserId: 'user-1',
    tenantId: 'tenant-1',
    tenantSlug: 'shop',
    displayName: 'เจ้าของร้าน',
    role: 'owner',
    resourceId: null,
    onboarded: true,
  };

  it('round-trips the payload', () => {
    const session = readSessionToken(createSessionToken(payload));
    expect(session).toMatchObject(payload);
  });

  it('rejects a tampered payload', () => {
    const token = createSessionToken(payload);
    const [body, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...payload, role: 'owner', tenantId: 'someone-elses-tenant', expiresAt: 9e9 }),
      'utf8',
    ).toString('base64url');

    expect(readSessionToken(`${forged}.${signature}`)).toBeNull();
    expect(body).not.toBe(forged);
  });

  it('rejects a token with no signature', () => {
    const token = createSessionToken(payload);
    expect(readSessionToken(token.split('.')[0]!)).toBeNull();
    expect(readSessionToken('')).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });

  it('rejects an expired token', () => {
    const issuedAt = 1_700_000_000;
    const token = createSessionToken(payload, issuedAt);

    expect(readSessionToken(token, issuedAt + 60)).not.toBeNull();
    // 12 hours later
    expect(readSessionToken(token, issuedAt + 12 * 3600 + 1)).toBeNull();
  });
});

describe('role ranking', () => {
  const session = (role: SessionPayload['role']): SessionPayload => ({
    staffUserId: 'u',
    tenantId: 't',
    tenantSlug: 's',
    displayName: null,
    role,
    resourceId: null,
    onboarded: true,
    expiresAt: 9e9,
  });

  it('lets an owner do anything a manager can', () => {
    expect(hasRole(session('owner'), 'manager')).toBe(true);
    expect(hasRole(session('owner'), 'staff')).toBe(true);
  });

  it('stops staff reaching manager-only screens', () => {
    expect(hasRole(session('staff'), 'manager')).toBe(false);
    expect(hasRole(session('staff'), 'owner')).toBe(false);
    expect(hasRole(session('staff'), 'staff')).toBe(true);
  });

  it('stops a manager reaching owner-only screens', () => {
    expect(hasRole(session('manager'), 'owner')).toBe(false);
    expect(hasRole(session('manager'), 'manager')).toBe(true);
  });
});
