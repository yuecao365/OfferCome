<div align="center">

<h1><img src="docs/images/offercome-interviewer.png" alt="OfferCome 卡通面试官" width="240"></h1>

**开源 AI 求职工作台，管理投递和简历，练习面试、整理复盘。支持网页使用，也可以自行部署。**

[English](README.md) · [产品介绍](https://offercome.yuecao.dev) · [在线体验](https://offercome.yuecao.dev/homepage)

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![SQLite](https://img.shields.io/badge/SQLite-本地存储-003B57?style=flat-square&logo=sqlite)
![Agent Skills](https://img.shields.io/badge/Agent%20Skills-42%20SKILL.md-8A63D2?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

</div>

## 它做什么

OfferCome 把投递记录、简历和面试准备放在一起。你可以跟进岗位进度、整理面试记录，也可以针对即将面试的岗位做一次模拟练习。

模拟面试是目前重点打磨的功能。选择简历并填写岗位描述后，AI 会结合你的项目经历提问，再根据回答追问具体细节，例如你负责哪部分、为什么选择这个方案、结果是怎么测出来的。结束后会生成报告，整理回答中的优点、不足和练习建议，也能查看相关回答和追问记录。

以下是一场实际模拟面试的节选（公司与候选人已匿名，面试官的话保留原文）：

> **你说：** 分子是分层压缩下每轮发给模型的 prompt_tokens 均值，分母是全量历史直接拼接的均值。二十多个测试会话。不足是只看了长度，没有对照任务成功率。
>
> **它接着问：** 你主动说了「没有对照任务成功率」，这点挺实在。那换个方向：离线评测集改完提示词后成功率涨了 3 个点，你要先做什么，才能判断这 3 个点是真涨还是噪声？
>
> *追问说明：* 候选人解释了如何计算长度，但没有比较任务成功率，因此下一问考察如何判断评测结果是否可靠。

多场面试的记录可以一起复盘，对比相似问题的历次回答。能力画像会汇总这些回答中的优势和不足，供后续练习参考。

## 快速开始

**在线体验。** 打开 [OfferCome](https://offercome.yuecao.dev/homepage)，添加简历，在设置中配置模型 API。工作台数据保存在当前浏览器，使用 AI 时相关材料会发送给所选模型服务处理。Boss 直聘同步、语音作答和整场录音导入需要本地部署。

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
| **AI 模拟面试** | 结合岗位和项目经历提问，根据回答继续追问。结束后查看评分、改进建议和追问记录。本地版支持语音作答。 |
| **历史面试** | 手动记录面试，或导入逐字稿和笔记；本地版还支持录音导入。可以为即将到来的面试查看准备建议。 |
| **面试复盘** | 真实与模拟面试里的相似问题聚合在一起，对照历次回答。 |
| **能力画像** | 查看不同岗位下的能力表现、优势和不足，并查看相关回答作为参考。 |
| **简历中心** | 从 PDF、Word 或图片简历提取实习与项目，可编辑，用作面试素材。 |
| **投递岗位** | 导入 Boss 直聘记录或手动添加，跟踪阶段。同步只读取，不会代你投递或发消息。 |

## 预览

以下截图使用虚构演示数据。

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

- **面试动作校验。** 模型输出追问、换题、澄清或结束等动作及目标，代码根据会话状态校验。不合法的动作会退回重试，再次失败时由代码兜底；提示词和引用校验用于降低输入内容干扰面试的风险。
- **事件溯源。** 面试过程保存为追加式事件日志，用于计算进度、模型上下文中的状态信息和评分分段。支持重放单个回合，检查提示词改动的影响。
- **面试记忆。** 模型通过场内笔记记录待确认的问题和已有判断，参考这些信息安排后续提问与结束时机。面试不设固定时长或回合上限；跨场档案记录反复出现的短板，评分结果用于更新能力画像。
- **所有 Agent 共用一个运行时。** 结构化输出三级容错（schema → 携校验错误重试 → 兜底解析）、工具三档权限、四类预算、按前缀缓存组织提示词。1636 次真实调用：一次通过 78.6%，容错后可用 97.0%。[运行时](src/lib/ai/run-agent.ts)。
- **独立评分。** 评分由独立 Agent 完成，可单独配置模型，并查询简历核对数字。代码会检查引用是否来自原文。[模型配置与缺省规则](docs/interview-pipeline.md)。
- **42 个面试技能包。** 包含不同方向的考察重点和追问方法，按需加载。[技能包](src/lib/mock-interviews/skills)。
- **InterviewBench。** 任何面试官——裸模型、固定题本、本系统——按同一接口提交，只从逐字稿和评分卡打分。与同一模型只用一段提示词相比：每场引用不实 0.10 对 0.53，一句只问一个问题 76% 对 35%；等级判断不优于基线。[基准说明](eval/bench/README.md)。

## 开源协议

[MIT](LICENSE)。© 2026 yuecao365。
