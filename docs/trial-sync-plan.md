# 阶段 2：体验版全同步到对话式面试（P3）

> 基于三份流程文档描述的本地版现状与 [next-steps.md](next-steps.md) §4。体验版现状：`src/lib/trial/`、`src/app/api/trial/`、`src/components/trial/pages/`，架构见记忆 `trial-parity-architecture`（View + 注入 + 纯函数复用）。
> 2026-09-10 第一稿；同日第二稿按用户要求改目标：**网页版功能与本地版一模一样**，只去掉评测这类只有作者用的工具，以及网页上真做不到的（§10 逐项判定）。只读代码与库，未改代码。
> 执行状态：第 1–5 步已完成并本地提交（880a855、3e5c7b3，2026-09-10），见文末的执行记录。

## 0. 现状与结论

体验版（`APP_MODE=trial`，Vercel 无状态）今天跑的是**旧题库流程**：`/api/trial/interview` 串行跑岗位蓝图 + 出题 agent 一次性生成 8 道题；房间是分步作答的 `mock-interview-room.tsx`；每答一题调 `/evaluate`（评分 v3 折回 v1 形状）和 `/follow-up`（追问 agent）；交卷调 `/report`，把每道题当一个等权领域喂汇总 agent，再折回 v1 报告。仓库因此同时养着两套面试逻辑：

| | 本地版（对话式） | 体验版（旧题库） |
|---|---|---|
| 备课 | 蓝图 → 简报（技能包、领域、阶梯、假设、评分表） | 蓝图 → 出题 agent（`question-generation-agent` 408 行 + `planning` 253 + `relevance` 194） |
| 面试中 | 回合 agent + reducer + 预算 + 信息量 | 分步作答 + `follow-up-agent`/`follow-up-policy` |
| 面试后 | 逐段评分 v3 + 示范 + 汇总 v2 + 报告 v2 | 评分 v3 折成 v1 + 汇总 v2 折成 v1 |
| 画像 | 观察由评分推导（阶段 1） | 仍调评估器 |
| 房间 | `mock-interview-chat.tsx` | `mock-interview-room.tsx`（442 行） |

只有蓝图、评分 agent、汇总 agent 三处是共用的。库里已经没有旧流程的会话（所有会话都有简报，0 条追问题），旧流程在本地版只剩死代码。

Vercel 超时（记忆 `trial-interview-vercel-timeout`）：开面试一个请求里串 2–5 次模型调用，22–40 s，Hobby 未开 Fluid Compute 时被 60 s 掐断，前端收到平台的纯文本错误页。`response.ts` 已能把它归类成 `timeout`，但根因是一个请求干太多事。

结论：**删掉整套旧题库流程，体验版跑与本地版完全相同的对话式流程**；状态归属不变（浏览器保管会话文档，服务端无状态），每个服务端请求只做一次模型调用。

## 1. 原则

1. **仓库只有一套面试逻辑。** 备课、回合、切段、评分、交卷全部是本地版现有的函数；体验版只换"状态从哪来、写到哪去"。为此先把本地版里和数据库缠在一起的编排（`interviewer/session.ts`、`completion.ts`、`queries.ts` 的视图拼装）拆成"纯函数核心 + 本地版存取"，体验版接同一个核心。
2. **一个请求一次模型调用。** 备课拆成蓝图、简报两个请求；回合流式返回；评分按段；交卷只跑汇总。每个都在 60 s 内，不依赖 Fluid Compute。
3. **界面零分叉。** 体验版渲染 `MockInterviewChat`、`MockInterviewGenerationProgress`、`MockInterviewReport`、`MockInterviewSessionView` 同一棵组件树，通过注入 transport 换掉 fetch 目标与状态读写；不再有第二个房间。
4. **能对齐的全对齐。** 目标是网页版与本地版功能一模一样；只有两类例外：只有作者用的工具（评测、AgentRun 记账查询）和网页上做不到的（§10 逐项给出判定与理由）。以前记在"不可对齐清单"里的 trace、备战页、岗位视角、针对练习、JD 文件、报告细评，这一阶段一起做完。

## 2. 本地版先拆出纯核心（不改行为）

