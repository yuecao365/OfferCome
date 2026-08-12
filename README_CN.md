<div align="center">

# OfferLai

**本地优先的一站式求职管理工作台**

[English](README.md) · [产品介绍](https://offer-lai.vercel.app) · [在线体验](https://offer-lai.vercel.app/homepage)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=flat-square&logo=prisma)
![SQLite](https://img.shields.io/badge/SQLite-本地存储-003B57?style=flat-square&logo=sqlite)
![Playwright](https://img.shields.io/badge/Playwright-1.61-2EAD33?style=flat-square&logo=playwright&logoColor=white)

[项目简介](#项目简介) · [项目预览](#项目预览) · [功能亮点](#功能亮点) · [快速开始](#快速开始)

</div>

## 项目简介

OfferLai 将岗位投递、简历、真实面试、AI 模拟面试、面试复盘和能力画像集中到一个清晰的求职管理工作台中。

> **本地优先设计：** SQLite 数据库、简历文件和 Boss 登录状态默认保存在用户自己的设备中。AI 功能仅在用户主动配置模型服务后调用对应服务商。

## 项目预览

[在线体验](https://offer-lai.vercel.app/homepage)使用虚构数据并以只读模式运行，不接收或保存简历、面试记录、API Key 或 Boss 登录信息。完整读写功能请使用本地部署。

<table>
  <tr>
    <td width="50%" align="center"><strong>数据概览</strong><br><img src="docs/images/dashboard.png" alt="OfferLai 数据概览"></td>
    <td width="50%" align="center"><strong>投递管理</strong><br><img src="docs/images/applications.png" alt="OfferLai 投递管理"></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>AI 模拟面试</strong><br><img src="docs/images/mock-interview.png" alt="OfferLai AI 模拟面试"></td>
    <td width="50%" align="center"><strong>历史面试</strong><br><img src="docs/images/interview-history.png" alt="OfferLai 历史面试"></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>面试复盘</strong><br><img src="docs/images/interview-review.png" alt="OfferLai 面试复盘"></td>
    <td width="50%" align="center"><strong>能力画像</strong><br><img src="docs/images/ability-profile.png" alt="OfferLai 能力画像"></td>
  </tr>
</table>

## 功能亮点

| 模块 | 功能 |
| --- | --- |
| **Boss 直聘投递一键导入** | 在投递岗位页直接启动本机有头浏览器，逐页导入本人账号中已有的投递/沟通岗位；登录失效时先引导手动登录再自动续同步。系统按稳定岗位身份去重，突出新增与来源变化，并只在同步时执行“投递满 30 天且无后续活动”的拒绝判断，不会代替用户投递或发送消息。 |
| **AI 面试记忆注入** | 每次模拟面试都会组合目标 JD、所选简历及实习/项目、已完成真实面试中的相关问答和最新能力画像洞察。系统通过岗位相关性筛选、来源配额和问题去重控制注入内容，并保存采用的历史记录 ID 与画像版本，便于追溯。 |
| **文字与语音面试** | 支持浏览器朗读面试题、麦克风录制回答、调用已配置的语音模型转写，以及提交前编辑转写文本。回答音频只用于本次转写，不保存原始音频文件。 |
| **长期更新的能力画像** | 完成真实面试或 AI 模拟面试后自动安排画像更新。版本化评估和历史快照持续吸收回答证据、逐题反馈、岗位上下文及可用的表达指标，优先考虑真实面试证据，并支持后续纠正与重建。 |
| **简历到实习/项目索引** | 支持上传 PDF、Word 和图片简历并提取实习与项目。正式保存前可在确认窗口修改名称或关联已有记录，再同步提交简历及关联关系，减少面试复盘中的重复索引。 |
| **真实面试结构化导入** | 除手动记录外，还可导入录音、转写文本、总结、PDF、Word 和文本文件。支持说话人识别与候选人确认，生成可编辑的问题回答草稿，自动分类问题并尝试关联实习/项目。 |
| **分层面试复盘** | 可以只查看某一个实习/项目的问题，也可以进入技术八股或通用问题库；重复问题会聚合多次历史回答及来源面试信息，按最新回答优先展示，并支持服务端筛选和分页。 |
| **本地优先与多模型配置** | SQLite 数据、简历文件和 Boss 浏览器状态保存在用户本机。文本理解与语音转写可以分别配置服务商、模型、API Key 和兼容接口地址，只有启用的 AI 任务会向对应服务商发送必要内容。 |

## 快速开始

### 1. 在线体验

直接打开 **[OfferLai 在线体验](https://offer-lai.vercel.app/homepage)**。该环境只用于浏览，不会保存操作结果。

### 2. Docker 本地部署（推荐）

**环境要求：** Docker Desktop 或 Docker Engine + Docker Compose。

```bash
git clone https://github.com/yuecao365/OfferLai.git
cd OfferLai
docker compose up -d --build
```

打开 **[http://localhost:3000](http://localhost:3000)**。SQLite 数据和上传文件分别持久化到 `offerlai-data` 与 `offerlai-local` Docker Volume。

```bash
docker compose logs -f offerlai
docker compose down
```

> `docker compose down` 不会删除数据；`docker compose down -v` 会永久删除本地数据卷。

### 3. 源码运行

**环境要求：** Node.js 22+、npm，以及用于 Boss 手动登录的 Chrome 或 Edge。

```powershell
git clone https://github.com/yuecao365/OfferLai.git
Set-Location OfferLai
Copy-Item .env.example .env.local
npm ci
npm run db:push
npm run dev
```

打开 **[http://localhost:3000](http://localhost:3000)**。需要 Boss 同步时，在本机运行：

```powershell
npm run boss:login
npm run boss:sync -- --dry-run
npm run boss:sync
```

> Boss 登录、扫码、验证码和安全校验必须由用户本人手动完成。普通 Docker 容器无法直接打开宿主机有头浏览器，因此 Boss 登录与同步目前建议使用源码运行方式。

## 部署说明

OfferLai 按本地优先方式设计。完整产品的多项能力依赖长任务或本地资源：LLM 调用可能持续 60 秒以上；音频转写最长可运行 10 分钟；大音频可能需要 ffmpeg 切分；模拟面试生成与画像刷新使用 Next.js `after()` 后台任务；简历文件和浏览器会话状态保存在本地文件系统。

因此，将可读写的完整产品部署到 Vercel 等 serverless 平台时，需要自行解决函数超时、ffmpeg 运行环境、可靠的后台任务以及数据库与文件的持久存储问题。本仓库中的 Vercel 站点仅作为只读预览。完整产品推荐按上文使用 Docker Compose 在本地运行。
