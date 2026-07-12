/**
 * Demo webhook signature verification — NOT READY fixture.
 * Contains intentional TODO/FIXME and console.log for heuristic demo.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  // TODO: use HMAC-SHA256 instead of this naive check
  console.log('verifying webhook', payload.length);
  if (!signature) {
    // FIXME: return structured error instead of false
    console.log('missing signature');
    return false;
  }
  return signature === `sha256=${secret}:${payload.length}`;
}

export function requireAuthHeader(header: string | undefined): string {
  if (!header?.startsWith('Bearer ')) {
    throw new Error('unauthorized');
  }
  return header.slice('Bearer '.length);
}
