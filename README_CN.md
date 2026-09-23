<div align="center">

<h1><img src="docs/images/offercome-interviewer.png" alt="OfferCome 卡通面试官" width="240"></h1>

**开源、本地优先的模拟面试官：顺着你的回答往下追，面完给你一张每条依据都能回到原话的评分卡。**

[English](README.md) · [产品介绍](https://offercome.yuecao.dev) · [在线体验](https://offercome.yuecao.dev/homepage)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![SQLite](https://img.shields.io/badge/SQLite-本地存储-003B57?style=flat-square&logo=sqlite)
![Agent Skills](https://img.shields.io/badge/Agent%20Skills-42%20SKILL.md-8A63D2?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

</div>

## 它做什么

粘贴岗位描述、选一份简历、开始。面试官按 JD 和你的项目自己备课，顺着每个回答追问，聊透一段就换题，没有要验证的东西了就收尾。面完由另一个独立的评分 Agent 写报告：失守在哪、练什么，站得住的，简历上的说法经不经得起问，以及面试官每一步为什么这么问。

一场真实面试的节选（公司与候选人已匿名，面试官的话是原文）：

> **你说：** 分子是分层压缩下每轮发给模型的 prompt_tokens 均值，分母是全量历史直接拼接的均值。二十多个测试会话。不足是只看了长度，没有对照任务成功率。
>
> **它接着问：** 你主动说了「没有对照任务成功率」，这点挺实在。那换个方向：离线评测集改完提示词后成功率涨了 3 个点，你要先做什么，才能判断这 3 个点是真涨还是噪声？
>
> *它为什么这么问：* 长度指标口径已答清，转入评估方法，看噪声与判据意识。

面试官之外是一个小型求职工作台：面试记录与复盘、由你的回答累积成的能力画像、简历中心、投递跟踪。

## 快速开始

**在线体验。** 打开 [OfferCome](https://offercome.yuecao.dev/homepage)，添加简历、连接自己的模型。数据都在你的浏览器里，服务端不保存。Boss 直聘同步、语音作答和面试材料导入需要本地部署。

**Docker。**

```bash
git clone https://github.com/yuecao365/OfferCome.git
cd OfferCome
docker compose up -d --build
```

**源码运行**（Node.js 22+）：

```bash
git clone https://github.com/yuecao365/OfferCome.git
cd OfferCome
cp .env.example .env.local
npm ci && npm run db:push && npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，在**设置**页添加模型服务。存储位置、Boss 同步与托管要求见[部署指南](docs/deployment_CN.md)。

## 功能

| | |
| --- | --- |
| **AI 模拟面试** | 按 JD 和你的项目备课；自己追问、换题、收尾；报告给总分、短板与练法、简历说法核对、面试官的思路。本地版支持语音作答。 |
| **历史面试** | 记录面试，或在本地导入录音、逐字稿和笔记。未来的面试有备战页。 |
| **面试复盘** | 真实与模拟面试里的相似问题聚合在一起，对照历次回答。 |
| **能力画像** | 按岗位维度看优势与不足，每条都附回答原文。 |
| **简历中心** | 从 PDF、Word 或图片简历提取实习与项目，可编辑，用作面试素材。 |
| **投递岗位** | 导入 Boss 直聘记录或手动添加，跟踪阶段。同步只读取，不会代你投递或发消息。 |

## 预览

本地部署中的虚构数据。

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

- **先定动作，再说话。** 面试官每回合先给出结构化决策（追问 / 换题 / 澄清 / 收尾及目标），再生成话术。代码按会话状态校验决策，不合法退回重出，第二次由代码定。提示注入改变不了面试进程。
- **事件溯源。** 一场面试只是一份只追加的事件日志，进度、给模型看的状态卡、评分切段都从它算出来。任一回合都能拿来重放，验证提示词改动。
- **Agent 自己写的记忆。** 场内笔记（待验证 / 已有结论 / 存疑 / 接下来）决定面试何时结束，没有时钟也没有回合上限；跨场记录每场验证了什么、哪些短板反复出现；评分累积成能力画像。
- **所有 Agent 共用一个运行时。** 结构化输出三级容错（schema → 携校验错误重试 → 兜底解析）、工具三档权限、四类预算、按前缀缓存组织提示词。1636 次真实调用：一次通过 78.6%，容错后可用 97.0%。[运行时](src/lib/ai/run-agent.ts)。
- **评分是另一个 Agent、另一个模型。** 能查简历原文核对数字，引用必须逐字。
- **42 个 Agent Skills 是方法书，不是题库**，按需加载。[技能包](src/lib/mock-interviews/skills)。
- **InterviewBench。** 任何面试官——裸模型、固定题本、本系统——按同一接口提交，只从逐字稿和评分卡打分。与同一模型只用一段提示词相比：每场引用不实 0.10 对 0.53，一句只问一个问题 76% 对 35%；等级判断不优于基线。[基准说明](eval/bench/README.md)。

## 开源协议

[MIT](LICENSE)。© 2026 yuecao365。
