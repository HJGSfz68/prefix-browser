import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const name of ['index.html', 'app.js', 'style.css', 'clean.css', 'url-utils.js', 'sw.js']) {
  await cp(new URL(`public/${name}`, root), new URL(name, dist));
}
// Copy only runtime files, excluding source maps, declarations and unused bundles.
for (const [source, prefix, names] of [
  [scramjetPath, 'scram', ['scramjet.all.js', 'scramjet.sync.js', 'scramjet.wasm.wasm']],
  [baremuxPath, 'baremux', ['index.js', 'worker.js']],
]) {
  await mkdir(new URL(`${prefix}/`, dist), { recursive: true });
  for (const name of names) await cp(`${source}/${name}`, new URL(`${prefix}/${name}`, dist));
}
await cp(new URL('workers/transport.mjs', root), new URL('workers-transport.mjs', dist));
await mkdir(new URL('licenses/', dist), { recursive: true });
await cp(new URL('node_modules/@mercuryworkshop/scramjet/LICENSE', root), new URL('licenses/scramjet.txt', dist));
await cp(new URL('node_modules/@mercuryworkshop/bare-mux/LICENSE', root), new URL('licenses/bare-mux.txt', dist));
await cp(new URL('THIRD-PARTY-NOTICES.md', root), new URL('licenses/NOTICE.txt', dist));
let app = await readFile(new URL('app.js', dist), 'utf8');
const original = "await connection.setTransport('/libcurl/index.mjs', [{ websocket: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/` }]);";
if (!app.includes(original)) throw new Error('Frontend transport initialization changed: update build-workers.mjs');
app = app.replace(original, "await connection.setTransport('/workers-transport.mjs', [{ origin: location.origin }]);");
await writeFile(new URL('app.js', dist), app);
let html = await readFile(new URL('index.html', dist), 'utf8');
html = html.replace('Powered by Scramjet + Wisp', 'Powered by Scramjet + Cloudflare Workers');
await writeFile(new URL('index.html', dist), html);
// Direct-only edition: no landing page, navigation bar, floating controls or CSS assets.
await cp(new URL('workers/direct.html', root), new URL('index.html', dist));
await cp(new URL('workers/direct.js', root), new URL('direct.js', dist));
for (const name of ['app.js', 'style.css', 'clean.css']) await rm(new URL(name, dist));
const { transform } = await import('esbuild');
for (const [name, loader] of [['direct.js', 'js'], ['url-utils.js', 'js'], ['sw.js', 'js'], ['workers-transport.mjs', 'js']]) {
  const result = await transform(await readFile(new URL(name, dist), 'utf8'), { loader, minify: true, target: 'es2022' });
  await writeFile(new URL(name, dist), result.code);
}
console.log('Workers assets built in dist/');
