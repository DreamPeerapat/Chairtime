/**
 * The blob path is the tenant boundary in the portfolio store.
 *
 * `handleUpload`'s onBeforeGenerateToken cannot rewrite the destination path —
 * its return type accepts no `pathname`, so a value returned there is silently
 * dropped and the browser's own path is used. That was written the wrong way
 * round first time, with a comment claiming a prefix the SDK never applied.
 * The route therefore *refuses* a path outside the shop's folder instead, and
 * these pin the check that does it.
 */
import { describe, expect, it } from 'vitest';
import { portfolioPrefix } from '@/lib/portfolio/validation';

const SHOP = '4d347e9e-3141-4016-97a9-eeb7304c30df';
const OTHER = '11111111-2222-4333-8444-555555555555';

/** Exactly the check app/api/admin/portfolio/upload/route.ts makes. */
const accepted = (tenantId: string, pathname: string) =>
  pathname.startsWith(portfolioPrefix(tenantId));

describe('portfolio blob prefix', () => {
  it('accepts a path inside the shop folder', () => {
    expect(accepted(SHOP, `portfolio/${SHOP}/nail-art.webp`)).toBe(true);
  });

  it('refuses another shop folder', () => {
    expect(accepted(SHOP, `portfolio/${OTHER}/stolen.webp`)).toBe(false);
  });

  it('refuses the store root', () => {
    expect(accepted(SHOP, 'photo.webp')).toBe(false);
  });

  it('refuses a path that only starts like the shop id', () => {
    // The trailing slash matters: without it, tenant "abc" would be allowed
    // to write into tenant "abcdef"'s folder.
    expect(accepted('abc', 'portfolio/abcdef/x.webp')).toBe(false);
    expect(portfolioPrefix('abc').endsWith('/')).toBe(true);
  });

  it('refuses an attempt to climb out of the folder', () => {
    expect(accepted(SHOP, `portfolio/${OTHER}/../${SHOP}/x.webp`)).toBe(false);
  });
});
