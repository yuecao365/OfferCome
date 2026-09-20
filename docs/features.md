# 功能与实现要点

> 现状描述（2026-09-20）。功能行为或入口变化时原地更新。每个功能：用户能做什么、入口、实现要点、体验版差异。模拟面试的逐步实现单独在 [interview-pipeline.md](interview-pipeline.md)。

## 1. 数据概览（`/`）

投递统计与趋势、面试统计、待面日程、"开始清单"（数据驱动隐藏）。Hero 大数字用 `useCountUp`。取数 `applications/queries.getApplicationStats`、`applications/analytics.buildApplicationTrend`、`interviews/queries.getInterviewStats`、`interviews/upcoming`。

## 2. 投递管理（`/applications`）

- 手工新增 / 编辑 / 删除投递，推进阶段，筛选（阶段、来源、关键词），从投递直接"记录面试"或"开模拟面试"。
- 数据表 `BossContact`（历史命名，实为所有投递；新代码一律 application 语义）。删除进 `DismissedApplication` 黑名单，同步时跳过。
- **Boss 直聘同步**（仅本地）：`npm run boss:login` 或按钮拉起本机 Chrome / Edge 登录；同步用手写 CDP 客户端（`boss/cdp.ts`，只开 Network + DOM 域，屏幕外窗口）翻"沟通过"标签页的经典分页，从 `Network.getResponseBody` 解析 `geekGetJob`（`code===0` 判成败；`totalCount` 是历史计数不是可拉取数）。**同步规则**：仍在"已投递"且 30 天无动静的标"已拒绝"（`autoRejectedAt`）。禁 Node 直连 / headless / Playwright（账号曾被封）。
- 体验版：无 Boss 同步（需浏览器扩展，未做），其余相同。

## 3. 简历中心（`/resumes`）

- 上传 PDF / Word / 图片（`documents/extract-text.ts`，pdfjs 需 cmaps 否则中文丢字），设默认简历，内嵌预览，原件在 `.local/uploads`（`resumes/storage.ts` 防路径穿越）。
- 上传后规则 + 模型抽取实习 / 项目（`experience-agent.ts`，`resume-experience-v2-title-only`），进确认面板；用户编辑即清 `autoExtractedAt`。项目条目 `ResumeProject` 是模拟面试的材料来源。
- 体验版：文件进 IndexedDB，解析走 `/api/trial/resume`。

## 4. 面试记录与导入（`/interviews`、`/interviews/history`）

- 手工记录真实面试（公司、轮次、日期、题目与回答）；工作台页看阶段流、转化率、日程。
- **导入**：录音（≤ 25MB，超限 `audio-splitter` 动态加载 ffmpeg 切块）或逐字稿 / 笔记 → 转写（OpenAI / 通义 / 豆包，可带说话人分离）→ `draft.structureInterviewText` 结构化成问答草稿（启发式 + 模型 `interview-draft-v1`）→ 用户审核后落库。材料类型与"哪位是我"自动推断，不问用户。语音指标 `voice-metrics.ts` 只作辅助信号。
- 即将到来的面试有**备战页** `/interviews/prepare/[id]`：按薄弱维度（`prepare-rules.pickWeakDimensions`）挑复习点，可直接开针对练习。
- 体验版：录音导入未做（整场录音待定），文本导入相同。

## 5. 面试复盘（`/interviews/review`）

- 跨面试聚合相似题（`text/similarity.questionSimilarity`），比较历次回答，按项目 / 题库浏览，重新归类；来源筛选（全部 / 真实 / 模拟）。查询限定"已完成 + 已作答"，进行中的模拟题不出现。
- "用这题再练"种子（`mock-interviews/seeds.ts`）目前只支持真实且已完成面试的题。

## 6. AI 模拟面试（`/interviews/mock`，核心）

用户选简历、贴 JD（必填）、选节奏（快速 / 标准 / 深入），系统备课后进全屏房间对话，结束后自动出报告。细节见 [interview-pipeline.md](interview-pipeline.md)，这里只列产品面：

