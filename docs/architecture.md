# 代码结构

> 现状描述（2026-09-20）。新增 / 删除目录、模块、页面、API、脚本、Prisma 模型时原地更新。路径相对仓库根目录；`@/*` 别名指向 `src/*`。

## 1. 顶层

```
src/app            页面与 API 路由（Next.js App Router）
src/components     React 组件；两版共用的 View + trial/pages 适配壳
src/lib            全部业务逻辑（见 §3）
src/generated      Prisma 生成物（不进 git）
src/proxy.ts       Next 16 的 proxy（= middleware）：体验版路由改写与写保护
src/instrumentation.ts  安装 AgentRun 持久化
prisma/schema.prisma    数据模型（SQLite，无 enum，枚举是 String + TS 常量，JSON 存 *Json String 列）
scripts/           CLI：Boss 登录 / 同步、评测、自博弈、复盘、重放
eval/              评测数据与产物（见 §6）
docs/              文档（入口见 AGENTS.md）
.local/            上传文件与 Boss 浏览器 profile（不进 git）；dev.db 在仓库根
```

## 2. 运行双形态

`src/lib/runtime-mode.ts` 的 `isTrialMode()`（`APP_MODE=trial` 或 `VERCEL=1`）把同一套代码分成：

- **本地版**：SQLite + `.local/` 文件，Server Component 取数、Server Action 写。
- **体验版**：服务端无状态，数据与 AI Key 在浏览器（localStorage 工作台文档 + IndexedDB 文件）；只有 `/api/trial/*` 允许非 GET；`/` → `/showcase`，`/homepage` → 工作台。

每个页面：`isTrialMode()` 为真 → `AppShell` + `src/components/trial/pages/Trial*Page`（客户端取数）；否则服务端取数；两者渲染**同一个 View 组件**。View 通过 props 注入动作 / 通道（`CandidateProfileTransport`、`GenerationProgressDriver`、`MockInterviewChat` 的 driver 等），不用 Context。体验版的派生逻辑在 `src/lib/trial/workspace-*.ts`，复用本地版的纯函数（回合、切段、交卷、视图、画像推导），不复制。

## 3. `src/lib` 模块

### 三个 interview 目录的分工

| 目录 | 定位 | 数据源 |
|---|---|---|
| `interview/`（单数） | **AI 面试官引擎**：事件溯源、状态、约束、面试官 agent、回合编排、切段、离线评测 | `InterviewEvent` + `AgentRun` |
| `mock-interviews/` | **模拟面试产品层**：创建会话、JD 分析、备课简报、技能包、逐题评分、示范、汇总、报告、查询。调用 `interview/` | `MockInterviewSession` 等 |
| `interviews/`（复数） | **真实面试记录**：CRUD、录音转写、逐字稿结构化、复盘、备战、统计。与 AI 面试官无关 | `Interview` / `InterviewQuestion` |

### 各模块

