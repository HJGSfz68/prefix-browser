import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { relayHttp, validateTarget, encodeMeta, targetHeaders } from '../workers/worker.js';
import Transport from '../workers/transport.mjs';

const proxy = 'https://proxy.example.org';
function relayRequest(meta, extra = {}) {
  return new Request(proxy + '/api/fetch', { method: 'POST', headers: { 'X-Proxy-Request': encodeMeta(meta), ...extra } });
}
test('Workers validates public URL and rejects recursive/private targets', () => {
  assert.equal(validateTarget('https://example.com/a', proxy).pathname, '/a');
  for (const value of ['http://127.0.0.1', 'http://169.254.169.254', 'http://[::1]', 'https://localhost', 'https://a.internal', proxy, 'file:///etc/passwd', 'https://example.com:8000']) {
    assert.throws(() => validateTarget(value, proxy), value);
  }
});
test('Workers HTTP envelope preserves 206, ranges and streamed content', async () => {
  const response = await relayHttp(relayRequest({ url: 'https://example.com/video', method: 'GET', headers: { Range: 'bytes=0-3' } }), async (url, init) => {
    assert.equal(url, 'https://example.com/video');
    assert.equal(init.headers.get('Range'), 'bytes=0-3');
    assert.equal(init.redirect, 'manual');
    return new Response('test', { status: 206, headers: { 'Content-Range': 'bytes 0-3/100', 'Content-Type': 'video/mp4', 'Set-Cookie': 'session=abc; Secure' } });
  });
  const meta = JSON.parse(decodeURIComponent(response.headers.get('X-Proxy-Response')));
  assert.equal(meta.status, 206);
  assert.equal(meta.headers['content-range'], 'bytes 0-3/100');
  assert.equal(meta.headers['content-type'], 'video/mp4');
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.deepEqual(meta.headers['set-cookie'], ['session=abc; Secure']);
  assert.equal(await response.text(), 'test');
});
test('Workers does not follow upstream redirect or buffer media', async () => {
  const response = await relayHttp(relayRequest({ url: 'https://example.com/', method: 'GET', headers: {} }), async () => new Response(null, { status: 302, headers: { Location: '/next' } }));
  const meta = JSON.parse(decodeURIComponent(response.headers.get('X-Proxy-Response')));
  assert.equal(meta.status, 302);
  assert.equal(meta.headers.location, '/next');
});
test('Workers rejects cross-origin, malformed and unsupported requests', async () => {
  const valid = { url: 'https://example.com', method: 'GET' };
  assert.equal((await relayHttp(relayRequest(valid, { Origin: 'https://other.example.com' }))).status, 403);
  assert.equal((await relayHttp(relayRequest({ ...valid, method: 'CONNECT' }))).status, 400);
  assert.equal((await relayHttp(new Request(proxy + '/api/fetch'))).status, 405);
});
test('Workers shell route preserves isolation and service worker scope', async () => {
  let assetUrl;
  const env = { ASSETS: { fetch: async req => { assetUrl = req.url; return new Response('<html>shell</html>'); } } };
  const response = await worker.fetch(new Request(proxy + '/https://example.com/a?x=1'), env);
  assert.equal(assetUrl, proxy + '/index.html');
  assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp');
  assert.equal((await worker.fetch(new Request(proxy + '/sw.js'), env)).headers.get('Service-Worker-Allowed'), '/');
});
test('transport init and header filtering', async () => {
  const transport = new Transport({ origin: proxy });
  await transport.init();
  assert.equal(transport.ready, true);
  const headers = targetHeaders({ Host: 'evil.com', Cookie: ['a=1', 'b=2'], Range: 'bytes=0-1' });
  assert.equal(headers.has('Host'), false);
  assert.equal(headers.get('Cookie'), 'a=1; b=2');
  assert.equal(headers.get('Range'), 'bytes=0-1');
});
test('root returns plain-text usage instead of a frontend page', async () => {
  const response = await worker.fetch(new Request(proxy + '/'), {});
  assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.equal(await response.text(), `用法: ${proxy}/https://目标网址`);
});
