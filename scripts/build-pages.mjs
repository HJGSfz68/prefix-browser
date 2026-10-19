import './build-workers.mjs';
import { cp, writeFile, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('pages-dist/', root);
await rm(output, { recursive: true, force: true });
await cp(new URL('dist/', root), output, { recursive: true });
// Bundle imports: dashboard direct upload does not run a bundler.
const { build } = await import('esbuild');
await build({ entryPoints: [new URL('workers/worker.js', root).pathname], outfile: new URL('_worker.js', output).pathname, bundle: true, format: 'esm', platform: 'browser', target: 'es2022' });
// Run all requests through the Worker to provide COOP/COEP on every resource.
await writeFile(new URL('_routes.json', output), JSON.stringify({
  version: 1, include: ['/*'], exclude: [],
}, null, 2));
console.log('Pages dashboard upload files built in pages-dist/');
