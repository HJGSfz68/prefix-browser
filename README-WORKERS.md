# 通行 · 纯 Cloudflare Workers 版

本版本不需要 VPS、Docker 或外部 Wisp 服务。Workers 托管前端，并通过原生 fetch 转发请求；Scramjet 在浏览器侧处理页面、脚本、链接与资源重写。

## 一键部署

需要 Node.js 22 和 Cloudflare 账号。在解压后的项目目录执行：

```bash
npm ci
npx wrangler login
npm run deploy:workers
```

命令会先生成 dist/，然后部署 Worker 与静态资源。终端输出的 workers.dev 地址就是入口。

访问方式：

```text
https://prefix-browser.你的账号.workers.dev/
https://prefix-browser.你的账号.workers.dev/https://目标网站.com/路径?参数=值#片段
```

也支持编码入口 `/?url=encodeURIComponent(完整目标网址)`，复杂签名链接可使用这一形式。

不是只粘贴一个 worker.js：必须同时上传 dist 静态资源，因此请使用以上 Wrangler 命令，或连接 Git 仓库配置 Workers Builds：

- 构建命令：`npm run build:workers`
- 部署命令：`npx wrangler deploy`
- 配置文件：`wrangler.jsonc`

## 本地预览

```bash
npm ci
npm run dev:workers
```

打开 `http://localhost:8787`。公网访问需 HTTPS。

## 自定义域名

部署后进入 Cloudflare 控制台 → Workers & Pages → prefix-browser → Settings → Domains & Routes，添加你账户下的自定义域名。入口会自动使用当前域名。

## 文件与命令

- `workers/worker.js`：静态入口、HTTP 流式转发、WebSocket 转发。
- `workers/transport.mjs`：适配 bare-mux 的原生 fetch 传输层。
- `scripts/build-workers.mjs`：复制固定版本引擎资源，并切换前端传输。
- `wrangler.jsonc`：Workers 与 ASSETS 绑定配置。
- `npm test`：自动化测试。
- `npm run check:workers`：构建和 Wrangler 部署预检，不发布。

原 Node.js 版本的 `npm start` 与 Docker 文件仍然保留；它们不是 Workers 的启动入口。

## 实现范围

- 代理 HTTP/HTTPS 请求、表单/API 请求、手动重定向交由引擎处理。
- 响应体流式返回，透传 Range 请求；206、Content-Range、Location 和目标 Cookie 通过传输元数据返回引擎，不写入代理域名 Cookie。
- 提供 WebSocket 升级转发实现，尚未完成外部 WebSocket 端到端验证。
- 不做共享响应缓存，避免混用不同访问会话。
- 上游仅接受公网 DNS 主机名和 80/443 端口。
- 不支持 raw TCP、UDP、WebRTC 传输或自动获取 DRM 授权。
- 原生 fetch 的请求头、TLS 指纹、网络策略与服务器直连不同，目标站的反机器人、验证页面或登录流程可能不兼容。
- 网页视频取决于目标站点和浏览器编码支持；没有进行视频播放、拖动及清晰度切换的完整测试。
- 此版本不提供跨平台浏览器兼容保证；优先使用支持 SharedWorker 的新版桌面 Chromium。
- 没有你的 Cloudflare 账号凭证，尚未实际发布到你的 workers.dev 域名。

## 本次验证

11 项自动化测试通过；Wrangler deploy --dry-run 通过。已通过本地 Workers/workerd + Chromium 验证前缀初始化、原生 fetch 传输、Cloudflare trace 页面实际载入；example.com 在本地 workerd 网络中出现连接等待，未将其标为通过。视频与完整站点兼容性未测。

## 官方参考

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/runtime-apis/fetch/
- https://developers.cloudflare.com/workers/runtime-apis/websockets/
- https://github.com/MercuryWorkshop/Scramjet-App

浏览器引擎依赖固定在与现有前端兼容的 Scramjet 1.1.0 和 bare-mux 2.1.9。两者的新版迁移不是本次改造范围。
