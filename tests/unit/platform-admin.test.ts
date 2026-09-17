/**
 * Who counts as a platform operator.
 *
 * This is the only role in the product that is not scoped to a shop, so it is
 * the one worth being paranoid about. It is read from the environment rather
 * than from a table on purpose: a row saying "this user is an admin" is a row
 * the application's own database role can write, and any write it could be
 * tricked into would become a privilege escalation across every shop.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPlatformAdmin } from '@/lib/admin/platform';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isPlatformAdmin', () => {
  it('says no to everybody when the variable is unset', () => {
    vi.stubEnv('PLATFORM_ADMIN_STAFF_IDS', '');
    expect(isPlatformAdmin(ALICE)).toBe(false);
  });

  it('recognises a single id', () => {
    vi.stubEnv('PLATFORM_ADMIN_STAFF_IDS', ALICE);
    expect(isPlatformAdmin(ALICE)).toBe(true);
    expect(isPlatformAdmin(BOB)).toBe(false);
  });

  it('reads a list, spaces and all', () => {
    // Pasted from a spreadsheet or a terminal, it will have spaces in it.
    vi.stubEnv('PLATFORM_ADMIN_STAFF_IDS', ` ${ALICE} , ${BOB} `);
    expect(isPlatformAdmin(ALICE)).toBe(true);
    expect(isPlatformAdmin(BOB)).toBe(true);
  });

  it('is not fooled by an empty entry', () => {
    // "a,,b" must not make the empty string an administrator, which is what
    // an unauthenticated caller's id would look like.
    vi.stubEnv('PLATFORM_ADMIN_STAFF_IDS', `${ALICE},,`);
    expect(isPlatformAdmin('')).toBe(false);
  });

  it('matches exactly, not by prefix', () => {
    vi.stubEnv('PLATFORM_ADMIN_STAFF_IDS', ALICE);
    expect(isPlatformAdmin(ALICE.slice(0, 8))).toBe(false);
    expect(isPlatformAdmin(`${ALICE}x`)).toBe(false);
  });
});
