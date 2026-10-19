import { normalizeTarget, targetFromLocation } from '/url-utils.js';
const message = document.getElementById('message');
const panel = document.getElementById('tools-panel');
const toggle = document.getElementById('floating-tools');
const input = document.getElementById('target-input');
const status = document.getElementById('tools-status');
let currentTarget = targetFromLocation(location);
let proxyFrame;
let proxyEngine;
toggle.addEventListener('click', () => { panel.showModal(); toggle.setAttribute('aria-expanded', 'true'); });
document.getElementById('close-tools').addEventListener('click', () => panel.close());
panel.addEventListener('close', () => { toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
panel.addEventListener('click', event => { if (event.target === panel) { const box = panel.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) panel.close(); } });
function navigate(value) {
  if (!proxyFrame) throw new Error('代理仍在初始化，请稍后重试');
  const target = normalizeTarget(value);
  if (new URL(target).origin === location.origin) throw new Error('不能代理本站自身');
  currentTarget = target;
  input.value = target;
  status.textContent = '正在加载…';
  history.replaceState(null, '', `/?url=${encodeURIComponent(target)}`);
  proxyFrame.go(target);
  panel.close();
}
document.getElementById('tools-form').addEventListener('submit', event => { event.preventDefault(); try { navigate(input.value); } catch (error) { status.textContent = error.message; } });
document.getElementById('reload-page').addEventListener('click', () => { try { navigate(currentTarget); } catch (error) { status.textContent = error.message; } });
document.getElementById('copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${location.origin}/${currentTarget}`); status.textContent = '链接已复制'; }
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
try {
  const target = targetFromLocation(location);
  if (!target) throw new Error(`用法: ${location.origin}/https://目标网址`);
  if (new URL(normalizeTarget(target)).origin === location.origin) throw new Error('不能代理本站自身');
  if (!isSecureContext || !navigator.serviceWorker) throw new Error('请通过 HTTPS 访问');
  await Promise.all([loadScript('/scram/scramjet.all.js'), loadScript('/baremux/index.js')]);
  const { ScramjetController } = window.$scramjetLoadController();
  const engine = new ScramjetController({ prefix: '/service/', files: {
    wasm: '/scram/scramjet.wasm.wasm', all: '/scram/scramjet.all.js', sync: '/scram/scramjet.sync.js',
  } });
  proxyEngine = engine;
  await engine.init();
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', done); reject(new Error('初始化超时，请刷新重试')); }, 15000);
    navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
    if (navigator.serviceWorker.controller) { navigator.serviceWorker.removeEventListener('controllerchange', done); done(); }
  });
  const connection = new BareMux.BareMuxConnection('/baremux/worker.js');
  await connection.setTransport('/workers-transport.mjs', [{ origin: location.origin }]);
  const frame = engine.createFrame();
  proxyFrame = frame;
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
        history.replaceState(null, '', `/?url=${encodeURIComponent(currentTarget)}`);
      }
    } catch {}
  });
  navigate(target);
} catch (error) { message.hidden = false; message.textContent = error.message || String(error); }
