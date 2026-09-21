<div align="center">

<h1><img src="docs/images/offercome-logo.png" alt="OfferCome" width="320"></h1>

**开源、本地优先的模拟面试官：顺着你的回答往下追，面完给你一张每条依据都能回到原话的评分卡。**

[English](README.md) · [产品介绍](https://offercome.yuecao.dev) · [在线体验](https://offercome.yuecao.dev/homepage)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![SQLite](https://img.shields.io/badge/SQLite-本地存储-003B57?style=flat-square&logo=sqlite)
![Agent Skills](https://img.shields.io/badge/Agent%20Skills-42%20SKILL.md-8A63D2?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

[它怎么问](#它怎么问) · [快速开始](#快速开始) · [功能介绍](#功能介绍) · [设计与实现](#设计与实现)

</div>

## 它怎么问

一场真实模拟面试的节选（某大厂 Agent 评测工程师岗；公司与候选人已匿名，面试官的话与它写下的理由是事件日志原文）：

> **你说：** 分子是分层压缩下每轮发给模型的 prompt_tokens 均值，分母是全量历史直接拼接的均值。二十多个测试会话。不足是只看了长度，没有对照任务成功率。
>
> **它接着问：** 你主动说了「没有对照任务成功率」，这点挺实在。那换个方向：离线评测集改完提示词后成功率涨了 3 个点，你要先做什么，才能判断这 3 个点是真涨还是噪声？
>
> *它为什么这么问：* 长度指标口径已答清（缺成功率对照），转入评估方法，看噪声与判据意识。

> **你说：** 我会写一组带约束的脚本会话，在第二十轮用代码断言；再用同一配置跑两遍拿噪声底线。
>
> **它接着问：** 这两个动作都对。接着往下：如果跑两遍的差就有 5 个点，那你这个 3 个点的结论要怎么处理——评测集规模、比较方式你会怎么改？
>
> *它为什么这么问：* 追噪声底线这一步的判据。

面试官带着你的简历和目标岗位开场，追问、换题、收尾都由它自己判断；面完由另一个独立的评分 Agent 写报告。这些"为什么这么问"会逐回合出现在你的报告里（**面试官是怎么问你的**一节）。

## 快速开始

### 在线体验

打开 [OfferCome](https://offercome.yuecao.dev/homepage)，添加简历并连接自己的文本模型，即可开始训练。网页版从空工作台开始，工作记录与简历文件保存在你的浏览器中。

模型连接（含 API Key）默认由浏览器记住，也可选择仅在本次会话保留。服务端会处理上传内容，并使用你的配置调用模型，但不将工作台数据或密钥保存到服务端数据库或文件中。清除站点数据会删除本地副本。

**Boss 直聘同步、语音作答和面试材料导入需要本地部署。**

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
| **AI 模拟面试** | 粘贴岗位描述、选一份简历、开始。面试官按 JD 和你的项目自己备课，顺着回答追问，聊透一段就换，到点自己收尾。面完给：总分（写明怎么算的）、失守在哪与练什么、站得住的、简历上的说法经不经得起问、以及面试官逐回合的思路。本地版支持语音作答。 |
| **历史面试** | 手动记录面试，或在本地版导入录音、逐字稿和复盘笔记；确认识别的问题后保存。未来的面试有专门的备战页。 |
| **面试复盘** | 聚合真实面试与模拟面试中的相似问题，对比历次回答并一键再练。 |
| **能力画像** | 按岗位关心的维度跟踪优势与不足，每条反馈都附回答原文；可查看或排除证据，发起针对性训练。 |
| **简历中心** | 从 PDF、Word 或图片简历提取实习与项目经历，确认修正后用作面试素材。 |
| **投递岗位** | 导入 Boss 直聘已有记录或手动添加投递，在概览中跟踪阶段。同步只读取记录，不会代你投递或发消息。 |

> **同步规则：** Boss 同步时，仍处于"已投递"且距离最后记录的互动已满 30 天的岗位可能被标为"已拒绝"；删除过的岗位不会重新导入。详见[同步说明](docs/deployment_CN.md#boss-直聘同步)。

## 项目预览

截图使用本地部署中的虚构数据。

<table>
  <tr>
    <td width="50%" align="center" valign="top"><strong>能力画像</strong><br><img src="docs/images/ability-profile.png" alt="OfferCome 能力画像"></td>
    <td width="50%" align="center" valign="top"><strong>面试复盘</strong><br><img src="docs/images/interview-review.png" alt="OfferCome 面试复盘"></td>
  </tr>
</table>

<details>
<summary>更多截图</summary>

<table>
  <tr>
    <td width="50%" align="center" valign="top"><strong>数据概览</strong><br><img src="docs/images/dashboard.png" alt="OfferCome 数据概览"></td>
    <td width="50%" align="center" valign="top"><strong>投递岗位</strong><br><img src="docs/images/applications.png" alt="OfferCome 投递岗位"></td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top"><strong>历史面试</strong><br><img src="docs/images/interview-history.png" alt="OfferCome 历史面试"></td>
    <td width="50%" align="center" valign="top"></td>
  </tr>
</table>

</details>

## 设计与实现

- **一个 Agent 循环，边界由代码守。** 面试官每回合先产出结构化动作（signal / action / target / facet / why / ledger），再产出话术。面试状态是事件日志的纯函数投影，可重放；代码据此算出当前合法的动作白名单，违约退回重出一次，再违约由代码定动作。10 对配对场次的消融：去掉这层，行为判定通过率从 70% 降到 37%。
- **让低价模型可用的运行时。** 统一的 `runAgent()`：工具三级权限（read / write / confirm）、四类预算（步数、token、时长、成本）、`beforeTool` 钩子（校验失败作为工具结果回传）、输出契约三级降级（schema 收敛 → 携校验错误定向重试 → 调用方兜底解析）。1636 次真实调用：一次通过 78.6%，降级后可用产出 97.0%；800 万 token 共 $0.46。消息布局按前缀缓存设计（系统提示词整场不变、状态卡置末），缓存命中 84%。[运行时](src/lib/ai/run-agent.ts)。
- **评分与面试分离。** 另一个 Agent、另一个模型逐段评分，能查简历原文核对数字，引用必须逐字；每条短板配一个具体练法，报告里给出面试官逐回合的思路。
- **42 个 Agent Skills 方法书，不是题库。** 两级多对多（基座 / 领域 / 细节），面试官看索引自选、按需加载。[查看技能包](src/lib/mock-interviews/skills)。
- **记忆分层。** 场内（状态卡 + 面试官的证据账）、跨场（每场后由 Agent 整份重写的候选人档案）、长期（能力画像）。
- **InterviewBench。** 把任何面试官——一句提示词的裸模型、固定题本、本系统——当作黑盒来评的基准：静态层 364 题，真值来自外部（Beyond the Resumé、真实面经）；端到端层 30 个真实 JD 任务，候选人档案与埋点对面试官隐藏，只从逐字稿和评分卡打分。对同模型裸提示词基线，本系统评分卡的依据逐字率 0.99 对 0.96，每场引用不实 0.11 对 0.53。[基准说明](eval/bench/README.md)。

## 部署说明

本地版使用 SQLite、持久化文件与后台任务；网页版使用浏览器存储和无状态请求处理。存储位置、Boss 同步与托管要求见[部署指南](docs/deployment_CN.md)。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。© 2026 yuecao365。
