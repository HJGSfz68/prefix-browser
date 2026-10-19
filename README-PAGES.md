# Pages 控制台手动上传版

使用 prefix-browser-pages-upload.zip，不要上传 Workers 源码压缩包。

1. 登录 Cloudflare 控制台，进入 Workers & Pages。
2. 创建应用，选择 Pages，选择直接上传（Upload assets / Drag and drop）。
3. 输入项目名，例如 prefix-browser。
4. 上传 prefix-browser-pages-upload.zip；也可解压后选择包含 index.html 和 _worker.js 的整个目录。
5. 点击部署，等待出现 https://项目名.pages.dev。
6. 打开首页输入目标地址，或使用 https://项目名.pages.dev/https://目标网站.com/path。
7. 访问 /healthz，应该返回 runtime: cloudflare-workers、transport: native-fetch。若返回首页或404，检查 _worker.js 是否位于上传根目录。

ZIP 内 index.html、_worker.js、_routes.json 必须直接位于根目录，不能再套 pages-dist/ 一层。本包已经处理好，不需要安装 Node.js、执行命令、绑定 ASSETS 或配置环境变量。

高级模式的 _worker.js 使用 Pages 内置 env.ASSETS 读取静态资源；控制台直接上传支持 _worker.js，不依赖上传 functions 目录。

前端、网页代理引擎和转发后端均已打包。沿用 Workers 版验证范围：11项测试通过、部署预检通过、本地浏览器传输链路实测通过；未实际部署到用户账号，视频播放及外部WebSocket端到端尚未验证。不是任意网站或DRM视频均可播放的保证。

源码重新构建：npm ci && npm run build:pages。输出目录 pages-dist/。

官方文档：https://developers.cloudflare.com/pages/get-started/direct-upload/