| 目录 | 职责 | 关键文件 → 主要导出 |
|---|---|---|
| `ai/` | 所有模型调用的底座 | `agent-loop.ts` → `runLoop`（工具循环、预算、事件、三档权限、hook）；`run-agent.ts` → `runAgent`（系统提示词拼装、输出契约三级、记账）；`agent-run-store.ts`（AgentRun 落库与链路查询）；`providers.ts`（文本 / 转写模型工厂、连通性测试）；`config.ts`（任务级配置校验、脱敏）；`coerce.ts` / `salvage-json.ts` / `strict-schema.ts`（结构化输出收敛、抢救、严格 schema）；`pricing.ts`；`proxy-fetch.ts`；`transcription-models.ts`（通义 / 豆包转写） |
| `interview/` | 面试官引擎 | `orchestrator.ts` → `startTurn`、`replayMockInterviewTurn`；`turn.ts` → `runTurn`；`interviewer.ts` → `buildSystem`、`buildTools`、`createAskTool`（`interviewer-v8`）；`events.ts`；`state.ts` → `stateOf`、`renderState`；`constraints.ts` → `checkAction`、`checkReply`、`fallbackAction`；`progress.ts`（配额 / 预算）；`views.ts` / `trace-steps.ts`（trace 页投影）；`stream.ts`；`dossier.ts`（`dossier-v1` 候选人档案）；`estimator.ts` |
| `interview/aftermath/` | 纯代码切段 | `cut.ts` → `cutSegments`；`segments.ts`；`index.ts` → `ensureSegments`、`resegment` |
| `interview/eval/` | 引擎离线评测（只被 scripts 与 trace 页用） | `simulator.ts`（合成候选人 `sim-v3`，画像 / 扰动 / 注入）；`metrics.ts`；`expectations.ts`（断言、信息增益）；`facts.ts`；`postmortem.ts`；`switches.ts`（消融开关 `packs / constraints / ledger / statecard / basis / asktool`，`policy: script`）；`script-policy.ts`（固定题本对照） |
| `mock-interviews/` | 模拟面试产品层 | `service.ts` → `createMockInterview`；`generation.ts` → `prepareMockInterview`（蓝图 + 备课 + `briefReady`）；`generation-background.ts`；`job-analysis-agent.ts`（`mock-interview-v8-no-priority`）；`context.ts` → `buildMockInterviewContext`；`question-evaluation-agent.ts`（`evaluation-v8`，产物在 `write_evaluation` 工具入参上）+ `-service.ts` + `-background.ts` + `question-evaluation.ts`（校验）；`answer-exemplar-agent.ts`（`exemplar-v1`）；`summary-agent.ts`（`summary-v4`）；`outcome.ts` / `report.ts` → `buildReport`；`completion.ts` → `completeMockInterview`；`scoring.ts` / `verdicts.ts`；`queries.ts` → `getMockInterviewView`、`getMockInterviewTrace`；`session-state.ts` → `claimSession`；`seeds.ts`（针对练习种子）；`recent-feedback.ts`；`materials.ts` / `segment-info.ts` / `audio.ts` / `errors.ts` / `types.ts` |
| `mock-interviews/brief/` | 备课简报 | `brief.ts`（schema、`BRIEF_VERSION = 8`、`QUOTA`、`rubricForArea`、`basisAccepted`、`buildBriefFromOutput`、`fallbackBrief`）；`brief-agent.ts` → `generateInterviewBrief`（`brief-v22`，跑在面试官同一个 loop 上） |
| `mock-interviews/skills/` | 技能包（42 个子目录各一个 `SKILL.md`，两级披露：base / domain 进索引，detail 由代码列在所属领域包末尾） | `loader.ts`、`selector.ts` → `packsForInterview`（按名取包，选包在 brief-agent 由模型做）、`sections.ts`（四段契约 `SKILL_SECTIONS`）、`tools.ts` → `createSkillTools`、`renderSkillIndex`。包：base = `project-deep-dive, system-design`；domain = `ai-agent, ai-algorithm, ai-infra, algorithm, backend, cs-fundamentals, data-engineering, frontend, infra-sre, mobile, security, test-qa`；detail（28，每个声明 `domains: [...]` 可属多个领域）= 语言与框架 `cpp, go, java, node, python, react, vue, android, ios, flutter, kubernetes, spark, pytorch` + 主题簇 `agent-runtime, rag-retrieval, llm-eval, llm-post-training, llm-inference-serving, gpu-kernels, distributed-training, mysql-internals, distributed-systems, recsys-search-ads, web-performance, frontend-architecture, platform-engineering, streaming-lakehouse, ai-app-testing` |
| `mock-interviews/tools/` | agent 只读工具 | `resume-lookup.ts`（按关键词查简历行，面试官与评分共用）；`recall.ts`（查档案） |
| `interviews/` | 真实面试记录 | `actions.ts`、`queries.ts` → `getInterviews`、`getInterviewWorkspaceData`、`getInterviewReviewPageData`；`transcription.ts`、`audio-splitter.ts`、`openai-diarization.ts`；`draft.ts` → `structureInterviewText`（`interview-draft-v1`）；`review.ts`；`prepare.ts` / `prepare-rules.ts`；`analytics.ts`；`voice-metrics.ts`；`upcoming.ts` |
| `candidate-profile/` | 能力画像 | `service.ts` → `refreshCandidateProfile`、`updateCandidateInsight`、`correctAbilityObservation`、`mergeRoleContexts`；`derive.ts` → `deriveObservationsFromEvaluation`（模拟面试零模型调用）；`assessment-agent.ts`（真实面试才调模型，`ability-assessment-v5`）；`agent.ts` / `synthesis.ts`（`candidate-profile-v4-coach`）；`rules.ts`（权重、衰减、聚合）；`state.ts`（租约状态机）；`background.ts`；`queries.ts`；`role-context.ts` |
| `applications/` | 投递 | `actions.ts`、`queries.ts`、`analytics.ts`（趋势 / 漏斗）、`types.ts`（阶段枚举、筛选）、`stage-advance.ts` |
| `boss/` | Boss 直聘浏览器采集 | `sync.ts` → `runBossSync`；`browser-collector.ts`；`cdp.ts`（手写 CDP，只开 Network + DOM）；`browser-launch.ts`；`login.ts`；`parse.ts` / `api-parse.ts`；`store.ts`；`sync-policy.ts`；锁与本地请求校验 |
| `resumes/` | 简历 | `actions.ts`；`extract.ts`；`experience-agent.ts` / `experience-extraction.ts`（`resume-experience-v2-title-only`）；`experience-store.ts`；`confirmation.ts`；`storage.ts`（`.local/uploads`，路径越界校验）；`queries.ts` |
| `documents/` | PDF / DOCX 抽文本 | `extract-text.ts`、`job-description.ts` |
| `settings/` | AI 配置唯一入口 | `ai.ts` → `getAiTaskConfig`、`saveAiTaskConfig`（`AppSetting` 表键 `ai_text_config` / `ai_transcription_config`；读取顺序 DB → 环境变量 → 默认） |
| `trial/` | 体验版 | `workspace.ts` / `workspace-store.ts`（`TRIAL_WORKSPACE_VERSION = 3`，`useTrialWorkspace`、`mutateWorkspace`）；`workspace-interviews/-resume/-profile/-review/-prepare.ts`；`interview.ts`（会话文档 `TRIAL_INTERVIEW_VERSION = 8`）；`mock-actions.ts` / `mock-view.ts`；`client.ts`（调 `/api/trial/*`，请求头带 Key）；`route-handler.ts` → `withTrialAi`；`ai-config.ts`；`browser-store.ts` / `file-store.ts` |
| `evals/` | 评测框架（只被 scripts 用） | `fixtures.ts`、`generate.ts`、`judge.ts`（`judge-v1`，校准）、`coverage.ts`、`metamorphic.ts`、`report.ts`、`models.ts`、`simulator.ts`（`simulator-v1`，与 `interview/eval/simulator.ts` 不同） |
| `text/` | `similarity.ts`、`evidence.ts` → `isVerbatimEvidence`（去空白逐字比对，四处共用） |
| `format/` | 日期格式化 |
| `test-support/` | 测试夹具（`testBrief`、`createTestDatabase`） |
| 根文件 | `db.ts`（Prisma 客户端）、`runtime-mode.ts`、`sqlite-url.ts`、`json.ts`、`cn.ts`、`mutation-state.ts`、三个 hook |

