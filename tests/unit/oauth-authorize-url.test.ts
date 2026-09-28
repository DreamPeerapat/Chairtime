import { beforeAll, describe, expect, it } from 'vitest';
import { buildAuthorizeUrl } from '@/lib/auth/oauth';

beforeAll(() => {
  process.env.LINE_LOGIN_CHANNEL_ID ||= 'line-channel-id';
  process.env.LINE_LOGIN_CHANNEL_SECRET ||= 'line-channel-secret';
  process.env.GOOGLE_CLIENT_ID ||= 'google-client-id';
  process.env.GOOGLE_CLIENT_SECRET ||= 'google-client-secret';
});

const params = {
  redirectUri: 'https://chairtime.example/auth/callback/line',
  state: 'state-123',
};

/**
 * The add-friend tickbox on the signup screen is one query parameter, and it
 * is invisible in every way that a test would normally notice: LINE ignores
 * `bot_prompt` when no OA is linked to the Login channel, so dropping it
 * would not break signup, would not throw, and would not show up until
 * somebody wondered why nobody was adding the OA any more.
 */
describe('LINE authorize URL', () => {
  it('asks LINE to offer the ChairTime OA', () => {
    const url = new URL(buildAuthorizeUrl('line', params));
    expect(url.searchParams.get('bot_prompt')).toBe('normal');
  });

  it('still carries what signing in actually needs', () => {
    const url = new URL(buildAuthorizeUrl('line', params));
    expect(url.origin + url.pathname).toBe('https://access.line.me/oauth2/v2.1/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(process.env.LINE_LOGIN_CHANNEL_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(params.redirectUri);
    expect(url.searchParams.get('state')).toBe(params.state);
    expect(url.searchParams.get('scope')).toBe('profile openid email');
  });

  it('leaves Google alone — bot_prompt is a LINE concept', () => {
    const url = new URL(buildAuthorizeUrl('google', { ...params, redirectUri: 'https://x/cb' }));
    expect(url.searchParams.has('bot_prompt')).toBe(false);
  });
});
