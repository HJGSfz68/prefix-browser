// Minimal SharedWorker compatibility layer for browsers that only provide
// DedicatedWorker (notably older mobile Safari and embedded WebViews).
// It is intentionally scoped to bare-mux: every connection gets a fresh
// MessagePort, while all connections in the page share one dedicated worker.
(() => {
  if (typeof globalThis.SharedWorker !== 'undefined') return;

  const workers = new Map();

  class SharedWorkerCompat {
    constructor(scriptURL, options = {}) {
      const source = new URL(String(scriptURL), location.href);
      const name = typeof options === 'string' ? options : (options.name || '');
      const key = `${source.href}::${name}`;
      let worker = workers.get(key);

      if (!worker) {
        const bootstrap = new URL('/baremux/dedicated-worker.js', location.origin);
        bootstrap.searchParams.set('source', source.href);
        worker = new Worker(bootstrap.href);
        workers.set(key, worker);
      }

      const channel = new MessageChannel();
      this.port = channel.port1;
      this.port.start?.();
      worker.postMessage({ type: 'bare-mux-connect', port: channel.port2 }, [channel.port2]);
    }
  }

  Object.defineProperty(globalThis, 'SharedWorker', {
    configurable: true,
    writable: true,
    value: SharedWorkerCompat,
  });
})();