## 4. 页面与 API

### 页面（`src/app`）

| 路由 | 页面 | View | 取数 |
|---|---|---|---|
| `/`（trial 下 `/homepage`） | 数据概览 | `DashboardView` | `applications/queries.getApplicationStats`、`interviews/queries.getInterviewStats`、`upcoming` |
| `/showcase` | 宣传页（体验版根域名落点） | `ShowcaseContent` | — |
| `/applications` | 投递列表 | `ApplicationsView` | `applications/queries` |
| `/resumes` | 简历中心 | `ResumesView` | `resumes/queries` |
| `/interviews` | 面试工作台总览 | `InterviewsWorkspaceView` | `interviews/queries.getInterviewWorkspaceData` |
| `/interviews/history` | 历史面试 + 导入 | `InterviewHistoryView` | `interviews/queries.getInterviews` |
| `/interviews/review` | 面试复盘 | `InterviewReviewView` | `interviews/queries.getInterviewReviewPageData` |
| `/interviews/prepare/[id]` | 真实面试备战 | `InterviewPrepareView` | `interviews/prepare` |
| `/interviews/mock` | 模拟面试列表 + 新建 | `MockInterviewsView`、`MockInterviewSetup` | `mock-interviews/queries.getRecentMockInterviews`、`seeds` |
| `/interviews/mock/[id]` | 备课进度 / 房间 / 报告 | `MockInterviewSessionView`、`MockInterviewChat` | `mock-interviews/queries.getMockInterviewView` |
| `/interviews/mock/[id]/trace` | 决策记录（逐回合事件、步、token） | `MockInterviewTraceView` | `getMockInterviewTrace` |
| `/interviews/profile` | 能力画像 | `CandidateProfileDashboard` | `candidate-profile/queries` |
| `/settings` | AI 模型配置 | `AiTaskSettingsCard` / `TrialAiConnect` | `settings/ai` |

