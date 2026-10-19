import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import serveStatic from '@fastify/static';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
import { libcurlPath } from '@mercuryworkshop/libcurl-transport';

logging.set_level(logging.ERROR);
Object.assign(wisp.options, {
  allow_udp_streams: false,
  allow_private_ips: false,
  allow_loopback_ips: false,
  allow_direct_ip: false,
  port_whitelist: [80, 443],
  stream_limit_total: 128,
  // wisp-js 0.4.1's optional per-host limiter iterates a non-iterable map.
  // Keep its default disabled; the total connection stream limit still applies.
  stream_limit_per_host: -1,
});

export function buildApp() {
  const app = Fastify({
    logger: false,
    serverFactory(handler) {
      const server = createServer((req, res) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        handler(req, res);
      });
      server.on('upgrade', (req, socket, head) => {
        const path = new URL(req.url, 'http://localhost').pathname;
        // Browser connections must originate from this app, not an unrelated site.
        let sameOrigin = false;
        try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch {}
        if (path === '/wisp/' && sameOrigin) wisp.routeRequest(req, socket, head);
        else socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      });
      return server;
    },
  });
  app.register(serveStatic, {
    root: fileURLToPath(new URL('./public/', import.meta.url)),
    decorateReply: true,
    setHeaders(res, path) {
      if (path.endsWith('/sw.js')) {
        res.header('Service-Worker-Allowed', '/');
        res.header('Cache-Control', 'no-store');
      }
    },
  });
  for (const [root, prefix] of [[scramjetPath, '/scram/'], [baremuxPath, '/baremux/'], [libcurlPath, '/libcurl/']]) {
    app.register(serveStatic, { root, prefix, decorateReply: false });
  }
  app.get('/healthz', async () => ({ ok: true, service: 'prefix-browser' }));
  app.get('/https://*', (req, reply) => reply.sendFile('index.html'));
  app.get('/http://*', (req, reply) => reply.sendFile('index.html'));
  app.setNotFoundHandler((req, reply) => {
    // Keep the original URL intact: the browser extracts pathname + query + hash.
    if (/^\/https?:\/\//i.test(req.raw.url)) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'Not found' });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = buildApp();
  const port = Number(process.env.PORT || 8080);
  await app.listen({ host: '0.0.0.0', port });
  console.log(`Prefix Browser listening on http://localhost:${port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await app.close(); process.exit(0); });
  }
}
