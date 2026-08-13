/**
 * Password hashing with scrypt from node:crypto.
 *
 * No new dependency: bcrypt and argon2 both need native builds, which is one
 * more thing for a solo dev to keep working across deploy targets. scrypt is
 * memory-hard, ships with Node, and the parameters are stored in the hash so
 * they can be raised later without invalidating existing passwords.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// OWASP's floor for scrypt. maxmem must exceed 128 * N * r or Node refuses.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_BYTES = 32;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  assertUsable(password);
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_BYTES, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), derived.toString('base64url')].join(
    '$',
  );
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltPart, hashPart] = parts;
  const expected = Buffer.from(hashPart!, 'base64url');

  let derived: Buffer;
  try {
    derived = await scrypt(password.normalize('NFKC'), Buffer.from(saltPart!, 'base64url'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMS.maxmem,
    });
  } catch {
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function assertUsable(password: string): void {
  if (password.length < 8) throw new PasswordTooWeakError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  if (password.length > 200) throw new PasswordTooWeakError('รหัสผ่านยาวเกินไป');
}

export class PasswordTooWeakError extends Error {
  readonly code = 'WEAK_PASSWORD';
  constructor(message: string) {
    super(message);
    this.name = 'PasswordTooWeakError';
  }
}
