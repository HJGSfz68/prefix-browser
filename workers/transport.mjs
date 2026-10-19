// bare-mux v2 transport: HTTP uses a streamed POST envelope, not Wisp/TCP.
export default class WorkersTransport {
  ready = false;
  constructor(options = {}) { this.origin = options.origin; }
  async init() {
    if (!this.origin) throw new Error('Worker origin is required');
    this.ready = true;
  }
  meta() { return {}; }
  async request(remote, method, body, headers, signal) {
    const metadata = encodeURIComponent(JSON.stringify({ url: remote.href, method, headers }));
    const options = {
      method: 'POST',
      headers: { 'X-Proxy-Request': metadata, 'Content-Type': 'application/octet-stream' },
      body: ['GET', 'HEAD'].includes(method) ? null : body,
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
    };
    if (typeof ReadableStream !== 'undefined' && options.body instanceof ReadableStream) options.duplex = 'half';
    const response = await fetch(`${this.origin}/api/fetch`, options);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `Worker HTTP ${response.status}` }));
      throw new Error(error.error);
    }
    const raw = response.headers.get('X-Proxy-Response');
    if (!raw) throw new Error('Worker response metadata is missing');
    const meta = JSON.parse(decodeURIComponent(raw));
    return { ...meta, body: response.body || new ArrayBuffer(0) };
  }
  connect(url, protocols, requestHeaders, onopen, onmessage, onclose, onerror) {
    const endpoint = new URL('/api/ws', this.origin);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    endpoint.searchParams.set('meta', encodeURIComponent(JSON.stringify({ url: url.href, headers: requestHeaders })));
    const socket = new WebSocket(endpoint, protocols);
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('open', () => onopen(socket.protocol));
    socket.addEventListener('message', event => onmessage(event.data));
    socket.addEventListener('close', event => onclose(event.code, event.reason));
    socket.addEventListener('error', () => onerror('Worker WebSocket connection failed'));
    return [(data) => socket.send(data), (code, reason) => socket.close(code, reason)];
  }
}
