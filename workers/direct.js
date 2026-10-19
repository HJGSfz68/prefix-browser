import { makeShareUrl, normalizeTarget, targetFromLocation } from '/url-utils.js';
const message = document.getElementById('message');
const panel = document.getElementById('tools-panel');
const toggle = document.getElementById('floating-tools');
const input = document.getElementById('target-input');
const status = document.getElementById('tools-status');
const openTarget = document.getElementById('open-target');
const reloadPage = document.getElementById('reload-page');
let currentTarget = targetFromLocation(location);
let proxyFrame;
let proxyEngine;
let pendingTarget;
toggle.addEventListener('click', () => { panel.showModal(); toggle.setAttribute('aria-expanded', 'true'); });
document.getElementById('close-tools').addEventListener('click', () => panel.close());
panel.addEventListener('close', () => { toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
panel.addEventListener('click', event => { if (event.target === panel) { const box = panel.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) panel.close(); } });
function navigate(value) {
  const target = normalizeTarget(value);
  if (new URL(target).origin === location.origin) throw new Error('不能代理本站自身');
  currentTarget = target;
  input.value = target;
  if (!proxyFrame) {
    pendingTarget = target;
    status.textContent = '代理正在初始化，完成后会自动打开该网址';
    return;
  }
  status.textContent = '正在加载…';
  history.replaceState(null, '', makeShareUrl(location.origin, target));
  proxyFrame.go(target);
  panel.close();
}
document.getElementById('tools-form').addEventListener('submit', event => { event.preventDefault(); try { navigate(input.value); } catch (error) { status.textContent = error.message; } });
reloadPage.addEventListener('click', () => { try { navigate(currentTarget); } catch (error) { status.textContent = error.message; } });
document.getElementById('copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(makeShareUrl(location.origin, currentTarget)); status.textContent = '链接已复制'; }
  catch { status.textContent = '无法自动复制，请手动复制地址栏链接'; }
});
document.getElementById('fullscreen-page').addEventListener('click', async () => {
  if (!document.documentElement.requestFullscreen) { status.textContent = '此浏览器不支持全屏接口，当前网页已铺满可用窗口'; return; }
  try { panel.close(); if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { status.textContent = '未能切换全屏'; panel.showModal(); }
});
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('代理组件加载失败，请刷新重试'));
    document.head.append(script);
  });
}
function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
  ]);
}
try {
  const target = targetFromLocation(location);
  if (!target) throw new Error(`用法: ${location.origin}/https://目标网址`);
  if (new URL(normalizeTarget(target)).origin === location.origin) throw new Error('不能代理本站自身');
  if (!isSecureContext || !navigator.serviceWorker) throw new Error('请通过 HTTPS 访问');
  input.value = normalizeTarget(target);
  status.textContent = '正在加载移动端兼容组件…';
  if (typeof globalThis.SharedWorker === 'undefined') await loadScript('/shared-worker-polyfill.js');
  status.textContent = '正在加载代理引擎…';
  await Promise.all([loadScript('/scram/scramjet.all.js'), loadScript('/baremux/index.js')]);
  const { ScramjetController } = window.$scramjetLoadController();
  const engine = new ScramjetController({ prefix: '/service/', files: {
    wasm: '/scram/scramjet.wasm.wasm', all: '/scram/scramjet.all.js', sync: '/scram/scramjet.sync.js',
  } });
  proxyEngine = engine;
  await withTimeout(engine.init(), 20000, '代理引擎初始化超时，请刷新页面重试');
  status.textContent = '正在注册代理服务…';
  await withTimeout(navigator.serviceWorker.register('/sw.js', { scope: '/' }), 15000, '代理服务注册超时，请检查浏览器是否允许 Service Worker');
  await withTimeout(navigator.serviceWorker.ready, 15000, '代理服务启动超时，请刷新页面重试');
  if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', done); reject(new Error('初始化超时，请刷新重试')); }, 15000);
    navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
    if (navigator.serviceWorker.controller) { navigator.serviceWorker.removeEventListener('controllerchange', done); done(); }
  });
  const connection = new BareMux.BareMuxConnection('/baremux/worker.js');
  status.textContent = '正在连接代理传输层…';
  await withTimeout(connection.setTransport('/workers-transport.mjs', [{ origin: location.origin }]), 15000, '代理传输层启动超时，请刷新页面重试');
  const frame = engine.createFrame();
  proxyFrame = frame;
  openTarget.disabled = false;
  openTarget.textContent = '打开网址 ↗';
  reloadPage.disabled = false;
  frame.frame.title = '目标网页';
  frame.frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
  document.body.append(frame.frame);
  frame.frame.addEventListener('load', () => {
    message.hidden = true;
    status.textContent = '页面已载入';
    try {
      const raw = frame.frame.contentWindow.location.href;
      if (new URL(raw).pathname.startsWith('/service/')) {
        currentTarget = normalizeTarget(proxyEngine.decodeUrl(raw));
        input.value = currentTarget;
        history.replaceState(null, '', makeShareUrl(location.origin, currentTarget));
      }
    } catch {}
  });
  navigate(pendingTarget || target);
} catch (error) {
  openTarget.disabled = false;
  openTarget.textContent = '重新尝试';
  message.hidden = false;
  message.textContent = error.message || String(error);
  status.textContent = `初始化失败：${error.message || String(error)}`;
}
