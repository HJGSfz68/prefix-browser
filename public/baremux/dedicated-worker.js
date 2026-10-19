// DedicatedWorker bootstrap that emulates SharedWorker's connect event for
// bare-mux. The real bare-mux worker installs self.onconnect when imported.
const source = new URL(self.location.href).searchParams.get('source') || '/baremux/worker.js';
importScripts(source);

self.addEventListener('message', event => {
  if (event.data?.type !== 'bare-mux-connect' || !event.data.port) return;
  if (typeof self.onconnect !== 'function') throw new Error('bare-mux connect handler is unavailable');
  self.onconnect({ ports: [event.data.port] });
});
