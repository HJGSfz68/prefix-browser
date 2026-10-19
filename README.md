# 通行 · Prefix Browser V5

基于 Scramjet 的前缀式网页代理，支持 Cloudflare Pages 手动上传和 Cloudflare Workers 部署，无需独立 VPS / Wisp 后端。

## 下载即用：Pages 手动部署

1. 在 [Releases](https://github.com/HJGSfz68/prefix-browser/releases) 下载 `prefix-browser-pages-v5-floating-upload.zip`，不要下载 GitHub 自动生成的源码 ZIP 来直接部署。
2. Cloudflare → Workers & Pages → 创建 Pages → 直接上传。
3. 上传 ZIP 并部署；无需构建命令、环境变量或手动添加 ASSETS 绑定。
4. 访问 `https://项目名.pages.dev/healthz`，确认 `version` 为 `pages-floating-v5`。

ZIP 内 `_worker.js`、`_routes.json`、`index.html` 应直接位于根目录。

## 使用

直接打开根域名仅返回纯文本：

```text
用法: https://你的域名/https://目标网址
```

访问目标网页：

```text
https://你的域名/https://example.com/path?key=value#section
```

也支持 `/?url=` 后接 URL 编码后的目标网址。

代理页面铺满窗口，右下角悬浮按钮提供网址输入、复制链接、重新加载、全屏。PC 使用紧凑面板，移动端加大触控区域并预留安全区。全屏依赖浏览器支持。

## 从源码构建

需要 Node.js 22。

```bash
npm ci
npm test
npm run build:pages
```

生成 `pages-dist/`，将**其中的内容**压缩为 ZIP 后上传 Pages。

```bash
# 本地预览 Pages
npx wrangler pages dev pages-dist --port 8788

# 部署 Workers
npx wrangler login
npm run deploy:workers

# 部署预检（不发布）
npm run check:workers
```

仓库内 `public/`、`server.js` 及 Docker 文件保留早期 Node.js 版本；V5 Pages/Workers 的入口在 `workers/direct.html` 和 `workers/direct.js`，不是 `public/index.html`。

## 目录

| 路径 | 用途 |
| --- | --- |
| `workers/worker.js` | 根地址用法提示、前缀入口、HTTP/WebSocket 转发 |
| `workers/direct.*` | V5 极简浏览容器和响应式悬浮工具 |
| `workers/transport.mjs` | bare-mux 原生 fetch 传输适配 |
| `workers/cache-policy.js` | 保守的公开静态资源缓存策略 |
| `scripts/build-workers.mjs` | 提取运行时文件、压缩、构建 Workers 静态资源 |
| `scripts/build-pages.mjs` | 打包单文件 `_worker.js` 与 Pages 静态资源 |
| `test/` | URL、转发、缓存和入口回归测试 |
| `wrangler.jsonc` | Workers 部署配置 |

## 性能和兼容性

- 按需加载引擎，不打包 source maps、类型声明和未使用的引擎文件。
- 视频响应流式转发，透传 Range 和上游 206 元数据。
- 只缓存明确公开的小型静态响应；跳过 Cookie、Authorization、Range 和带查询参数的请求。
- 不提供视频转码、DRM 授权、WebRTC、raw TCP 或任意站点兼容保证。
- 支持公共 DNS 域名及 80/443 端口。目标站验证流程、Cloudflare 出站策略和浏览器能力可能影响访问。
- 桌面 Chromium 优先；手机响应式样式已实现，但尚未进行手机真机验收。
- 14 项自动化测试及部署预检通过；视频播放和外部 WebSocket 端到端尚未验证。
- 悬浮工具的当前地址同步是尽力而为，某些跨源跳转可能无法读取。

## 开源与上游

原始集成代码使用 MIT；第三方组件保留各自许可。详见 [LICENSE](LICENSE) 与 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。构建产物包含组件许可与源码链接。

感谢 [Mercury Workshop](https://github.com/MercuryWorkshop) 的 Scramjet、bare-mux 等项目。本仓库不是这些上游项目的官方发行版。