| 阶段 | 用户看到 | 实现入口 |
|---|---|---|
| 备课 | 进度卡；失败给"重新备课 / 就这样开始" | `generation.prepareMockInterview`：蓝图（JD 分析，同会话重试复用快照）→ 上下文（简历、项目、最近短板、档案）→ 面试官 loop 第一段 `write_plan` 出简报 → `briefReady` 不成自动再备一次 |
| 面试 | 房间：面试官一次一问，候选人可打字或**语音**（录音 → `/transcribe` → 作为回合发送；面试官按句 speechSynthesis 朗读），可"跳过 / 结束"；顶栏材料进度；资料抽屉看简报 | `orchestrator.startTurn` → `turn.runTurn`：一回合一次非流式调用，模型经 `ask_candidate` 说话；动作先校验（`constraints.checkAction`）再落事件；`clientId` 幂等 |
| 报告 | 从上到下：总分（旁边一行写按哪几种材料、什么权重算的）与两句总评 → 失守在哪、练什么（≤ 5 条，每条短板 + 练法 + 所在段）→ 站得住的（≤ 3）→ 简历上的说法（已验证 / 没讲清展开，没问到合成一行）→ 能力估计（只列测到的，没测到合成一行）→ 逐段反馈默认折叠（折叠行 = 段名 · 分 · 一句结论；展开有题面、维度分与缺口、短板与练法、答得好的、简历核对、我的回答、示范）→ 页尾"决策记录"链接 | `completion.completeMockInterview`：切段（纯代码，没答的最后一问不算）→ 逐题评分（工具契约，单采样）→ 示范（< 80 分或有说错的段）→ 汇总 → 档案 → 入队画像；组件 `mock-interview-report.tsx` 本地版与体验版共用 |
| trace | `/interviews/mock/[id]/trace`：逐回合动作 / 理由 / 退回原因、每步 token / 缓存 / 成本、复盘失败栏、"重放这一回合"（不落库） | `views.traceTurns`、`replayMockInterviewTurn`、`interview/eval/postmortem` |

- **节奏 = 覆盖配额**（项目 / 基础题 / 场景题：快速 1+2+1，标准 2+3+1，深入 3+4+2），每份材料有句数预算，没有时钟。
- **技能包**：备课时模型看 14 个顶层包的索引自己挑，细节包（语言、框架、主题簇，共 28 个，可属多个领域）在领域包正文末尾二级披露（至少一个领域包、JD 或简历落在上面时读一到两本细节包、最后 `project-deep-dive`，最多 3 个），读完才能 `write_plan`；面试中只带读过的包的索引，正文不回放。
- **跨场记忆**：候选人档案（`CandidateDossier`，每场整份重写）、最近短板 / 最近问过的题、简历假设结论。
- **针对练习**：从画像洞察或复盘题目发起，指定题作为 `practice` 短板带入备课。
- 体验版：会话文档存 localStorage（`TrialInterview` v8），备课 / 回合 / 评分 / 交卷由房间页在浏览器驱动五个无状态接口；界面同一棵组件树。已知：开面试可能超 Vercel 60s。

## 7. 能力画像（`/interviews/profile`）

- 六维度（知识准确、推理深度、经验证据、反思成长、表达清晰、语音流畅）等级 / 趋势 / 置信，按"全部"与每个岗位视角切换；洞察卡（strength / weakness / training_focus / pattern）带证据摘录，可锁定、修正、排除观察；洞察关系图（`profile-graph.tsx`）；近期逐题反馈卡；一键"针对练习"。
- 三相流水线 `candidate-profile/service.refreshCandidateProfile`（租约 + 分批 + 状态机，后台调度）：assessment（模拟面试**零模型调用**，`derive.ts` 从评分维度映射；真实面试才调 `assessment-agent`）→ synthesis（`rules.aggregateProfileDimension` 纯代码算等级 / 趋势 / 置信 + 每视角一次 `profile_synthesis` 提炼洞察，引用不存在的观察整条丢）→ persist（revision +1）。
- 评测场次（`evalTag` 非空）不进画像。
- 体验版：`/api/trial/assess`、`/synthesize` 无状态，调度在浏览器（`trial-profile-refresh-scheduler`）。

## 8. 设置（`/settings`）

- 本地版：按任务（文本 / 转写）配服务商、Base URL、模型、Key，测试连通；存 `AppSetting`，前端脱敏。支持 OpenAI 兼容口（DeepSeek / GLM / Kimi / Qwen 等，`provider-contracts.md` 列契约差异，`npm run probe` 实测）。
- 体验版：Key 校验后编码成连接串存浏览器（可选 session-only），随请求头发送，服务端不落盘。
- 主题：深色默认，浅色可切（`localStorage["career-agent-theme"]`）。

## 9. 宣传页（`/showcase`）

中英文案、滚动揭示、循环动效演示；体验版根域名落点，"进入产品"到 `/homepage`。

## 10. 作者自用工具（不对用户）

自博弈 / 消融 / 复盘 / 重放 / 档案查看脚本，见 [architecture.md §6](architecture.md#6-脚本与评测数据) 与 [eval.md](eval.md)。评测会话用 `Interview.evalTag` 隔离，不进列表、统计、画像与档案（评测场次可读评测写的档案）。