布局：`app/layout.tsx`（`zh-CN`，主题脚本预设 `data-theme`，默认 dark）→ `AppShell` → `AppChrome`（侧栏 56 / 240px 折叠，移动端抽屉）。侧栏三组：工作台 / 求职管理（投递、简历）/ 面试训练（工作台、历史、复盘、模拟、画像），配置在 `components/app-navigation-config.ts`。

### API（`src/app/api`）

| 路由 | 委托 |
|---|---|
| POST `boss/login`、`boss/sync` | `boss/login.runBossLogin`、`boss/sync.runBossSync`（仅本地） |
| `candidate-profile/insights/[id]` PATCH、`observations/[id]` PATCH、`refresh` POST、`roles/merge` POST、`status` GET | `candidate-profile/service`、`background`、`state` |
| POST `interviews/draft` | 录音 / 文本 → 草稿：`documents/extract-text`、`interviews/transcription`、`openai-diarization`、`draft.structureInterviewText`、`voice-metrics` |
| POST `interviews/mock` | `mock-interviews/service.createMockInterview` + `scheduleMockInterviewGeneration` |
| `interviews/mock/[id]/status` GET、`retry-generation` POST、`turn` POST、`replay` POST、`complete` POST、`transcribe` POST | `generation`、`interview/orchestrator.startTurn` + `stream.turnResponse`、`replayMockInterviewTurn`、`completion.completeMockInterview`、`transcription` |
| GET `resumes/[id]/file` | 回传原件（路径校验） |
| GET / PUT `settings/ai`、POST `settings/ai/test` | `settings/ai`、`ai/providers.testAiConnection` |
| POST `trial/ai-config`、`document`、`resume`、`blueprint`、`brief`、`turn`、`evaluate`、`complete`、`assess`、`synthesize` | 无状态，各对应一次模型调用或纯函数，经 `trial/route-handler.withTrialAi` 从请求头取 Key |

## 5. 数据模型（`prisma/schema.prisma`）