### 现状
`interviewer/session.ts`（364 行）把"从库装配状态 → 跑回合 → reducer → 事务落库 + 调度评分"写在一起；`completion.ts` 的 `areaOutcomes` / `buildReport` 直接读 Prisma 行；`queries.ts` 的 `buildConversation` / `buildEvaluationView` 从 Prisma 行拼视图；线程切段写 `InterviewQuestion` 的字段拼装（category、rubric、metadata）只在 `persistTurn` 里。

### 改动
| 新纯函数 | 从哪拆 | 输入 → 输出 |
|---|---|---|
| `interviewer/turn.ts`：`runInterviewerTurn(state, candidate, context, skillPacks)` | `session.startInterviewerTurn` 的中段 | 状态 + 候选人消息 → `{ stream, finalize(): TurnResult }`（模型调用 + `applyTurn`，不碰库） |
| `interviewer/segments.ts`：`segmentRecord(area, thread, segment)` | `persistTurn` 的题目拼装 | 领域 + 线程 + 切段 → `{ question, answer, skipped, category, rubric, expectedSignals, metadata }` |
| `outcome.ts`：`areaOutcomes(brief, threads, questions)`、`buildReport(areas, summary)`、`summaryInput(...)` | `completion.ts` | 简报 + 线程 + 带评分的题 → 汇总 agent 输入与报告 |
| `views.ts`：`conversationView(...)`、`evaluationView(...)`、`questionView(...)` | `queries.ts` | 纯数据 → `MockInterviewConversation` / 题目视图 |

`session.ts` 之后只剩 `loadInterviewerSession` 与 `persistTurn`；`completion.ts` 只剩认领、收评分、落库；`queries.ts` 只剩查库与调用 `views.ts`。回合、切段、报告的行为一字不改，用现有单测与面试官评测回归。

### 删除
无（本步只搬家）。

## 3. 体验版会话文档 v3

### 现状
`TrialInterview` v2：题目数组 + 答案数组 + 评分数组 + `currentIndex`；报告是 v1 形状；完成后写进工作台的记录只留 score / feedback（报告页丢维度细评，是已知不可对齐项）。

### 改动
```
TrialInterview v3 = {
  version: 3, id, createdAt, startedAt | null,
  job, resume, round, pace,
  status: generating | generation_failed | in_progress | ready_to_evaluate | evaluating | completed,
  generationPhase: job_blueprint | brief | null, generationError,
  blueprint | null, brief | null, memory,           // 与本地版 briefJson / memoryJson 同形
  threads: ThreadState[], messages: MessageState[],  // 与本地版 InterviewerState 同形
  questions: TrialSegment[],                          // 线程关闭后的兼容题目
  report: MockInterviewReport(v2) | null
}
TrialSegment = segmentRecord(...) + { id, threadId, evaluation: 评分 v3 全量（含 exemplar）| null, evaluationStatus: pending | running | completed | failed }
```
面试中的状态装配就是 `createInterviewerState({ brief, memory, threads, messages })`，和本地版从库里装配的是同一个函数。完成后写进工作台的记录：`questions` 带完整 `evaluation`（画像推导与报告页都用它），`report` 为 v2；`TRIAL_WORKSPACE_VERSION` 升 3（旧文档按既定策略丢弃重来）。报告页从工作台记录还原时不再丢维度细评。

### 删除
`TrialQuestion` / `TrialEvaluation` / `clampTrialOptions` / `TRIAL_QUESTION_COUNT` 等题量常量、`recordTrialAnswer` / `insertTrialFollowUp` / `pendingEvaluationIndexes` 等旧迁移函数及其测试；`mock-view.ts` 重写为 `trialInterviewToView`（用 `views.ts`）。

## 4. 体验版接口（每个一次模型调用）

