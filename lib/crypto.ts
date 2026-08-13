/**
 * Encryption for secrets at rest — currently the per-tenant LINE channel
 * tokens, which iron rule #6 requires be stored encrypted.
 *
 * AES-256-GCM from node:crypto. GCM is authenticated, so a tampered ciphertext
 * fails to decrypt rather than returning garbage. No new dependency.
 *
 * The key comes from SECRET_ENCRYPTION_KEY (32 bytes, base64 or hex). Rotating
 * it means re-encrypting every stored secret, so the version prefix in the
 * payload leaves room to do that without guessing at the format later.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard
const KEY_BYTES = 32;

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      'SECRET_ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
    this.name = 'MissingEncryptionKeyError';
  }
}

export function parseKey(raw: string): Buffer {
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`SECRET_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`);
  }
  return key;
}

function activeKey(): Buffer {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) throw new MissingEncryptionKeyError();
  return parseKey(raw);
}

/** Returns "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function encryptSecret(plaintext: string, key: Buffer = activeKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, b64(iv), b64(tag), b64(ciphertext)].join('.');
}

export function decryptSecret(payload: string, key: Buffer = activeKey()): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('cannot decrypt: unrecognised ciphertext format');
  }
  const [, ivPart, tagPart, dataPart] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, unb64(ivPart!));
  decipher.setAuthTag(unb64(tagPart!));
  return Buffer.concat([decipher.update(unb64(dataPart!)), decipher.final()]).toString('utf8');
}

/** Constant-time comparison, for signatures and session tokens. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function b64(buf: Buffer): string {
  return buf.toString('base64url');
}

function unb64(text: string): Buffer {
  return Buffer.from(text, 'base64url');
}
