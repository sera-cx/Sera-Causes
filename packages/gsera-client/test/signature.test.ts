import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EMPTY_BODY, signBody } from '../src/index.js';

describe('signBody', () => {
  it('matches a known HMAC-SHA256 vector in the gSera header format', () => {
    const key = 'test-causes-hmac-key';
    const raw = '{"wallet":"0x1111111111111111111111111111111111111111","amount_gsera":100}';
    const expected = `sha256=${createHmac('sha256', key).update(raw).digest('hex')}`;
    expect(signBody(key, raw)).toBe(expected);
    expect(signBody(key, raw)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('is sensitive to a single byte of the body', () => {
    const key = 'k';
    expect(signBody(key, '{"a":1}')).not.toBe(signBody(key, '{"a":1 }'));
  });

  it('signs bodyless requests over the literal {} that gSera falls back to', () => {
    expect(EMPTY_BODY).toBe('{}');
    expect(signBody('k', EMPTY_BODY)).toBe(`sha256=${createHmac('sha256', 'k').update('{}').digest('hex')}`);
  });
});