| 接口 | 替代 | 输入 | 输出 | 时长 |
|---|---|---|---|---|
| `POST /api/trial/blueprint` | `/interview` 前半 | jobTitle、jobDescription | blueprint | 6–8 s（严格 → 宽松两级，`analyzeMockInterviewJob` 原样） |
| `POST /api/trial/brief` | `/interview` 后半 | blueprint、job、resume（文本 + 项目）、pace、round | `{ brief, memory }`（`generateInterviewBrief` + `emptyMemory`；`recentWeaknesses` 由浏览器从工作台里最近的模拟面试短板算好带上，同一个纯函数） | 16–35 s；`maxDuration = 90` |
| `POST /api/trial/turn` | 新 | `{ state: { brief, memory, threads, messages }, candidate \| null, context }` | UI 流 + `data-turn { result: TurnResult }` | ≤ 45 s，流式 |
| `POST /api/trial/evaluate` | 同名，重写 | 一段：question、answer、rubric、expectedSignals、thread、round、resumeText、skillPacks | 评分 v3 全量 + exemplar（示范失败只缺 exemplar） | 7 s + ≤ 20 s |
| `POST /api/trial/complete` | `/report` | brief、memory、threads、questions（含评分） | 报告 v2（`outcome.ts` + `summarizeMockInterview`） | ~10 s |
| `/api/trial/assess`、`/synthesize` | 不变 | 只剩真实面试用 | | |

删除：`/api/trial/interview`、`/follow-up`、`/report`。回合接口的请求体带完整状态（简报 + 记忆 + 线程 + 消息），一场深入面试约 30–60 KB，远低于 Vercel 4.5 MB 上限。技能包在服务端按 `brief.skillPacks` 加载，不进请求体。

## 5. 浏览器编排（`mock-actions.ts` 重写）

- **创建**：写文档 `status=generating, phase=job_blueprint` 并跳到房间页 → 房间页看到 generating 就顺序调蓝图、简报，每步完成写文档；任一步失败写 `generation_failed` + 错误，进度卡的"重新备课"只重跑失败的那一步（蓝图已在文档里就不重跑，与本地版 `ensureBlueprint` 同语义）。进度卡改为可注入状态源：本地版轮询 `/status`，体验版订阅文档。
- **回合**：`MockInterviewChat` 的 transport 改为可注入：本地版 `DefaultChatTransport({ api: /api/interviews/mock/[id]/turn })`，体验版 `DefaultChatTransport({ api: /api/trial/turn, headers: AI 头, prepareSendMessagesRequest: 把文档里的状态放进 body })`。`onFinish` 的 `data-turn` 处理也注入：本地版只更新展示（落库已在服务端），体验版把 `result` 应用到文档（新消息、线程、记忆、phase、切出的段落）。`clientId` 回放在体验版没有意义（无服务端），重复发送由 `busy` 状态挡住。
- **评分**：线程关闭的段落进文档 `evaluationStatus=pending`，页面立即后台调 `/evaluate`（并发 ≤ 2），结果写回文档；失败标 `failed`。
- **交卷**：`interview_ended` 后房间页等在途评分、补跑 failed / pending，再调 `/complete` 写报告与工作台记录（同 `completion.ts` 的顺序，只是跑在浏览器里）；"重新生成报告"按钮注入为重跑这一段。报告写入后文档订阅触发重渲染，切回 `MockInterviewSessionView`（去掉 `transport` prop 与旧房间分支）。
- **画像**：`profile-actions.ts` 对模拟面试改调 `deriveObservationsFromEvaluation`（纯函数，浏览器直接跑），评估器只剩真实面试——和阶段 1 的本地版口径一致。
- **列表 / 复盘**：`trial-mock-page` 的进行中会话读文档、已完成读工作台，不变。复盘与画像页的"针对练习"带 `seedQuestionId` 进创建页时，浏览器从工作台里找到这道题的短板（工作台记录从 v3 起带完整评分），拼进 `recentWeaknesses`，与本地版同一个纯函数——不再只预填岗位。
- **trace 页**：回合结果里的 `decision`（提案、裁决、替换原因、锚点、记忆变化、信息量前后）随 `data-turn` 一起写进文档，`/interviews/mock/[id]/trace` 在体验版渲染同一个 `MockInterviewTraceView`；只缺每回合的模型耗时与 token（AgentRun 记账是本地版的），那两列留空。

## 5b. 其余对齐项（与模拟面试同步一起做完）

