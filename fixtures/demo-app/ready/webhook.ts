/**
 * Demo webhook signature verification — READY fixture.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  signingKey: string,
): boolean {
  const expected = `sha256=${createHmac('sha256', signingKey).update(payload).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function requireAuthHeader(header: string | undefined): string {
  if (!header?.startsWith('Bearer ')) {
    throw new Error('unauthorized');
  }
  return header.slice('Bearer '.length);
}
