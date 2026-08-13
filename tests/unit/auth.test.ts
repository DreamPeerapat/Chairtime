import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  createSessionToken,
  hasRole,
  readSessionToken,
  type SessionPayload,
} from '@/lib/auth/session';

beforeAll(() => {
  process.env.SESSION_SECRET ??= 'dGVzdC1zZWNyZXQtZm9yLXVuaXQtdGVzdHMtMzJieXRlcw==';
});

describe('password hashing', () => {
  it('round-trips a password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse batteries', hash)).toBe(false);
  });

  it('never stores the password itself', async () => {
    const hash = await hashPassword('hunter2hunter2');
    expect(hash).not.toContain('hunter2');
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same-password', a)).toBe(true);
    expect(await verifyPassword('same-password', b)).toBe(true);
  });

  it('treats an account with no password as unauthenticatable', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
  });

  it('rejects a corrupted hash instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$1$2$3$bad')).toBe(false);
  });

  it('normalises unicode, so a Thai password typed two ways still matches', async () => {
    const composed = 'รหัสผ่านไทย123'.normalize('NFC');
    const decomposed = 'รหัสผ่านไทย123'.normalize('NFD');
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it('refuses a password that is too short', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/8 ตัวอักษร/);
  });
});

describe('session tokens', () => {
  const payload: Omit<SessionPayload, 'expiresAt'> = {
    staffUserId: 'user-1',
    tenantId: 'tenant-1',
    tenantSlug: 'shop',
    email: 'owner@shop.test',
    role: 'owner',
    resourceId: null,
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
    email: 'e',
    role,
    resourceId: null,
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
