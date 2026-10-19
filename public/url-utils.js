export function normalizeTarget(value) {
  const input = value.trim();
  if (!input) throw new Error('请输入需要访问的网址');
  const explicitScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
  const url = new URL(explicitScheme ? input : `https://${input}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('只支持不含账号密码的 HTTP / HTTPS 网址');
  }
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('只支持 80 / 443 端口');
  return url.href;
}

export function targetFromLocation(location) {
  if (/^\/https?:\/\//i.test(location.pathname)) {
    return normalizeTarget(location.pathname.slice(1) + location.search + location.hash);
  }
  const value = new URLSearchParams(location.search).get('url');
  return value ? normalizeTarget(value) : null;
}

export function makeShareUrl(origin, target) {
  return `${origin}/?url=${encodeURIComponent(normalizeTarget(target))}`;
}
