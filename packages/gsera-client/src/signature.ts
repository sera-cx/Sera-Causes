/**
 * Partner HMAC, matching gSera's `src/middleware/partnerAuth.ts`:
 *
 *   X-Sera-Signature: sha256=<hex HMAC-SHA256 of the raw request body>
 *
 * gSera verifies against the exact bytes it received (`req.rawBody`, captured
 * by its `express.json({ verify })` hook), so the client must sign the very
 * string it sends and never re-serialise. For a request with no body (the
 * GET wallet route) gSera's `express.json` leaves `req.body` as `{}` and the
 * guard falls back to `JSON.stringify({})`, so bodyless requests are signed
 * over the literal two-character string `{}`.
 */
import { createHmac } from 'node:crypto';

export const SIGNATURE_HEADER = 'X-Sera-Signature';

/** Raw body that stands in for "no body" when signing. */
export const EMPTY_BODY = '{}';

/** Compute the `X-Sera-Signature` header value for a raw body. */
export function signBody(hmacKey: string, rawBody: string | Uint8Array): string {
  const hex = createHmac('sha256', hmacKey).update(rawBody).digest('hex');
  return `sha256=${hex}`;
}
