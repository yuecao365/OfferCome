# OfferLai

OfferLai 是一个本地优先的求职管理工具，用于管理岗位投递、简历、真实面试、AI 模拟面试、面试复盘和能力画像。

## 数据与隐私

- 正式使用时，SQLite 数据库、简历文件和 Boss 登录状态默认保存在用户自己的设备中。
- `.local/`、SQLite 文件和 `.env*` 不应提交到 Git。
- Boss 登录、扫码、验证码和安全校验必须由用户本人在本机完成。
- AI 功能会把完成任务所需的内容发送给用户配置的模型服务商。

## 本机开发

环境要求：Node.js 22 或更高版本、npm、Chrome 或 Edge。

```powershell
Copy-Item .env.example .env.local
npm ci
npm run db:push
npm run dev
```

打开 <http://localhost:3000>。

Boss 同步命令：

```powershell
npm run boss:login
npm run boss:sync -- --dry-run
npm run boss:sync
```

## Docker 本地部署

Docker 版本会持久化以下内容：

- SQLite 数据库：Docker Volume `offerlai-data`
- 简历与本地运行文件：Docker Volume `offerlai-local`

从源码构建并启动：

```bash
docker compose up -d --build
```

使用发布到 GHCR 的镜像：

```bash
docker pull ghcr.io/yuecao365/offerlai:latest
docker compose up -d
```

打开 <http://localhost:3000>。

查看日志或停止服务：

```bash
docker compose logs -f offerlai
docker compose down
```

`docker compose down` 不会删除数据卷。只有显式执行 `docker compose down -v` 才会删除本地数据。

### Docker 中的 Boss 同步限制

Boss 登录需要在用户桌面弹出有头 Chrome/Edge，并允许用户手动处理安全校验。普通 Docker 容器无法自然访问宿主机桌面，因此当前 Docker 版本适合使用岗位、简历、面试和 AI 功能；Boss 登录与同步请在源码本机模式中运行。

不要为绕过该限制而改成无头登录或绕过安全校验。后续可通过桌面客户端或本地 companion service 改善体验。

## Vercel 展示部署

Vercel 部署自动进入只读展示模式：

- `/` 会跳转到 `/showcase` 产品介绍页
- `/homepage` 使用独立虚构数据库呈现真实产品概览
- 投递岗位、简历中心、面试工作台及其子页面、能力画像和设置页均复用正式产品界面
- 所有写请求和数据 API 会被统一拦截，不接收或保存访问者数据
- `/api/*` 数据接口返回 404
- 不读取或写入 SQLite
- 不接受简历、面试、API Key 或 Boss 登录信息

部署步骤：

1. 在 Vercel 导入 `yuecao365/OfferLai`。
2. Framework Preset 选择 Next.js。
3. Build Command 保持 `npm run build`。
4. 不要配置生产数据库或真实 API Key。
5. 部署后访问 `/showcase`，点击“在线体验”进入 `/homepage`。

Vercel 会提供预览域名，也可以在项目设置中绑定自定义域名。`VERCEL=1` 会自动启用展示模式；其他平台也可通过 `APP_MODE=demo` 启用。

修改 Prisma schema 或演示数据后，可运行 `npm run demo:db` 重新生成 `prisma/demo.db`。该文件只包含 `scripts/seed-demo.ts` 中定义的虚构数据。

## 镜像发布

GitHub Actions 在以下情况构建并发布镜像：

- 推送到 `main`
- 推送 `v*` 版本标签
- 手动运行 `Docker Image` workflow

镜像标签：

```text
ghcr.io/yuecao365/offerlai:latest
ghcr.io/yuecao365/offerlai:v0.1.0
ghcr.io/yuecao365/offerlai:sha-xxxxxxx
```

如果 GHCR Package 初次发布后是私有状态，需要在 GitHub Package 设置中将其改为 Public，公开用户才能直接拉取。

## 常用命令

```bash
npm run lint
npm test
npm run build
npm run db:push
npm run boss:login
npm run boss:sync
```
