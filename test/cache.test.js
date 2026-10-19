import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleRequest, publicStaticTTL } from '../workers/cache-policy.js';
test('cache excludes signed URLs, sessions and ranges', () => {
  const url = new URL('https://example.com/a.js');
  assert.equal(eligibleRequest({ method: 'GET' }, url), true);
  for (const headers of [{ Cookie: 's=1' }, { Authorization: 'Bearer x' }, { Range: 'bytes=0-100' }]) assert.equal(eligibleRequest({ method: 'GET', headers }, url), false);
  assert.equal(eligibleRequest({ method: 'GET' }, new URL(url + '?token=x')), false);
});
test('only explicitly public small static responses are cached', () => {
  const headers = { 'Content-Type': 'text/css', 'Content-Length': '123', 'Cache-Control': 'public, max-age=600' };
  assert.equal(publicStaticTTL(new Response('x', { headers })), 300);
  for (const extra of [{ 'Set-Cookie': 'a=1' }, { Vary: 'Accept' }, { 'Content-Type': 'video/mp4' }, { 'Content-Type': 'text/html' }, { 'Cache-Control': 'private, max-age=100' }, { 'Content-Length': '9999999' }]) assert.equal(publicStaticTTL(new Response('x', { headers: { ...headers, ...extra } })), 0);
});
