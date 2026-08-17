<div align="center">

# OfferLai

**本地优先的一站式求职管理工作台**

[English](README.md) · [产品介绍](https://offer-lai.vercel.app) · [在线体验](https://offer-lai.vercel.app/homepage)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=flat-square&logo=prisma)
![SQLite](https://img.shields.io/badge/SQLite-本地存储-003B57?style=flat-square&logo=sqlite)
![Agent Skills](https://img.shields.io/badge/Agent%20Skills-SKILL.md-8A63D2?style=flat-square)

[项目简介](#项目简介) · [项目预览](#项目预览) · [近期更新](#近期更新) · [功能亮点](#功能亮点) · [快速开始](#快速开始)

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

## 近期更新

> 这是对当前状态的初步整理。前端界面仍在优化中，完成后会再更新一次本节。

**新增**

- **分层面试技能包。** 面试出题经验被沉淀为遵循 Agent Skills 约定的 `SKILL.md` 技能包（YAML frontmatter + markdown 正文），分三层组织：基座层负责项目深挖追问法，领域层负责架构类出题方法论，技术栈层负责语言特有的考察深度。默认内置 10 个技能包（后端／前端／AI-LLM／计算机基础／算法，以及 Java、Go、React、Vue 四个技术栈）。
- **由 agent 自主加载技能包。** 上下文中常驻的只有技能包的名称与描述，出题 agent 通过 `load_skill` 工具自行判断并加载所需全文，加载技术栈包时会自动带上其所属领域包。若模型不具备工具调用能力、全程没有加载，系统会按关键词推荐结果做一次确定性注入重试，出题质量不依赖模型是否会调工具。
- **统一的 agent 运行时。** 所有 AI 调用收敛到一个 `runAgent()` 入口，统一处理超时、结构化输出、残缺结果抢救、重试与降级策略、错误分类、提示词版本，以及逐次调用的结构化日志（`runId`、token 用量、采纳／拒绝计数）。
- **编号分页**：投递岗位、历史面试、面试复盘统一改为可跳页的编号分页，历史面试补上了真正的服务端分页。

**改进**

- **岗位描述降级为弱信号。** 现实中的 JD 往往宽泛或长期未更新，因此出题时只把它当作判断岗位方向与技术栈的参考，题目的具体性改由技能包和简历驱动；同时题目更偏向技术深挖与项目追问，通用行为题大幅减少。
- **校验从"一票否决"改为分级。** 硬性拦截只保留三类：提示词注入防护、引用真实性、写入原子性。其余全部改为降级或排序——岗位能力分析具备四级兜底链、不再存在失败路径，题目数量由固定值改为区间，重复、配额与相关性偏弱只降低排序而不再丢弃题目。
- **面试导入不再需要任何选择。** 材料类型、录音里是否有面试官、哪位说话人是本人、文本是逐字稿还是复盘总结，全部由系统从上传内容自行推断；公司、岗位、轮次和面试时间会被提取并预填表单。录音的转写与识别合并为一次操作，超长录音会自动分片上传与转写。
- **能力画像改为教练式反馈。** 第一场面试后即出现"继续保持／值得再练"的定性反馈卡，一场面试即给出等级（标注为初步结论），八个维度归为内容力／证据力／表达力三组呈现，每条洞察都必须落到可执行的动作上。
- **语音作答**时长上限提升到 10 分钟。

## 功能亮点

| 模块 | 功能 |
| --- | --- |
| **Boss 直聘投递一键导入** | 在投递岗位页直接启动本机有头浏览器，逐页导入本人账号中已有的投递/沟通岗位；登录失效时先引导手动登录再自动续同步。系统按稳定岗位身份去重，突出新增与来源变化，并只在同步时执行“投递满 30 天且无后续活动”的拒绝判断，不会代替用户投递或发送消息。 |
| **技能包驱动的 AI 面试** | 出题以分层 `SKILL.md` 技能包为依据，其中沉淀了各领域真实的考察方式——高频主题、深度阶梯、好题与坏题对照、项目追问链。Agent 只加载自己判断需要的技能包，模型不调用工具时则由系统确定性注入兜底。 |
| **AI 面试记忆注入** | 每次模拟面试还会组合所选简历及实习/项目、已完成真实面试中的相关问答和最新能力画像洞察。系统通过来源排序和问题去重控制注入内容，并保存采用的历史记录 ID 与画像版本，便于追溯。 |
| **文字与语音面试** | 支持浏览器朗读面试题、麦克风录制最长 10 分钟的回答、调用已配置的语音模型转写，以及提交前编辑转写文本。回答音频只用于本次转写，不保存原始音频文件。 |
| **长期更新的能力画像** | 完成真实面试或 AI 模拟面试后自动安排画像更新。版本化评估和历史快照持续吸收回答证据、逐题反馈、岗位上下文及可用的表达指标，优先考虑真实面试证据，并支持后续纠正与重建。 |
| **简历到实习/项目索引** | 支持上传 PDF、Word 和图片简历并提取实习与项目。正式保存前可在确认窗口修改名称或关联已有记录，再同步提交简历及关联关系，减少面试复盘中的重复索引。 |
| **零选择的真实面试导入** | 除手动记录外，还可直接投入录音、转写文本、总结、PDF、Word 和文本文件。系统自行判断材料类型与本人声音，预填面试基本信息，并生成可编辑的问答草稿，自动分类问题并关联实习/项目。 |
| **分层面试复盘** | 可以只查看某一个实习/项目的问题，也可以进入技术八股或通用问题库；重复问题会聚合多次历史回答及来源面试信息，按最新回答优先展示，并支持服务端筛选和编号分页。 |
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

OfferLai 按本地优先方式设计。完整产品的多项能力依赖长任务或本地资源：LLM 调用可能持续 60 秒以上；音频转写最长可运行 10 分钟；超长录音会分片并可能需要 ffmpeg 切分；模拟面试生成与画像刷新使用 Next.js `after()` 后台任务；Boss 同步通过 Chrome DevTools Protocol 驱动本机浏览器；简历文件和浏览器会话状态保存在本地文件系统。

因此，将可读写的完整产品部署到 Vercel 等 serverless 平台时，需要自行解决函数超时、ffmpeg 运行环境、可靠的后台任务以及数据库与文件的持久存储问题。本仓库中的 Vercel 站点仅作为只读预览。完整产品推荐按上文使用 Docker Compose 在本地运行。
