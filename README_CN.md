# OfferLai

[English](README.md)

## 简介

OfferLai 是一个本地优先的求职管理工作台，用于集中管理岗位投递、简历、真实面试、AI 模拟面试、面试复盘和能力画像。

正式使用时，SQLite 数据库、简历文件和 Boss 登录状态默认保存在用户自己的设备中。AI 功能仅在用户主动配置模型服务后调用对应服务商。

## 项目预览

- **产品介绍：** [https://offer-lai.vercel.app](https://offer-lai.vercel.app)
- **在线体验：** [https://offer-lai.vercel.app/homepage](https://offer-lai.vercel.app/homepage)

> 在线体验使用虚构数据并以只读模式运行，不接收或保存简历、面试记录、API Key 或 Boss 登录信息。完整读写功能请使用本地部署。

### 数据概览

![数据概览](docs/images/dashboard.png)

### 投递管理

![投递管理](docs/images/applications.png)

### AI 模拟面试

![AI 模拟面试](docs/images/mock-interview.png)

### 历史面试

![历史面试](docs/images/interview-history.png)

### 面试复盘

![面试复盘](docs/images/interview-review.png)

### 能力画像

![能力画像](docs/images/ability-profile.png)

## 项目功能亮点

- **本地优先与隐私保护：** SQLite 数据库、简历文件和登录状态保存在本机，不依赖 OfferLai 中央数据库。
- **投递全流程管理：** 支持手动创建、编辑、删除、搜索、筛选、排序和分页，并可同步本人 Boss 直聘已有沟通记录。
- **简历管理：** 支持 PDF、Word 和图片上传、预览、下载、默认简历管理，以及实习和项目索引提取。
- **真实面试记录：** 管理公司、岗位、轮次、时间、问题、回答和备注，支持录音转写与结构化整理。
- **AI 模拟面试：** 根据目标岗位 JD、简历和历史记录生成训练问题，支持文字或语音作答及逐题反馈。
- **面试复盘：** 按实习、项目、技术问题和通用问题聚合历史回答，便于针对性复习。
- **能力画像：** 根据真实面试与模拟面试证据整理能力维度、优势、短板、趋势和训练重点。
- **多模型配置：** 文本理解与语音转写可分别选择模型服务商、模型和 API 地址。

## 快速开始

### 方式一：在线体验

直接访问 [OfferLai 在线体验](https://offer-lai.vercel.app/homepage)。该环境只用于浏览，不会保存操作结果。

### 方式二：Docker 本地部署（推荐）

环境要求：Docker Desktop 或 Docker Engine + Docker Compose。

```bash
git clone https://github.com/yuecao365/OfferLai.git
cd OfferLai
docker compose up -d --build
```

打开 [http://localhost:3000](http://localhost:3000)。SQLite 数据和上传文件分别持久化到 `offerlai-data` 与 `offerlai-local` Docker Volume。

```bash
docker compose logs -f offerlai
docker compose down
```

`docker compose down` 不会删除数据；`docker compose down -v` 会永久删除本地数据卷。

### 方式三：源码运行

环境要求：Node.js 22+、npm，以及用于 Boss 手动登录的 Chrome 或 Edge。

```powershell
git clone https://github.com/yuecao365/OfferLai.git
Set-Location OfferLai
Copy-Item .env.example .env.local
npm ci
npm run db:push
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。需要 Boss 同步时，在本机运行：

```powershell
npm run boss:login
npm run boss:sync -- --dry-run
npm run boss:sync
```

Boss 登录、扫码、验证码和安全校验必须由用户本人手动完成。普通 Docker 容器无法直接打开宿主机有头浏览器，因此 Boss 登录与同步目前建议使用源码运行方式。
