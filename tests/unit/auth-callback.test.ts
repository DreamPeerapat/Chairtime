/**
 * The OAuth callback's failure paths.
 *
 * A shop owner who finishes a LINE login and lands on a blank browser 500 has
 * no idea whether to retry, and the URL keeps no trace of what broke. These
 * cover the stages after the provider has already verified the person, where
 * the failure is ours: the database and SESSION_SECRET.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OAuthProfile } from '@/lib/auth/oauth';

const exchangeCode = vi.fn<(...args: unknown[]) => Promise<OAuthProfile>>();
const findOrCreateStaffUser = vi.fn();
const routeAfterLogin = vi.fn();

vi.mock('@/lib/auth/oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/oauth')>()),
  exchangeCode: (...args: unknown[]) => exchangeCode(...args),
}));

vi.mock('@/lib/auth/identity', () => ({
  findOrCreateStaffUser: (...args: unknown[]) => findOrCreateStaffUser(...args),
  routeAfterLogin: (...args: unknown[]) => routeAfterLogin(...args),
}));

const { handleOAuthCallback, OAUTH_STATE_COOKIE } = await import('@/lib/auth/callback');

const STATE = 'a-state-value';
const PROFILE: OAuthProfile = {
  provider: 'line',
  providerUid: 'U1234',
  email: null,
  displayName: 'เจ้าของร้าน',
  avatarUrl: null,
};

/** A callback request that has already passed the CSRF state check. */
function callbackRequest(): Request {
  return new Request(`https://chairtime.example/auth/callback/line?code=abc&state=${STATE}`, {
    headers: { cookie: `${OAUTH_STATE_COOKIE}=${STATE}` },
  });
}

/** What postgres.js raises when the app role was never granted the table. */
function insufficientPrivilege(): Error {
  return Object.assign(new Error('permission denied for table auth_identity'), { code: '42501' });
}

beforeAll(() => {
  process.env.SESSION_SECRET ||= 'dGVzdC1zZWNyZXQtZm9yLXVuaXQtdGVzdHMtMzJieXRlcw==';
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  exchangeCode.mockResolvedValue(PROFILE);
});

describe('handleOAuthCallback failure handling', () => {
  it('redirects instead of throwing when provisioning the staff user fails', async () => {
    findOrCreateStaffUser.mockRejectedValue(insufficientPrivilege());

    const response = await handleOAuthCallback('line', callbackRequest());

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).search).toBe('?error=server');
  });

  it('redirects instead of throwing when the tenant lookup fails', async () => {
    findOrCreateStaffUser.mockResolvedValue({ staffUserId: 'staff-1', isNew: true });
    routeAfterLogin.mockRejectedValue(
      Object.assign(new Error('function staff_tenant_lookup(uuid) does not exist'), {
        code: '42883',
      }),
    );

    const response = await handleOAuthCallback('line', callbackRequest());

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).search).toBe('?error=server');
  });

  it('logs the SQLSTATE, because that is what names the cause', async () => {
    findOrCreateStaffUser.mockRejectedValue(insufficientPrivilege());

    await handleOAuthCallback('line', callbackRequest());

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('SQLSTATE 42501'),
      expect.any(Error),
    );
  });

  it('never logs the profile, which carries the email and LINE user id', async () => {
    findOrCreateStaffUser.mockRejectedValue(insufficientPrivilege());

    await handleOAuthCallback('line', callbackRequest());

    const logged = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(logged).not.toContain(PROFILE.providerUid);
  });

  it('still sends a successful login on to the onboarding wizard', async () => {
    findOrCreateStaffUser.mockResolvedValue({ staffUserId: 'staff-1', isNew: true });
    routeAfterLogin.mockResolvedValue({ kind: 'onboarding' });

    const response = await handleOAuthCallback('line', callbackRequest());

    expect(new URL(response.headers.get('location')!).pathname).toBe('/onboarding/plan');
  });
});
