/**
 * LINE signs every webhook delivery with HMAC-SHA256 over the raw request body,
 * keyed by the channel secret. Verifying it is the only thing standing between
 * the webhook endpoint and anyone who knows the URL.
 *
 * The comparison is constant-time, and the *raw* body must be used — reading it
 * as JSON and re-serialising changes the bytes and the signature will not match.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function signBody(rawBody: string, channelSecret: string): string {
  return createHmac('sha256', channelSecret).update(rawBody, 'utf8').digest('base64');
}

export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  channelSecret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = Buffer.from(signBody(rawBody, channelSecret), 'base64');
  let received: Buffer;
  try {
    received = Buffer.from(signatureHeader, 'base64');
  } catch {
    return false;
  }
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
