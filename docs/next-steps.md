# 后续计划（2026-09-08 起）

> 面试前 / 中 / 后三段的改造已完成并提交，本文件是接下来几个阶段的总纲。每个阶段开工前先按 `interview-*-plan.md` 的格式写一份具体计划给用户看，用户放行后再动代码。

## 0. 现状（读这一节就够）

- 产品：OfferCome，本地优先的求职工作台，核心是 AI 模拟面试。技术栈 Next.js 16（App Router）+ Prisma 7 / SQLite + Vercel AI SDK v7。`AGENTS.md` 的可维护性规则必须遵守。
- 面试流程现状见四份流程文档：[总览](interview-flow-overview.md) · [面试前](interview-flow-before.md) · [面试中](interview-flow-during.md) · [面试后](interview-flow-after.md)。它们是"现状描述"，改完代码要原地更新。
- 已完成的计划（都标了执行状态）：[面试前](interview-before-plan.md)（第 5 步"简报结构指标"已并入评测）、[面试中](interview-during-plan.md)、[面试后](interview-after-plan.md)。
- 版本号：备课简报 v4、面试官提示词 interviewer-v4、评分 evaluation-v2、汇总 summary-v2、示范 exemplar-v1、报告 reportJson v2。
- 体验版（网页版，`src/lib/trial/`、`src/app/api/trial/`）仍走旧题库流程（question-generation-agent、follow-up-agent、planning），与本地版的对话式流程不同步；它只通过两个接口把评分 v2 折回旧形状。
- 未推送：`origin/main` 停在 `c974b9e`，本地领先约 30 个提交。推送前问用户。
- 用户的 `.local/` 上传目录曾丢失，默认简历以 txt 恢复，原 PDF 需用户重传。

**流程闭环完成，微调没开始。** 所有阈值（信息量目标 0.6 / 0.75 / 0.9、追问上限、分带、汇总措辞）都是拍的，只跑过两场真机。微调要先有评测这把尺子。

## 1. 阶段顺序与理由

| 阶段 | 内容 | 为什么在这个位置 | 预估 |
|---|---|---|---|
| 0 | 评测框架 | 后面每一步的回归门禁；简历上最站得住的一段 | 1–2 天 |
| 1 | 能力画像的结构检查 | 评分 v2 已给出带原话的优点短板与维度缺口，画像评估器可能不必再读一遍回答；网页端同步前先定下来，免得复刻两遍 | 0.5–1 天 |
| 2 | P3 网页端全同步 | 删掉整套旧题库流程，仓库只剩一套面试逻辑；顺手解决 Vercel 超时 | 2–3 天 |
| 3 | P2 语音面试 | 独立功能增量；两端统一后再加，界面只做一次 | 1–2 天 |
| 4 | 扩展 agent 深度 | 方向由阶段 0 的数字决定，不先列清单 | 视评测结果 |
| 5 | 前端优化 | 前四步都动界面，最后打磨 | 1–2 天 |

## 2. 阶段 0：评测框架

原则：只做能改变决策的评测；没有人工对照的"模型夸模型"分数不做。

### 2.1 面试官行为评测（trace 级，无人评）

- 数据：`InterviewTurnDecision`（提案 / 裁决 / 替换原因 / anchorHit / 信息量前后 / skillsLoaded）与 AgentRun 的 selection 指标。
- 跑法：固定脚本的候选人（正常作答、连续求提示、跑题、塞注入、发两万字、中途结束）× 真实模型，快速节奏，每个脚本一场；脚本参考本次用过的 `smoke.sh` 思路（创建会话 → 轮询备课 → 逐条 POST `/turn`）。
- 指标与期望（来自 interview-during-plan.md §9）：追问贴合率 ≥ 0.85；动作替换率越低越好；澄清占比 < 0.2；收尾信息量快速 ≥ 0.55、标准 ≥ 0.7；技能包加载率 ≥ 0.9；对抗组全部不变量成立。
- 产物：一个 `npm run eval:interviewer` 之类的脚本，输出一张表并存 JSON；进文档。

### 2.2 评分器校准（有人工对照）

