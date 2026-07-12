import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { requireAuthHeader, verifyWebhookSignature } from './webhook.js';

describe('verifyWebhookSignature', () => {
  it('accepts a matching hmac signature', () => {
    const payload = '{"ok":true}';
    const signingKey = 'test-signing-key';
    const signature = `sha256=${createHmac('sha256', signingKey).update(payload).digest('hex')}`;
    expect(verifyWebhookSignature(payload, signature, signingKey)).toBe(true);
  });

  it('rejects a bad signature', () => {
    expect(verifyWebhookSignature('x', 'sha256=nope', 'signing-key')).toBe(false);
  });
});

describe('requireAuthHeader', () => {
  it('returns token value from bearer header', () => {
    expect(requireAuthHeader('Bearer abc')).toBe('abc');
  });
});
