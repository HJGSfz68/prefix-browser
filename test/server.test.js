import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../server.js';
test('server serves shell, engine assets, service worker and health', async t => {
  const app = buildApp();
  t.after(() => app.close());
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  for (const path of ['/', '/https://example.com/page?token=a%26b', '/sw.js', '/scram/scramjet.all.js', '/scram/scramjet.wasm.wasm', '/scram/scramjet.sync.js', '/baremux/worker.js', '/libcurl/index.mjs', '/healthz']) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp');
    await response.arrayBuffer();
  }
  assert.equal((await fetch(base + '/missing')).status, 404);
});