- 用户标注 30–40 条线程级样本（分带 + 一句短板），存仓库 `eval/` 下的 JSON。
- 指标：与人工分带的一致率 / Spearman；同一输入复跑 3 次的方差；面试官现场判断（note 含"失守 / 没答上"）与事后分数的分歧率；`quoteMissing`、`unexplainedLowScore` 的比率。
- 校准对象是 evaluation-v2 提示词；每改一次提示词跑一遍。

### 2.3 必须留下的故事

评测建好后专门对比一次提示词改动（例如评分器分带有无、或面试官锚点硬门前后），把指标差异记进文档。面试时讲的就是这一段。

### 2.4 明确不做

备课简报的结构指标、成对偏好判分、任何"综合质量分"。旧的 `docs/eval-plan.md` 描述的是已删除的套件，已删。

## 3. 阶段 1：能力画像检查

要回答的问题：

1. `candidate-profile/assessment-agent.ts` 逐题重读回答产出 1–5 级观察，与评分 v2 的维度分 + 证据 + 缺口是否重复；能否直接从评分结果推导观察，去掉一次模型调用。
2. 画像维度（`PROFILE_DIMENSION_LABELS`）与评分表维度、简报领域 kind / style 之间的映射是否清楚。
3. 画像洞察反哺备课（`knownWeaknesses`）是否真的改变了简报；用阶段 0 的脚本验证一次。
4. 画像页的"近期定性反馈"卡已读 weaknesses；其余展示是否还依赖旧字段。

## 4. 阶段 2：P3 网页端全同步

- 目标：体验版跑与本地版相同的对话式流程，状态存浏览器，服务端无状态。架构见记忆 `trial-parity-architecture`（View + 注入 + 纯函数复用）。
- 新接口：`/api/trial/brief`（备课）、`/api/trial/turn`（回合，流式）、`/api/trial/complete`（交卷）；纯函数（reducer、evidence、budget、conversation、report）直接复用。
- 删除：question-generation-agent、follow-up-agent、follow-up-policy、planning、体验版旧房间 `mock-interview-room.tsx`、创建页的难度 / 题目数量下拉、`MOCK_INTERVIEW_DIFFICULTIES`、`LegacyMockInterviewReport` 与两处改名映射。
- Vercel 超时（记忆 `trial-interview-vercel-timeout`）：备课拆成可轮询的两步，回合接口流式返回。
- 不可对齐项（trace 页、画像后台）保持本地版专属。

## 5. 阶段 3：P2 语音面试

- 房间内录音 → 转写（已有 `transcription.ts`、`audio.ts`）→ 作为候选人消息发 `/turn`，`voiceMetricsJson` 并入消息元数据（落点已留）。
- 语音指标只作辅助信号进报告，不进评分。
- 两端同一套界面。

## 6. 阶段 4：扩展 agent 深度（候选，等评测定）

- 评分器多次采样取一致 / 自洽检查
- 面试官回合的自我校验步骤（说话前检查是否回应了候选人的原话）
- 成本与延迟预算进决策记录，trace 页展示
- 画像反哺备课的效果验证
- 对抗用例扩展到备课与评分（注入 JD、注入回答）

## 7. 阶段 5：前端优化

已有材料：[frontend-polish-plan.md](frontend-polish-plan.md)、[frontend-redesign-research.md](frontend-redesign-research.md)。等前四步稳定后重新评估哪些还适用。

## 8. 工作方式（新 session 也要遵守）

- 每阶段先写计划文档给用户看，放行后再改代码；用户会明确说"开始实施第 x 步"。
- 过时、冗余代码直接删，不留平行实现；结构清晰优先于最小 diff。
- 每步独立提交，本地提交不推送；提交信息用中文。
- 真机验证用 `http://localhost:3000`（不能用 127.0.0.1）；改 Prisma schema 后 `npx prisma db push` + `npx prisma generate`，再重启 dev 预览并清 `.next`。
- 子 agent 禁用 WebFetch；长脚本用 Write 写到 scratchpad 再执行。
- 流程文档改完代码原地更新。
