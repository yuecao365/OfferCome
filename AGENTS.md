# OfferCome（career-agent）项目手册入口

这份文件是每个新会话的起点：它写清用户的期望、协作规则和去哪里读细节。**不要靠重新扫代码来"了解项目"**，先读下面列的文档，再只打开要改的那几个文件。手册与代码不符时以代码为准，并顺手把手册改对。

## 0. 新会话先读什么

| 顺序 | 文件 | 读什么 |
|---|---|---|
| 1 | 本文件 | 用户期望、工作方式、环境坑、文档维护规则 |
| 2 | [docs/status.md](docs/status.md) | 现在做到哪了、未决问题、下一步候选 |
| 3 | [docs/architecture.md](docs/architecture.md) | 目录结构、数据模型、页面与 API 路由、脚本、配置 |
| 4 | [docs/features.md](docs/features.md) | 每个功能做什么、入口在哪、实现要点 |
| 5 | [docs/interview-pipeline.md](docs/interview-pipeline.md) | 核心功能——AI 模拟面试从 JD 分析到能力画像的逐步实现 |
| 6 | [docs/decisions.md](docs/decisions.md) | 已经定下的产品 / 技术决策与理由，不要再翻案 |
| 按需 | [docs/eval.md](docs/eval.md)、[docs/interview-failures.md](docs/interview-failures.md)、[docs/deployment.md](docs/deployment.md) | 评测跑法、真实失败清单、部署 |

