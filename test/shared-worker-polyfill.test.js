import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('SharedWorker compatibility layer reuses one dedicated worker and returns ports', async () => {
  const source = await readFile(new URL('../public/shared-worker-polyfill.js', import.meta.url), 'utf8');
  const workers = [];
  let nextPort = 0;

  class FakeWorker {
    constructor(url) { this.url = url; this.messages = []; workers.push(this); }
    postMessage(message, transfer) { this.messages.push({ message, transfer }); }
  }
  class FakeMessageChannel {
    constructor() {
      this.port1 = { id: ++nextPort, start() {} };
      this.port2 = { id: ++nextPort };
    }
  }

  const context = {
    URL,
    location: { href: 'https://proxy.example/', origin: 'https://proxy.example' },
    Worker: FakeWorker,
    MessageChannel: FakeMessageChannel,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);

  const first = new context.SharedWorker('/baremux/worker.js', 'bare-mux-worker');
  const second = new context.SharedWorker('/baremux/worker.js', 'bare-mux-worker');
  assert.equal(workers.length, 1);
  assert.notEqual(first.port, second.port);
  assert.equal(workers[0].messages.length, 2);
  assert.equal(workers[0].messages[0].message.type, 'bare-mux-connect');
  assert.equal(workers[0].messages[0].transfer.length, 1);
  assert.equal(workers[0].messages[0].transfer[0], workers[0].messages[0].message.port);
  assert.match(workers[0].url, /^https:\/\/proxy\.example\/baremux\/dedicated-worker\.js\?source=/);
});

test('SharedWorker compatibility layer preserves native implementation', async () => {
  const source = await readFile(new URL('../public/shared-worker-polyfill.js', import.meta.url), 'utf8');
  class NativeSharedWorker {}
  const context = { SharedWorker: NativeSharedWorker };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  assert.equal(context.SharedWorker, NativeSharedWorker);
});

test('dedicated worker bootstrap imports bare-mux and forwards connect ports', async () => {
  const source = await readFile(new URL('../public/baremux/dedicated-worker.js', import.meta.url), 'utf8');
  const imported = [];
  const listeners = {};
  const connected = [];
  const context = {
    URL,
    self: {
      location: { href: 'https://proxy.example/baremux/dedicated-worker.js?source=%2Fbaremux%2Fworker.js' },
      addEventListener(type, listener) { listeners[type] = listener; },
      onconnect(event) { connected.push(event.ports[0]); },
    },
    importScripts(url) { imported.push(url); },
    Error,
  };
  vm.runInNewContext(source, context);
  const port = { id: 1 };
  listeners.message({ data: { type: 'bare-mux-connect', port } });
  assert.equal(imported[0], '/baremux/worker.js');
  assert.equal(connected[0], port);
});