| 项 | 本地版依赖 | 网页版做法 | 工作量 |
|---|---|---|---|
| 真实面试备战页 `/interviews/prepare/[id]` | `prepare.ts` 读画像指标、同公司历史题 | 与画像、复盘同一套纯函数读工作台；页面加 trial 分支渲染同一个 View | 0.3 天 |
| 画像的岗位视角与合并 | `RoleContext` 表、`mergeRoleContexts` | 工作台记录已有 jobTitle，视角 = `roleContextKey(jobTitle)` 纯函数；合并 = 改记录的 roleKey，同 `service.mergeRoleContexts` 的语义 | 0.3 天 |
| JD 文件上传 | `extractDocumentText` 服务端解析 | `/api/trial/resume` 已在无状态解析简历文件，同一个解析器加一条 `/api/trial/document` 给 JD 用；原文件存 IndexedDB（`file-store.ts` 已有） | 0.2 天 |
| 报告页重开丢维度细评 | — | §3 工作台记录带完整评分后自然解决 | 0 |
| 画像洞察的评估器 | — | 模拟面试改推导（§5），真实面试仍调 `/assess` | 含在 §5 |

## 6. 删除清单

| 文件 / 符号 | 说明 |
|---|---|
| `question-generation-agent.ts`、`follow-up-agent.ts`、`follow-up-policy.ts`（+test）、`planning.ts`（+test）、`relevance.ts`（+test）、`generation-schema.test.ts` | 旧出题流程；`job-analysis-agent` 用到的 `isJobDescriptionEvidence` 搬进它自己 |
| `mock-interview-room.tsx`（+test）、`MockInterviewRoomTransport` / `MockInterviewAnswerOutcome` | 旧分步房间 |
| `mock-interview-setup.tsx` 的 `questionCounts` / `difficulty` 下拉；`MOCK_INTERVIEW_DIFFICULTIES` 与标签 | 只有体验版旧流程在传 |
| `types.ts` 的 `mockInterviewQuestionDraftSchema`、三种 batch schema、`MockInterviewQuestionPlan`、`MIN_MOCK_INTERVIEW_QUESTIONS`；`MockInterviewView.questions[].isFollowUp / parentQuestionId`、报告页 `FollowUps` | 库里 0 条追问题 |
| `report.ts` 的 `LegacyMockInterviewReport`、`toLegacyReport`、`fromLegacyReport`、`parseStoredReport` 的 v1 分支 | 本地库里只有 2 场 9 月 7 日的 v1 报告，一次性 SQL 升成 v2（strengths → `{point, areaName: null}`，improvements + actionPlan → advice）后删 |
| `context.ts` 的 `history`、`profile` 字段与 `getCandidateProfileContext` 调用；`MockInterviewContext` 只剩 JD、简历、项目、`recentWeaknesses` | 只有旧流程读 |
| `trial/client.ts` 的 `startInterview` / `evaluateAnswer` / `requestFollowUp` / `requestReport`；`trial/interview.ts` 旧文档函数；`mock-view.ts` 旧映射 | 由 §3–5 替代 |
| `MockInterviewSessionView` 的 `transport` prop 与"旧流程无法继续"分支 | 没有旧会话了 |

## 7. 数据与兼容

- 本地库：一次性 SQL 把 2 条 v1 `reportJson` 升成 v2；无 schema 改动。
- 体验版：`TRIAL_INTERVIEW_VERSION` 3、`TRIAL_WORKSPACE_VERSION` 3，旧数据丢弃（既定策略）。
- Vercel：`/api/trial/brief` 声明 `maxDuration = 90`，`/turn` 60（流式）。`deployment.md` 补一句：Hobby 计划要开 Fluid Compute 才有 90 s，否则备课在慢模型下可能超时，进度卡会给"重新备课"。
- 文档：三份流程文档各加"体验版"一小节（状态从哪来、写到哪去）；`next-steps.md` §4 标完成；记忆 `trial-parity-architecture` 的不可对齐清单收缩到 §10 的"做不到"三项。

## 8. 验收与回归

| 步 | 内容 | 验收 |
|---|---|---|
| 1 | 本地版拆纯核心（§2） | `npm test` 全绿；`interviewer --k 2 --cases control-1,persona-1,persona-2,persona-3` 与 fix-1 对比差值在 §6.1 噪声内；一场真机快速面试报告正常 |
| 2 | 会话文档 v3 + 五个接口（§3、§4） | 接口单测（纯函数）；`tsx` 脚本打本地体验版服务器跑通 蓝图 → 简报 → 3 回合 → 评分 → 交卷 |
| 3 | 浏览器编排 + 组件注入（§5） | `http://localhost:3100`（`career-agent-trial`）真机：创建 → 进度卡两阶段 → 对话若干回合 → 结束 → 报告页与本地版同构、逐段反馈有维度分与示范 → 画像页零评估器调用出现洞察；关掉标签页重开能接着答 |
| 4 | 删除清单 + v1 报告迁移 + 文档 | `npm test`、`tsc`、`eslint` 全绿；仓库里 grep 不到旧流程符号；本地 2 场旧报告页正常 |
| 5 | 其余对齐项（§5b）+ trace + 针对练习 | 体验版真机：备战页、画像岗位视角与合并、JD 文件、trace 页、"针对练习"进创建页后简报里出现复测，逐项与本地版对照 |