| 域 | 模型 | 要点 |
|---|---|---|
| 投递 | `BossContact`（历史命名 = 所有投递记录）、`DismissedApplication` | `sourceKey @unique`、`stage`、`autoRejectedAt`、`unchangedSince` |
| 简历 | `Resume`、`ResumeProject`、`ResumeProjectSource` | `isDefault`；`autoExtractedAt`（未确认标记）；抽取名去重映射 |
| 面试 | `Interview`（真实 / 模拟共用壳，`kind`、`status`、`evalTag` 隔离评测）、`InterviewQuestion`（一问一答，也是线程兼容层）、`InterviewImportArtifact`（导入中转，带过期）、`RoleContext`（岗位蓝图缓存） | |
| 模拟面试 | `MockInterviewSession`（`status` 状态机、`briefJson`、`contextSnapshotJson`、`hypothesesJson`、`flagsJson`、`reportJson`、`pace`）、`MockInterviewMessage`（`clientId` 幂等）、`InterviewEvent`（**唯一真相**，`seq` 追加）、`InterviewThread`（切出的段：`verdict`、`depth`、`startSeq/endSeq`、`competencyId`、`difficulty`）、`InterviewQuestionEvaluation`（`evaluationStatus`、维度、`strengthsJson` / `weaknessesJson`（带练法）、`verdict`、`resumeChecksJson`、`exemplarJson`） | 状态：`generating → in_progress → ready_to_evaluate → evaluating → completed`，失败 `generation_failed` |
| 画像 | `AbilityObservation`、`InterviewAssessment`（`sourceHash` 幂等）、`CandidateProfileState`（单例 + 租约）、`CandidateInsight` + `CandidateInsightEvidence`、`CandidateProfileMetric`、`CandidateProfileSnapshot`、`CandidateProfileRun`、`CandidateDossier`（跨场 Markdown 档案，`version`，`evalTag`） | 六维度：knowledge_accuracy / reasoning_depth / experience_evidence / reflection_growth / communication_clarity / delivery_fluency |
| 设置 / 记账 | `AppSetting`（键值，含 API Key）、`AgentRun`（每次模型调用与代码裁决一行，`runId` 串链，token / cached / cost / `rawText` / `systemText`） | |

## 6. 脚本与评测数据

| npm script | 用途 |
|---|---|
| `dev / build / start / lint / test`（`tsx --test "src/**/*.test.ts"`，97 个测试文件）、`db:push` | 常规 |
| `boss:login`、`boss:sync [--dry-run --max-pages N]` | Boss |
| `agent:runs [<runId> | --agent x --status failed]` | 查 AgentRun 链路 |
| `probe` | 对当前文本模型实测 `provider-contracts.md` 的契约 |
| `eval -- fixtures | scorer | coverage | compare` | 评测（见 eval.md） |
| `simulate -- --tag t --archetypes a,b --seeds n --pace p [--perturb ...] [--recompute]` | 自博弈，走真实 HTTP，产物 `eval/runs/sim-<tag>.json` |
| `ablate -- --off packs --seeds 2 --pace standard [--reuse date]` | 消融（写 / 删 `eval/ablation.json` 作进程间开关） |
| （设置）`settings/ai.ts` | 三个 AI 任务：`transcription` / `text` / `scoring`（评分模型，缺省规则见 pipeline §7），设置页各一张卡 |
| `harness-report` | 零成本盘点：输出契约救回率、预算、缓存、估计器预检 |
| `bench` | InterviewBench 子任务层：`--tasks s1,…,s6 --models main,openai:gpt-5.4-mini --label x`，数据在 `eval/bench/`，产物 `eval/bench/runs/` |
| `compare-runs a.json A b.json B` | 两批 run 配对（只作发布门禁） |
| `replay <sessionId>`、`resegment <id>`、`recall <resumeId>`、`postmortem <id>` | 事件重建、重切、看档案、单场复盘（均不调模型） |

`eval/`：`jd/`（43 份 JD 含注入 edge 用例）、`resumes/`（5 份合成简历）、`personas/`、`scripts/`、`scorer/`、`judges/`（裁判校准集）、`coverage.json`、`mianjing/`（面经话题表）、`runs/`（产物，只保留 `baseline-* / base-* / fix-*`）。所有评测脚本走 `tsx --conditions=react-server`。

## 7. 配置

- `.env.example`：`DATABASE_URL`、`APP_MODE`、`OPENAI_API_KEY / BASE_URL / INTERVIEW_MODEL / TRANSCRIPTION_MODEL`（也可在应用内配）。
- `next.config.ts`：`outputFileTracingIncludes` 带上 `SKILL.md`、pdfjs cmaps（缺了中文简历丢字）、ffmpeg；`serverActions.bodySizeLimit 11mb`；`proxyClientMaxBodySize 26mb`；`experimental.viewTransition`。
- `Dockerfile` / `docker-compose.yml`：node 22 两阶段，卷 `offercome-data:/data`（db）与 `offercome-local:/app/.local`。`vercel.json` 只声明框架。
- CI：`.github/workflows/docker-image.yml` 只构建镜像，不跑 lint / test。
