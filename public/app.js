import { normalizeTarget, targetFromLocation, makeShareUrl } from '/url-utils.js';

const $ = id => document.getElementById(id);
let engine;
let frame;
let activeTarget;
let readyPromise;
let busy = false;
let loadTimer;
const scripts = new Map();
function loadScript(src) {
  if (!scripts.has(src)) scripts.set(src, new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => { scripts.delete(src); script.remove(); reject(new Error('代理组件加载失败，请重试')); };
    document.head.append(script);
  }));
  return scripts.get(src);
}
function toggleTools(open = !document.body.classList.contains('tools-open')) {
  document.body.classList.toggle('tools-open', open);
  $('toggle-tools').setAttribute('aria-expanded', String(open));
  $('toggle-tools').setAttribute('aria-label', open ? '收起访问工具栏' : '展开访问工具栏');
}
$('prefix-example').textContent = `${location.origin}/https://example.com`;

function setStatus(text) { $('status').textContent = text; }
function showError(error) { clearTimeout(loadTimer); if (document.body.classList.contains('browsing')) toggleTools(true); $('error').hidden = false; $('error').textContent = error.message || String(error); setStatus('连接未完成'); }

async function initialize() {
  if (!window.isSecureContext || !navigator.serviceWorker) throw new Error('请通过 HTTPS 或 http://localhost:8080 打开；此环境需要 Service Worker。');
  if (!window.crossOriginIsolated) throw new Error('缺少跨源隔离响应头，请检查反向代理是否保留 COOP / COEP。');
  await Promise.all([loadScript('/scram/scramjet.all.js'), loadScript('/baremux/index.js')]);
  const { ScramjetController } = window.$scramjetLoadController();
  engine = new ScramjetController({
    prefix: '/service/',
    files: { wasm: '/scram/scramjet.wasm.wasm', all: '/scram/scramjet.all.js', sync: '/scram/scramjet.sync.js' },
  });
  await engine.init();
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', changed); reject(new Error('代理初始化超时，请刷新页面重试')); }, 15000);
      function changed() { clearTimeout(timeout); resolve(); }
      navigator.serviceWorker.addEventListener('controllerchange', changed, { once: true });
      if (navigator.serviceWorker.controller) { clearTimeout(timeout); navigator.serviceWorker.removeEventListener('controllerchange', changed); resolve(); }
    });
  }
  const connection = new BareMux.BareMuxConnection('/baremux/worker.js');
  await connection.setTransport('/libcurl/index.mjs', [{ websocket: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/` }]);
  frame = engine.createFrame();
  frame.frame.title = '代理网页';
  frame.frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
  frame.frame.setAttribute('allowfullscreen', '');
  $('viewport').append(frame.frame);
  frame.frame.addEventListener('load', () => {
    clearTimeout(loadTimer);
    setStatus('页面已载入');
    // Read the encoded frame URL rather than target-controlled window properties.
    try {
      const path = new URL(frame.frame.contentWindow.location.href).pathname;
      if (path.startsWith('/service/')) {
        const value = normalizeTarget(engine.decodeUrl(frame.frame.contentWindow.location.href));
        activeTarget = value;
        $('address').value = value;
        history.replaceState(null, '', makeShareUrl(location.origin, value));
      }
    } catch { /* Some cross-origin navigations cannot be read. */ }
  });
}

async function navigate(input) {
  if (busy) return;
  busy = true;
  $('go').disabled = true;
  $('error').hidden = true;
  try {
    const target = normalizeTarget(input);
    if (new URL(target).origin === location.origin) throw new Error('请输入目标网站地址，不要代理本站自身');
    setStatus('正在初始化代理…');
    if (!readyPromise) readyPromise = initialize().catch(error => { readyPromise = null; throw error; });
    await readyPromise;
    activeTarget = target;
    $('address').value = target;
    document.body.classList.add('browsing');
    for (const id of ['welcome', 'features', 'footer']) $(id).hidden = true;
    for (const id of ['viewport', 'reload', 'fullscreen']) $(id).hidden = false;
    $('toggle-tools').hidden = false;
    toggleTools(false);
    history.replaceState(null, '', makeShareUrl(location.origin, target));
    setStatus('正在加载网页…');
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => { showError(new Error('目标网页仍在加载，可继续等待或重新加载。')); }, 30000);
    frame.go(target);
  } catch (error) { showError(error); }
  finally { busy = false; $('go').disabled = false; }
}

$('address-form').addEventListener('submit', event => { event.preventDefault(); navigate($('address').value); });
$('reload').addEventListener('click', () => { if (activeTarget) navigate(activeTarget); });
$('fullscreen').addEventListener('click', async () => { try { await $('viewport').requestFullscreen(); } catch (error) { showError(error); } });
$('toggle-tools').addEventListener('click', () => toggleTools());
document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyL') {
    event.preventDefault();
    if (document.body.classList.contains('browsing')) toggleTools();
  }
});
$('copy').addEventListener('click', async () => {
  try {
    const target = normalizeTarget($('address').value || activeTarget || 'https://example.com');
    await navigator.clipboard.writeText(`${location.origin}/${target}`);
    $('copy').textContent = '已复制 ✓';
    setTimeout(() => { $('copy').textContent = '复制访问链接'; }, 1800);
  } catch (error) { showError(error); }
});
try {
  const target = targetFromLocation(location);
  if (target) navigate(target);
} catch (error) { showError(error); }