预估 3–4 天：第 1 步 0.5 天，第 2 步 1 天，第 3 步 1 天，第 4 步 0.5 天，第 5 步 1 天；每步独立提交。

## 10. 功能对齐矩阵：什么做、什么不做、为什么

逐项对照本地版的页面与能力（按 `isTrialMode` 分支与本地版专属路由清点）：

| 能力 | 判定 | 理由 / 做法 |
|---|---|---|
| 工作台、投递、真实面试记录、复盘、简历中心、设置 | 已对齐 | 阶段 P2–P4 完成 |
| 对话式模拟面试（备课、回合、评分、示范、报告） | 本阶段 §2–5 | 同一套纯核心，状态在浏览器 |
| trace 页 | 本阶段 §5 | 决策记录进会话文档；缺模型耗时与 token 两列 |
| 针对练习（seedQuestion） | 本阶段 §5 | 工作台记录带评分后可在浏览器算 `recentWeaknesses` |
| 报告细评、画像推导 | 本阶段 §3、§5 | |
| 备战页、画像岗位视角与合并、JD 文件 | 本阶段 §5b | 纯函数 + 已有的无状态解析接口 |
| 语音作答（模拟面试内） | 阶段 3 一起做 | 转写走访客自带的转写模型（设置页多一组配置，`ai-config` 已按 task 区分）；每回合一段录音几百 KB，在 4.5 MB 请求上限内；`audio.ts` 的切分不需要 ffmpeg。可做。 |
| 真实面试录音导入 | 阶段 3 评估，**大概率做不到** | 整场录音几十 MB，超 Vercel 请求体 4.5 MB；服务端切分依赖 ffmpeg 二进制与长时任务。可行的只剩浏览器端切片分次上传，工作量大、体验差；阶段 3 定。 |
| 评测（`npm run eval`、`agent:runs`、评测数据） | **不做** | 只有作者用，用户定的例外 |
| Boss 直聘同步 | **网页版做不到无感同步；可做"采集器 + 导入"** | 见 §11 |

## 11. Boss 直聘同步在网页版的可能性

本地版的做法（记忆 `boss-sync-browser-only`）：本地进程启动用户自己的 Chrome，开 `--remote-debugging-port`，用手写 CDP 客户端只启用 Network + DOM 域，在屏幕外窗口里翻"沟通过"列表页，从 `Network.getResponseBody` 拿岗位数据。硬约束来自封号教训：不能 Node 直连接口、不能 headless、不能用 Playwright/Puppeteer（Runtime 域触发反爬）。

网页版（Vercel）能拿到的东西：访客浏览器里跑的页面脚本，和一个无状态服务端。逐条看：

| 路径 | 可行性 | 说明 |
|---|---|---|
| 服务端替用户拉 Boss | 不可行 | 服务端没有用户的登录态；有也等于 Node 直连，正是封号的那条路 |
| 网页版页面直接 `fetch` zhipin 接口 | 不可行 | 跨域没有 cookie，且 zhipin 不给 CORS |
| 网页版自己拉起 CDP | 不可行 | 网页没有权限启动本地进程或连本机端口 |
| **浏览器扩展**（content script 跑在用户已登录的 zhipin 页面里） | **可行，最接近本地版体验** | 扩展在用户真实的 Chrome 会话里，走 DOM 读卡片、按"沟通过"分页点击翻页（与本地版一样只碰 DOM，不碰接口），再由扩展的 background 把数据 POST 到网页版（扩展有 host 权限，不受 zhipin 的 CORS / CSP 限制）；网页版新增一个接收接口把记录写进访客的浏览器工作台。代价：多一个要安装的扩展（Chrome 商店审核或"加载已解压"），复用 `browser-collector.ts` 的 DOM 解析与 `sync-policy.ts` 的合并规则。约 2 天。 |
| 书签脚本（bookmarklet）/ 油猴脚本 | 勉强可行 | 同样在 zhipin 页面里读 DOM，但把数据送出去受 zhipin 的 CSP 限制，多半只能"复制到剪贴板 → 网页版粘贴导入"；用户操作多，与产品北极星（少操作）相悖 |
| 本地版导出 → 网页版导入 | 可行但意义小 | 有本地版就不需要网页版同步 |

