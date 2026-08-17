/**
 * fetchLineProfile is what stops the LIFF points route from trusting a
 * client-supplied identity — it must only ever report the profile LINE
 * itself hands back for a given token, and fail closed on anything else.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLineProfile } from '@/lib/line/profile';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchLineProfile', () => {
  it('returns the profile for a valid token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        expect((init?.headers as Record<string, string>).authorization).toBe('Bearer good-token');
        return new Response(
          JSON.stringify({ userId: 'U123', displayName: 'คุณลูกค้า', pictureUrl: 'https://example.test/p.png' }),
          { status: 200 },
        );
      }),
    );

    const profile = await fetchLineProfile('good-token');
    expect(profile).toEqual({ userId: 'U123', displayName: 'คุณลูกค้า', pictureUrl: 'https://example.test/p.png' });
  });

  it('returns null for an invalid or expired token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    expect(await fetchLineProfile('bad-token')).toBeNull();
  });

  it('returns null when LINE answers with no userId', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    expect(await fetchLineProfile('weird-token')).toBeNull();
  });

  it('returns null instead of throwing when the network call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    expect(await fetchLineProfile('any-token')).toBeNull();
  });
});