`docs/` 里其余 `*-plan.md`、`*-design*.md` 是历史方案与施工图，只在需要追溯"为什么这样做"时读；索引在 [docs/status.md](docs/status.md#历史文档索引)。

## 1. 项目是什么

- **产品**：OfferCome，本地优先的求职工作台：投递管理、简历与项目抽取、面试记录与导入、面试复盘、**AI 模拟面试（核心）**、能力画像。另有部署在 Vercel 的体验版（`APP_MODE=trial`），与本地版共用同一套组件与纯函数核心，数据存浏览器。
- **技术栈**：Next.js 16（App Router，Turbopack）+ React 19 + Prisma 7 / SQLite + Vercel AI SDK v7（`ai` 包）+ Tailwind 4 + Zod 4。测试用 Node 内置 test runner 经 `tsx`。
- **用户**：作者本人（yuecao365）独立开发，用它准备**大厂 Agent 开发 / Agent Harness 岗**的求职。项目同时是简历项目：简历素材与证据账在 [docs/resume/](docs/resume/project.md)。

## 2. 这不是你熟悉的 Next.js

这个版本有破坏性变更，API、约定、文件结构都可能与训练数据不同。写代码前先读 `node_modules/next/dist/docs/` 里相关的指南，注意弃用提示。

## 3. 用户的期望

### 产品层

1. **少操作、端到端**：系统能判断的不问用户；判不准宁可降级产出，也不把选择题丢回去；报错必须是用户能照做的动作。
2. **模拟面试的价值在项目追问**：结合简历深挖、按回答往下追，这是用户自己练不了的；八股覆盖率只是门禁不是目标。
3. **JD 是岗位特异性的唯一来源**（必填）；技能包是"怎么面"的方法书，不是题库；不联网，岗位知识来自仓库内版本化技能包。
4. **投递记录渠道无关**：Boss 同步只是批量场景的省力工具，新代码一律用 application 语义，禁止 Boss 专属设计。
5. **体验版与本地版功能一致**：只排除评测工具和网页上真做不到的；新功能默认两端同做（View + 注入 + 纯函数）。
6. **面试复盘同时收真实与模拟面试**，用来源筛选器区分。
7. **视觉方向已定**：深色优先、翡翠绿点睛、Hero 大数字、克制动效；新页面沿用，不退回浅色卡片平铺。

### 工程层

1. **主动权给模型，边界留给代码**：面试质量问题先改提示词或材料；要加代码门禁先和用户商量。控制作用在**动作层**（先校验动作再说话），不在文字层事后过滤。
2. **先判结构再动手**：症状成组出现先找结构性原因，给重建方案与删除清单；不在坏结构上打补丁。
3. **先做稳核心层，再按证据加实验层**：每回合无后台 agent，提示词精简；实验功能默认关、只写 trace，拿到"开着比关着好"的证据才能影响面试官。
4. **精简**：不重要或价值待考察的点直接从方案里砍，列成"明确不做"留档；过时代码直接删，不留平行实现。
5. **评分的 agent 不能是面试的 agent**（评测独立性的前提）；蓝图（JD 级）单独缓存复用。

### 职业目标层

- **这个项目的用途是拿大厂 Agent 开发 / Agent Harness 岗的 offer**（用户 2026-09-20 明确）。一切设计以此为准：
  1. **架构要深思熟虑**：每个部件先问"大厂 agent 团队会怎么做、为什么"，取舍要能在面试里讲清；不做拍脑袋的补丁，不为省事留平行实现。
  2. **技术要覆盖这类岗位的广度和深度**：运行时（agent loop、工具三档权限、四类预算、输出契约三级降级、事件溯源可重放、前缀缓存、注入防护）、记忆分层（场内 / 跨场 / 长期）、多 agent 分工与独立评分、评测方法。每一块都要能撑住五分钟追问，而不是只有一层。
  3. **必须有评测**：每个主张配可复现的数字与局限说明；没有数字的主张不上简历。
- 项目要能写上简历并撑住追问：**每个数字都要可复现**（`npm run harness-report`、`eval/runs/*.json`），旁边写明局限（尤其模拟器"太配合"的偏差方向）。
- 只做部件消融与基线对照，**不做"改造前 vs 改造后"**（那是修自己造的问题）。指标形状对齐 CAT / IRT 的既有说法，不自创格子表。

## 4. 工作方式（每个会话都要遵守）

1. **方案阶段不动代码**：确认偏好、说"满意"都不等于放行；等明确的"开始 / 实施 / 按这个做"。每个阶段先写计划文档（`docs/*-plan.md` 格式）给用户看。
2. **提交要少**：一个阶段合成极少几个 commit，中途小修并进同一个提交；**推送只在用户明确说时做**。提交信息写清做了什么、验证了什么，以 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 结尾。
3. **验证 = 单测 + `tsc` + 真机一场**（约 10 回合），不跑评测。自博弈最多 2–3 场冒烟（`npm run simulate -- --tag x --archetypes a,b --seeds 1`），跑前报预计费用；15 场对照只在用户明确要对照数字时跑，同一阶段不重复。能用已有场次回答的（`--recompute`、`resegment`、读事件日志）就不再调模型。
4. **新失败先进表再修**：`npm run postmortem -- <sessionId>` 或 trace 页复盘露出来 → 写进 [docs/interview-failures.md](docs/interview-failures.md) → 给模拟器补扰动 → 修 → 跑对应扰动 1–2 场。
5. **改完代码原地更新文档**（见 §7），不另开"现状 v2"。
6. **子 agent 禁用 WebFetch**，WebSearch 每项最多 1 次；内容类任务"先写文件再润色"。
7. 跟用户用中文沟通。

## 5. 可维护性规则

修 bug 或加需求时，不要默认在现有系统上继续堆代码。

**流程**：先读相关代码路径，理解现有实现；尽量复用已有模块、工具、组件、数据模型与模式；加新代码前先看能不能通过简化现有逻辑、抽出重复、删死代码、改清名字、拆大文件来解决；优先做小而局部、直接服务当前需求的重构；最终复杂度不高于改前。

**重构期望**：相关代码乱、重复、耦合、难扩展就不要视而不见；做必要且限定范围的重构；不为缩小 diff 保留坏结构；不做与当前任务无关的大重构。

**质量规则**：不做平行实现；不写一次性特例；显式可读优先于巧妙；文件 / 函数 / 组件职责单一；触及之处的重复要消掉；命名与接口与周围一致。

**收尾自检**：新代码能否取代旧代码；还能不能再简化；这块是不是比改前更好懂。

## 6. 环境与已知的坑

- **Windows 11**，PowerShell 为主，Bash 工具也可用。`python` 跑含中文脚本要 `PYTHONUTF8=1`；Bash 里 100 行以上 heredoc 会失败，长脚本用 Write 写到 scratchpad 再执行；PowerShell `Select-Object -Last` 会缓冲到结束，看进度改 `*> 文件` 再 tail；`aux/con/nul/prn/com1` 等不能做文件名。
- **dev 预览只能用 `http://localhost:3000`**（127.0.0.1 不 hydrate）。用 `preview_start`，不用 Bash 起服务器。隐藏面板下页面停在骨架 / 多个 main 是查看环境假象，先截一张图再查。
- **`.next` 缓存损坏**：dev 运行中批量增删 / 改名文件后 API 返回 HTML 404。处置：`preview_stop` → `rm -rf .next` → `preview_start` → 探针 `curl -s -X POST -H "Content-Type: application/json" -d '{}' http://localhost:3000/api/trial/turn`（返回 JSON 即健康）。**付费跑批前必须先探针**；跑批哨兵见整档全挂立即停并 `rm -f eval/ablation.json`。
- **改 Prisma schema 后**：`npx prisma db push` + `npx prisma generate`，再重启 dev（内存里的客户端还是旧的，每回合落库会失败）。
- **长任务**（模拟 15 场约 40 分钟）不能放 Bash 后台（10 分钟超时），用 PowerShell `Start-Process` 脱离进程，日志放 scratchpad 用 Monitor 看；跑前确认 OpenAI 额度。
- **Boss 同步**只能走浏览器采集（原生 CDP，只开 Network + DOM 域，屏幕外窗口）；禁 Node 直连、headless、Playwright/Puppeteer（Runtime 域触发反爬，账号曾被封）。
- `npm test` / `npm run eval` 报 `'tsx' is not recognized` → `npm install`。只读查库最省事：`node` + `better-sqlite3` 直连仓库根目录的 `dev.db`。

## 7. 文档维护规则（改什么、更新哪里）

| 改动 | 更新 |
|---|---|
| 完成一个阶段 / 决定下一步 / 发现新的未决问题 | [docs/status.md](docs/status.md) |
| 新增 / 删除目录、模块、页面、API、脚本、Prisma 模型 | [docs/architecture.md](docs/architecture.md) |
| 功能行为或入口变化 | [docs/features.md](docs/features.md) |
| 模拟面试任一阶段的提示词、工具、钩子、兜底、版本号 | [docs/interview-pipeline.md](docs/interview-pipeline.md)（同时更新版本号） |
| 用户定了新的产品 / 技术决策，或推翻旧决策 | [docs/decisions.md](docs/decisions.md)，必要时改本文件 §3 |
| 用户给了新的协作规则、发现新的环境坑 | 本文件 §4 / §6 |
| 评测指标、跑法、基线数字 | [docs/eval.md](docs/eval.md) |
| 真实场次出现的新失败 | [docs/interview-failures.md](docs/interview-failures.md) |

规则：改代码的同一个提交里改文档；写"现状"不写"改动记录"（历史在 git log 与 `*-plan.md`）；文档里的数字要标日期与来源。