结论：网页版的 Boss 同步**无法在纯网页内实现**，最接近的是浏览器扩展；它是一个独立交付物，建议作为阶段 2 之后的单独一段（"阶段 2b：Boss 扩展"），不并入本次同步。本阶段网页版的投递记录仍以手动录入为主。

## 12. 待你定

已定（2026-09-10）：
1. 本地库 2 条 v1 报告一次性 SQL 升 v2，删掉全部 v1 兼容代码。
2. 进行中的会话与本地版一致：按 id 各存一份（localStorage 键 `offercome.trial.interview.<id>`），可多场并行、各自随时退出再继续；列表页把所有进行中的会话列出来。原来"一次只有一场"的单键存储删掉。
3. Boss 同步走浏览器扩展，作为阶段 2 之后的独立一段（阶段 2b），前提是能稳定实现；本阶段网页版投递记录仍手动录入。
4. 真实面试录音导入阶段 3 再定。

## 13. 执行记录（2026-09-10）

### 13.1 代码

- 第 1 步（880a855）：`interviewer/turn.ts`（回合纯核心 + 决策记录）、`segments.ts` 的 `segmentRecord`、`outcome.ts`、`views.ts`；`session.ts` / `completion.ts` / `queries.ts` 只剩存取。
- 第 2–5 步（3e5c7b3）：会话文档 v3 按 id 存 `offercome.trial.interviews`（多场并行，已完成的也留着给报告 / trace 页）；五个接口 blueprint / brief / turn / evaluate / complete；`MockInterviewChat`、`MockInterviewGenerationProgress` 注入 driver，`MockInterviewSessionView` 去掉旧房间分支；`mock-actions.ts` 在浏览器里驱动备课、评分、交卷；画像推导、岗位视角与合并（`trialRoles` / `mergeTrialRoles`，视角键用岗位名归一而不是哈希）、备战页（`InterviewPrepareView` + `prepare-rules.ts` 纯口径，本地版也改用）、JD 文件（`documents/job-description.ts` 两端共用）；trace 页体验版读文档。删除清单全部执行；`isJobDescriptionEvidence` 搬到 `text/evidence.ts` 更名 `isVerbatimEvidence`；库里 2 条 v1 报告一次性升 v2。

### 13.2 验证

- `npm test` 416 通过（新增 `trial/interview.test.ts`：备课两步与重试、回合结果应用到文档、旧版本文档丢弃）；`tsc`、`eslint` 只剩评测代码里早于本次的两处类型错误。
- 体验版端到端（脚本打 `localhost:3100`，Key 只进请求头，与浏览器编排同步骤）：蓝图 11 s、简报 20 s（2 个领域、3 个技能包）、回合 2–6 s × 5（开场 → 切入 → 追问 → 打断 → 收尾）、评分 12 s（60 分、2 条短板、有示范）、交卷 5 s；产物 40 KB。把产物注入浏览器后，列表页（带节奏与总分）、报告页（总分、领域、站得住 / 失守、逐段维度分与缺口、示范）与 trace 页（5 回合的提案 / 裁决 / 信息量 / 记忆增量）都正常渲染；画像页在未连模型时给出设置页引导。
- 面试官评测回归：见 13.3。

### 13.3 面试官回归（本地版回合路径）

（待填）

### 13.4 没做完 / 留给后续

- 真机的对话式房间（流式回合、逐段评分后台跑、结束后交卷）需要在浏览器里连模型 Key 才能走，Key 由你输入；脚本已把同一条链路走通，房间组件在体验版的实际点击流程请你验证一遍。
- Boss 浏览器扩展（阶段 2b）、语音作答（阶段 3）未动。
