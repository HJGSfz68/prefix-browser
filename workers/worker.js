import { eligibleRequest, publicStaticTTL, cacheKey } from './cache-policy.js';
const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const HOP_HEADERS = new Set([
  'host', 'connection', 'upgrade', 'content-length', 'transfer-encoding',
  'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
  'accept-encoding', 'cf-connecting-ip', 'cf-worker', 'cf-ray',
  'x-forwarded-for', 'x-real-ip',
]);

export function validateTarget(value, ownOrigin, websocket = false) {
  const target = new URL(value);
  const allowed = websocket ? ['ws:', 'wss:'] : ['http:', 'https:'];
  if (!allowed.includes(target.protocol) || target.username || target.password) throw new Error('Unsupported target URL');
  const hostname = target.hostname.toLowerCase();
  // Only public DNS names. Native fetch also applies the platform's network restrictions.
  if (!hostname.includes('.') || /^[\d.]+$/.test(hostname) || hostname.includes(':') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(hostname)) throw new Error('Public hostname required');
  if (target.port && !['80', '443'].includes(target.port)) throw new Error('Only ports 80 and 443 are supported');
  if (hostname === new URL(ownOrigin).hostname) throw new Error('Recursive proxy target');
  return target;
}

export function targetHeaders(raw = {}) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    const lower = name.toLowerCase();
    if (HOP_HEADERS.has(lower) || lower.startsWith('sec-websocket-')) continue;
    headers.set(name, Array.isArray(value) ? value.join(lower === 'cookie' ? '; ' : ', ') : String(value));
  }
  return headers;
}

export function encodeMeta(meta) { return encodeURIComponent(JSON.stringify(meta)); }
function decodeMeta(value) {
  if (!value || value.length > 48000) throw new Error('Missing or oversized metadata');
  return JSON.parse(decodeURIComponent(value));
}
function json(data, status = 200) {
  return Response.json(data, { status, headers: { ...ISOLATION, 'Cache-Control': 'no-store' } });
}
function checkOrigin(request) {
  const own = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin && origin !== own) return false;
  return !['cross-site', 'same-site'].includes(request.headers.get('Sec-Fetch-Site'));
}

export async function relayHttp(request, upstreamFetch = fetch, context = null, cache = null) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (!checkOrigin(request)) return json({ error: 'Origin denied' }, 403);
  let meta;
  let target;
  try {
    meta = decodeMeta(request.headers.get('X-Proxy-Request'));
    target = validateTarget(meta.url, request.url);
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(meta.method)) throw new Error('Unsupported method');
  } catch (error) { return json({ error: error.message }, 400); }

  try {
    const started = performance.now();
    const key = cache && context && eligibleRequest(meta, target) ? await cacheKey(request, meta) : null;
    if (key) {
      const cached = await cache.match(key);
      if (cached) {
        const response = new Response(cached.body, cached);
        response.headers.set('Cache-Control', 'no-store');
        response.headers.set('X-Proxy-Cache', 'HIT');
        response.headers.set('Server-Timing', `edge;dur=${Math.round(performance.now() - started)}`);
        return response;
      }
    }
    const upstream = await upstreamFetch(target.href, {
      method: meta.method,
      headers: targetHeaders(meta.headers),
      body: ['GET', 'HEAD'].includes(meta.method) ? null : request.body,
      redirect: 'manual',
      signal: request.signal,
    });
    const headers = Object.fromEntries(upstream.headers);
    // Keep Set-Cookie in metadata, never on the proxy origin itself.
    const cookies = upstream.headers.getSetCookie?.();
    if (cookies?.length) headers['set-cookie'] = cookies;
    // fetch() returns decoded bytes. Do not claim that they remain compressed.
    delete headers['content-encoding'];
    delete headers['content-length'];
    const responseHeaders = new Headers({
      ...ISOLATION,
      // Text envelope remains non-executable but is eligible for text compression.
      'Content-Type': /^(text\/|application\/(?:javascript|json|xml|x-javascript))/i.test(headers['content-type'] || '') ? 'text/plain; charset=utf-8' : 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Proxy-Cache': key ? 'MISS' : 'BYPASS',
      'X-Proxy-Upstream-Status': String(upstream.status),
      'X-Proxy-Upstream-Range': upstream.headers.get('Content-Range') || 'none',
      'Server-Timing': `upstream;dur=${Math.round(performance.now() - started)}`,
      'X-Proxy-Response': encodeMeta({ status: upstream.status, statusText: upstream.statusText, headers }),
    });
    const response = new Response(meta.method === 'HEAD' ? null : upstream.body, { status: 200, headers: responseHeaders });
    const ttl = key ? publicStaticTTL(upstream) : 0;
    if (ttl > 0) {
      const stored = response.clone();
      stored.headers.set('Cache-Control', `public, max-age=${ttl}`);
      context.waitUntil(cache.put(key, stored).catch(error => console.error('Static cache write failed', error.message)));
    }
    return response;
  } catch (error) { return json({ error: `Upstream fetch failed: ${error.message}` }, 502); }
}

export async function relayWebSocket(request, upstreamFetch = fetch) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket upgrade required' }, 426);
  if (!checkOrigin(request) || request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Origin denied' }, 403);
  let target;
  let headers;
  try {
    const meta = decodeMeta(new URL(request.url).searchParams.get('meta'));
    target = validateTarget(meta.url, request.url, true);
    headers = targetHeaders(meta.headers);
    headers.set('Upgrade', 'websocket');
    const protocols = request.headers.get('Sec-WebSocket-Protocol');
    if (protocols) headers.set('Sec-WebSocket-Protocol', protocols);
  } catch (error) { return json({ error: error.message }, 400); }
  target.protocol = target.protocol === 'wss:' ? 'https:' : 'http:';
  try {
    const response = await upstreamFetch(target.href, { headers, redirect: 'manual' });
    if (response.status !== 101 || !response.webSocket) return json({ error: `Upstream refused WebSocket: ${response.status}` }, 502);
    return response;
  } catch (error) { return json({ error: error.message }, 502); }
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname === '/api/fetch') return relayHttp(request, fetch, context, globalThis.caches?.default);
    if (url.pathname === '/api/ws') return relayWebSocket(request);
    if (url.pathname === '/healthz') return json({ ok: true, runtime: 'cloudflare-workers', transport: 'native-fetch', version: 'pages-floating-v5' });
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
    if (url.pathname === '/' && !url.searchParams.get('url')) {
      return new Response(request.method === 'HEAD' ? null : `用法: ${url.origin}/https://目标网址`, {
        headers: { ...ISOLATION, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    if (/^\/https?:\/\//i.test(url.pathname)) { url.pathname = '/index.html'; url.search = ''; }
    const asset = await env.ASSETS.fetch(new Request(url, { method: request.method }));
    const response = new Response(asset.body, asset);
    for (const [name, value] of Object.entries(ISOLATION)) response.headers.set(name, value);
    if (url.pathname === '/sw.js') {
      response.headers.set('Service-Worker-Allowed', '/');
      response.headers.set('Cache-Control', 'no-store');
    } else if (/^\/(?:scram|baremux)\//.test(url.pathname)) {
      response.headers.set('Cache-Control', 'public, max-age=86400');
    } else if (/\.(?:js|mjs|css)$/.test(url.pathname)) {
      response.headers.set('Cache-Control', 'public, max-age=300');
    }
    return response;
  },
};
