<div align="center">

<h1><img src="docs/images/offercome-logo.png" alt="OfferCome" width="320"></h1>

**本地优先的求职工作台：让每一次投递和面试，都变成下一次更好的准备。**

[English](README.md) · [产品介绍](https://offercome.yuecao.dev) · [在线体验](https://offercome.yuecao.dev/homepage)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![SQLite](https://img.shields.io/badge/SQLite-本地存储-003B57?style=flat-square&logo=sqlite)
![Agent Skills](https://img.shields.io/badge/Agent%20Skills-SKILL.md-8A63D2?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

[核心闭环](#核心闭环) · [快速开始](#快速开始) · [功能介绍](#功能介绍) · [项目预览](#项目预览) · [设计与实现](#设计与实现)

</div>

## 核心闭环

OfferCome 将投递、简历、面试和复盘集中到一个工作台，用历史回答和能力画像帮助你准备下一场训练。

```text
投递岗位 ──▶ 简历与项目 ──▶ AI 模拟面试 ──▶ 真实面试
   ▲                            │                │
   │                            ▼                ▼
   └────────── 能力画像 ◀── 复盘与评分 ◀── 导入与转写
```

## 快速开始

### 在线体验

打开 [OfferCome](https://offercome.yuecao.dev/homepage)，添加简历并连接自己的文本模型，即可开始训练。网页版从空工作台开始，工作记录与简历文件保存在你的浏览器中。

模型连接（含 API Key）默认由浏览器记住，也可选择仅在本次会话保留。服务端会处理上传内容，并使用你的配置调用模型，但不将工作台数据或密钥保存到服务端数据库或文件中。清除站点数据会删除浏览器里的本地副本。

**Boss 直聘同步、语音作答、面试材料导入和联网搜索需要本地部署。**

### Docker 本地部署（推荐）

**环境要求：** Docker Desktop 或 Docker Engine + Docker Compose。

```bash
git clone https://github.com/yuecao365/OfferCome.git
cd OfferCome
docker compose up -d --build
```

打开 [http://localhost:3000](http://localhost:3000)，在**设置**页配置模型服务。

数据库与上传文件持久化在本机 Docker 卷中；配置的 AI 任务会将相关输入发送给你选择的模型服务。使用 `docker compose down` 停止服务；加上 `-v` 会永久删除数据卷。

### 源码运行

**环境要求：** Node.js 22+、npm；Boss 登录还需要 Chrome 或 Edge。以下命令适用于 Windows PowerShell：

```powershell
git clone https://github.com/yuecao365/OfferCome.git
Set-Location OfferCome
Copy-Item .env.example .env.local
npm ci
npm run db:push
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 并完成**设置**。浏览器登录与同步步骤见[部署指南](docs/deployment_CN.md#boss-直聘同步)。

## 功能介绍

| 功能 | 你可以做什么 |
| --- | --- |
| **投递岗位** | 导入 Boss 直聘已有记录或手动添加投递，在概览中跟踪阶段与变化。同步只读取记录，不会代你投递或发消息。 |
| **简历中心** | 从 PDF、Word 或图片简历提取实习与项目经历，确认并修正后用作面试素材。 |
| **AI 模拟面试** | 根据技能包、简历、历史回答和画像洞察生成题目，提供追问、按评分标准给出的反馈及行动计划。本地版还支持语音作答。 |
| **历史面试** | 手动记录面试，或在本地版导入录音、逐字稿和复盘笔记；确认识别的问题后保存。未来的面试可进入专门的备战页。 |
| **面试复盘** | 聚合多场面试中的相似问题，对比历次回答并一键再练。支持按项目或题库浏览、修正归类。 |
| **能力画像** | 从八个维度跟踪优势与不足，反馈附带回答原文证据。可查看或排除证据、保护洞察，并发起针对性训练。 |

> **同步规则：** Boss 同步时，仍处于“已投递”且距离最后记录的互动已满 30 天的岗位可能被标为“已拒绝”；删除过的岗位不会重新导入。详见[同步说明](docs/deployment_CN.md#boss-直聘同步)。

## 项目预览

截图使用本地部署中的虚构数据。

<table>
  <tr>
    <td width="50%" align="center"><strong>AI 模拟面试</strong><br><img src="docs/images/mock-interview.png" alt="OfferCome AI 模拟面试"></td>
    <td width="50%" align="center"><strong>能力画像</strong><br><img src="docs/images/ability-profile.png" alt="OfferCome 能力画像"></td>
  </tr>
</table>

<details>
<summary>更多截图与产品介绍</summary>

<table>
  <tr>
    <td width="50%" align="center"><strong>数据概览</strong><br><img src="docs/images/dashboard.png" alt="OfferCome 数据概览"></td>
    <td width="50%" align="center"><strong>投递岗位</strong><br><img src="docs/images/applications.png" alt="OfferCome 投递岗位"></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>历史面试</strong><br><img src="docs/images/interview-history.png" alt="OfferCome 历史面试"></td>
    <td width="50%" align="center"><strong>面试复盘</strong><br><img src="docs/images/interview-review.png" alt="OfferCome 面试复盘"></td>
  </tr>
</table>

<a href="https://offercome.yuecao.dev/showcase"><img src="docs/images/hero.png" alt="OfferCome — 每一场面试，都算数" width="820"></a>

</details>

## 设计与实现

- **分层面试技能包。** 10 个 `SKILL.md` 技能包按基座、领域、技术栈分层组织出题方法，按需加载，并提供关键词匹配兜底。[查看技能包](src/lib/mock-interviews/skills)。
- **可追溯的证据。** 岗位描述引用与画像摘录会核对原文，回答按出题时生成的评分标准评分。[查看画像实现](src/lib/candidate-profile)。
- **统一 AI 运行时。** `runAgent()` 集中处理结构化输出、超时、重试与日志。本地版可分别配置文本和语音模型，支持 OpenAI 兼容接口与本地模型服务。[查看运行时](src/lib/ai/run-agent.ts)。

## 部署说明

本地版使用 SQLite、持久化文件与后台任务；网页版使用浏览器存储和无状态请求处理。存储位置、Boss 同步与托管要求见[部署指南](docs/deployment_CN.md)。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。© 2026 yuecao365。
