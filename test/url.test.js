import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTarget, targetFromLocation, makeShareUrl } from '../public/url-utils.js';
test('normalizes bare domain', () => assert.equal(normalizeTarget('example.com/a'), 'https://example.com/a'));
test('preserves encoded signatures, query and fragment', () => {
  const original = 'https://example.com/a%2Fb?token=a%26b&x=1#part';
  assert.equal(targetFromLocation(new URL('https://proxy.test/' + original)), original);
});
test('encoded entry round trips', () => {
  const original = 'https://example.com/a?x=%2F#section';
  assert.equal(targetFromLocation(new URL(makeShareUrl('https://proxy.test', original))), original);
  assert.equal(makeShareUrl('https://proxy.test', original), `https://proxy.test/${original}`);
});
test('rejects unsupported schemes and credentials', () => {
  for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com:8081']) assert.throws(() => normalizeTarget(value));
});
