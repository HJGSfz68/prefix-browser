export function eligibleRequest(meta, target) {
  const headers = new Headers(Object.entries(meta.headers || {}).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)]));
  return meta.method === 'GET' && !target.search &&
    !['cookie', 'authorization', 'range', 'if-range', 'if-none-match', 'if-modified-since', 'cache-control'].some(name => headers.has(name));
}

export function publicStaticTTL(response) {
  if (response.status !== 200 || response.headers.has('Set-Cookie') || response.headers.has('Vary')) return 0;
  const control = response.headers.get('Cache-Control') || '';
  if (!/(?:^|,)\s*public(?:\s*,|\s*$)/i.test(control) || /(?:private|no-store|no-cache)/i.test(control)) return 0;
  const type = response.headers.get('Content-Type') || '';
  if (!/^(?:text\/css|(?:text|application)\/(?:javascript|x-javascript)|image\/(?!svg)|font\/|application\/font)/i.test(type)) return 0;
  const size = Number(response.headers.get('Content-Length'));
  if (!size || size > 2 * 1024 * 1024) return 0;
  const ttl = /(?:^|,)\s*(?:s-maxage|max-age)=(\d+)/i.exec(control);
  return ttl ? Math.max(0, Math.min(300, Number(ttl[1]) - Number(response.headers.get('Age') || 0))) : 0;
}

export async function cacheKey(request, metadata) {
  const bytes = new TextEncoder().encode(JSON.stringify(metadata));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return new Request(`${new URL(request.url).origin}/__proxy_cache_v2/${hash}`);
}
