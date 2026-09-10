# 面试后：从线程切段到报告与画像（报告 v2）

> 上一篇：[面试中](interview-flow-during.md) · 首篇：[整体流程](interview-flow-overview.md)
> 代码：`interviewer/segments.ts`（切段）→ `interviewer/session.ts`（写兼容题目、安排评分与交卷）→ `question-evaluation-background.ts` / `question-evaluation-service.ts` / `question-evaluation-agent.ts` / `question-evaluation.ts`（逐段评分）→ `answer-exemplar-agent.ts`（示范回答）→ `completion.ts` + `summary-agent.ts` + `scoring.ts` + `report.ts`（交卷与报告）→ `candidate-profile/`（画像）。

## 0. 总览

```mermaid
flowchart TD
  T[线程关闭<br/>close_thread / close_interview / 跳过] --> SEG[切段 threadSegment]
  SEG --> Q[写 InterviewQuestion<br/>+ Evaluation(pending)<br/>rubric / expectedSignals / metadata]
  Q --> BG[后台逐段评分 agent<br/>after()]
  BG --> EX[有短板 → 示范回答 agent]
  E[面试结束<br/>ready_to_evaluate] --> AUTO[after() 自动交卷<br/>completeMockInterview]
  AUTO --> WAIT[等在途评分 ≤32s<br/>补跑 failed / pending]
  WAIT --> TOTAL[总分 = 领域按权重加权<br/>同领域取高分]
  TOTAL --> SUM[汇总 agent<br/>读全貌：领域深度与判断、记忆、假设]
  SUM --> DONE[status=completed<br/>reportJson v2]
  DONE --> PROF[画像刷新（后台）]
  DONE --> PAGE[报告页]
```

三条原则：报告的骨架是面试官的现场判断（线程 note、工作记忆、假设验证）；负面反馈必须落到候选人的原话上，"说错了什么 / 没答上什么"与"练什么"分开；面试一结束报告自动生成，用户不点按钮。

## 1. 线程 → 一段（`segments.threadSegment`）

**定义**：兼容题目是把一条线程压成"题 + 答"的一行 `InterviewQuestion`，让原有的逐题评分、复盘、画像链路不用改就能消费对话式面试。

```
question = 切入问题
           + "\n追问 1：" + 第 1 条 probe / interrupt 的完整话
           + "\n追问 2：" + …
answer   = 该线程内候选人所有 kind=answer 的消息，用空行拼接
skipped  = 线程状态是 skipped，或 answer 为空
probeCount = probe + interrupt 消息数
answerSeconds = 候选人各条回答 composeMs 之和（秒），没有记录为 null
```

写入时（`session.persistTurn`）：

| 字段 | 值 |
|---|---|
| InterviewQuestion.category | project→resume_project；behavioral→general；technical→technical |
| InterviewQuestion.answer / skippedAt | 跳过则 answer=null、skippedAt=now |
| Evaluation.sourceKind | 领域 kind |
| Evaluation.rubricJson | 该领域的评分表（按 kind + style 固定，见面试前一篇） |
| Evaluation.expectedSignalsJson | 该领域的期望信号 |
| Evaluation.generationMetadataJson | `{ areaId, areaName, areaKind, areaStyle, competencyOrigin: jd \| baseline, skillPack, note（面试官关线程时的判断）, depth, probeCount, hinted, answerSeconds }` |
| Evaluation.evaluationStatus | pending（跳过的段不调度评分） |

代码替模型关线程（模型没给可用动作）时 note 是固定的"（由系统推进）"，报告与汇总都不把它当判断（`interviewerNote`）；候选人跳过 / 卡住 / 否定简历时的 note 也由代码固定（"候选人要求跳过""候选人卡住""候选人否认简历所写内容"）。

## 2. 后台逐段评分

### 2.1 调度与并发

`scheduleMockInterviewQuestionEvaluation(questionId)` 用 Next 的 `after()` 在响应返回后执行。`evaluatePersistedMockInterviewQuestion`：

1. 认领：`updateMany` 把 pending / failed 改成 running，改不中说明别人在跑
2. 调评分 agent
3. 只允许仍持有 running 的调用写终态（交卷路径可能把超时的评分强制置 failed 并重跑，迟到的旧结果必须被丢弃）
4. 评分落库后，有短板的段接着跑示范回答（§2.5），示范失败不影响评分
5. 失败：置 failed 并记录错误，交卷时补跑

### 2.2 评分 agent（`question-evaluation-agent.ts`，evaluation-v3）

输入：`{ jobTitle, jobDescription≤12000, question, answer≤20000, rubric, expectedSignals, thread: { depth, targetDepth, probeCount, hinted, note }, round }`。thread 来自 metadata 与简报（targetDepth 是该领域的目标深度）；体验版的旧题库流程传 `thread: null`。

输出 schema：

```
dimensions[]: { name（逐字等于 rubric）, score 0–100, evidence≤500（支持分数的原话）, gap≤300 | null（缺了什么、错在哪） }
strengths[≤4]:  { point≤200, quote≤200 }                          quote 逐字摘自回答
weaknesses[≤4]: { point≤200, quote≤200 | null, kind: error | missing }
                 error   = 一句在技术上站不住的具体陈述（quote 必须是那句原话，原样复制）
                 missing = 追问到了没答上 / 答偏 / 该讲的关键机制没出现（point 里写是哪一层追问）
                 笼统、"不够严谨"、"过于绝对"、缺细节缺数字 都不是 error（v3 起明确，之前误报成 error）
advice[≤3]:      练什么，每条对应至少一条 weakness
feedback≤800:    给候选人看的一段话，不报分数
```

提示词要点：按深度递进追问，到第 n 层答不上属正常，按达到的深度给分；note 是面试官的现场判断，分数与它明显不一致要在 feedback 里说明；期望信号只是参考，从别的角度答到位同样给分。分带：90 以上准确有取舍能迁移；70–89 主干正确细节欠缺、达到该轮次常规要求；50–69 有基本尝试但关键点缺失；50 以下关键内容错误或基本没答。轮次（一面 / 二面 / HR）写进提示词。v3 加了两条约束：关键机制没讲要在对应维度的 gap 与分数上体现，不能维度满分再在短板里补一句；出现 error 的那一层对应维度不超过 69。

代码校验（`validateQuestionEvaluation`）：维度名与评分表逐一对应，缺的补 0、多的丢；strengths / weaknesses 的 quote 去掉标点后必须是回答的子串（≥4 字），否则置空并计 `quoteMissing`；分数低于 70 却没有任何短板计 `unexplainedLowScore`。两个计数连同分数、短板数写进 AgentRun 的 selection 事件指标。

### 2.3 单段分数（`scoring.computeQuestionScore`）

按评分表权重加权平均，四舍五入到整数：`score = round( Σ(维度分 × 权重) / Σ权重 )`。

### 2.4 真实例子（v2，快速节奏，Agent 平台开发）

A1 线程：切入 + 1 层追问，候选人在追问后连续四回合只要提示。评分：

```
技术正确性 68  证据："主循环是上下文构建、LLM 推理、工具调用、结果回传、最终回复五段……最多重试两次。"
               缺口：没有说明上下文具体拼哪些内容、哪些会裁剪，也没讲模型在什么条件下决定调工具
分析与取舍 56  缺口：只描述了当前实现，没有解释为什么采用这种回传格式、重试次数如何定
表达结构   74
总分 66
strengths: 把一次执行链路拆成了明确的五段「主循环是上下文构建、LLM 推理、工具调用、结果回传、最终回复五段」…
weaknesses: missing 第 1 层追问：上下文构建时具体拼哪些内容、哪些会裁剪掉没有答；missing 第 1 层追问：模型在什么条件下决定调工具……
advice: 补一版完整的 Agent 主循环设计稿，重点写清上下文构建的输入源、裁剪规则、token budget 分配……
指标: quoteMissing 0, unexplainedLowScore 0, weaknessCount 4
```

### 2.5 示范回答（`answer-exemplar-agent.ts`，exemplar-v1）

只给 weaknesses 非空的段生成。输入：题目、候选人的回答、weaknesses、简历（≤6000 字）、该场加载过的技能包索引（agent 可 `load_skill` 一次）。输出 `{ exemplar≤1200, addressed[]（回应了哪几条 weakness） }`。

硬约束：示范里的项目事实只能来自简历或回答；代码抽取示范里的每个数字，简历与回答里都找不到的抹成"……"，记 `fabricatedDetail` 并把示范标为 `degraded`（报告页提示"示范里省略了无法核实的数字"）。存 `Evaluation.exemplarJson`。真机两场里一处数字被抹掉，其余示范全部能在简历或回答里找到出处。

## 3. 面试结束的两条路

| 触发 | 结果 |
|---|---|
| 面试官 close_interview（信息量达标后自行判断，或到安全上限被迫） | 关掉 active 线程并切段；`status=ready_to_evaluate`；同一处 `after()` 安排自动交卷 |
| 候选人点"结束面试"或说"结束" | 同上，无视信息量目标；进行中的线程照样切段评分，没问到的领域不产生题目、不计分 |

房间显示"面试已结束，正在评分并生成报告"并每 3 秒刷新；报告一出来页面切回带导航的报告视图。超过 90 秒还没出来（评分失败会把会话退回 ready_to_evaluate）才显示"重新生成报告"按钮，它调原来的 `POST /complete`。

## 4. 交卷（`completion.completeMockInterview`）

1. 已有报告直接返回；状态不是 ready_to_evaluate → 报错；没有简报（旧流程会话）→ 报错
2. 乐观锁把状态改成 evaluating；抢不到说明另一个请求在评分
3. **收集评分**：等在途（running）的评分最多 32 秒；pending / failed 的当场补跑；仍不完整 → 退回 ready_to_evaluate 并报错
4. **领域结果**（`areaOutcomes`）：每个问到过的领域：几条线程的最大深度、最后一条的面试官判断、各线程分数（跳过记 0）、最高分那条的 weaknesses
5. **总分**（`scoring.computeInterviewTotalScore`）：`round(Σ w_a · max(scores_a) / Σ w_a)`，只算问到过的领域
6. **汇总 agent**（`summary-agent.ts`，summary-v2）。输入：

   ```
   jobTitle, round, pace
   areas[]: { name, kind, style, weight, depthReached, targetDepth, threadNote, skipped, score, weaknesses[] }
   memory: { established[], doubtful[], failed[] }
   hypotheses[]: { text, status: open | confirmed | refuted, note }
   ```

   输出 `{ summary≤1200, strengths[≤5]{point, areaName}, weaknesses[≤5]{point, areaName, kind: error | missing | pattern}, advice[≤5], hypotheses[]{text, status, verdict≤120} }`。代码校验：areaName 必须存在，pattern 至少要两个领域有短板否则降为 missing；简历假设以输入为准，面试官标过的状态不动，没标过的由模型定，没问到的结论固定为"这场没有问到。"，结论开头的状态词去掉。措辞：refuted 用"没有讲清楚""还需要更多证据"，不用"被否定"。全场都跳过时不调模型，用固定文案。
7. 事务：`status=completed`、`totalScore`、`reportJson`（v2，见 `report.ts`）、`completedAt`；`Interview.status=completed`
8. 任一步失败 → 退回 ready_to_evaluate，房间超时后给重试
9. 事务外：`enqueueCandidateProfileRefresh()`；评测运行器跑出的面试（`Interview.evalTag` 非空）跳过这一步，不进画像

报告 v2 形状：`{ version: 2, totalScore, summary, strengths[], weaknesses[], advice[], hypotheses[] }`。库里两条 v1 报告已一次性升成 v2（improvements + actionPlan → advice），代码不再读 v1。

## 5. 能力画像刷新（`candidate-profile/`，后台，ability-assessment-v5）

一条链：观察 → 分维度指标 → 洞察。六个维度（知识准确性、分析深度与取舍、经历证据与结果、复盘学习与改进、表达结构与清晰度、口语流畅与节奏）都有明确来源，没有来源的维度不设。

- **观察**（`assessment.ts`，每场面试一次，按 sourceHash 幂等）
  - 模拟面试：**纯代码从逐段评分推导**（`derive.ts`），零模型调用。评分表维度按 `interviewer/brief.ts` 的 `PROFILE_DIMENSION_BY_RUBRIC` 归属画像维度（技术正确性 / 准确性 → 知识准确性；分析与取舍 / 原理深度 → 分析深度；表达结构 / 复盘与表达 → 表达结构；事实与细节 / 证据充分性 → 经历证据；判断与反思 → 复盘改进；岗位关联不进画像）。分数按共同分带对齐：< 50 → 1，50–69 → 2，70–79 → 3，80–89 → 4，≥ 90 → 5。证据用评分给出的回答原话（逐句去引号后逐字校验，置信度 0.9），没有原话就用维度缺口（"缺口：…"，0.6），两者都没有不产出。评分重跑过（`evaluatedAt` 变）就重新推导。
  - 真实面试：没有评分表，由**评估器（profile_assessment）**逐题判断适用维度，1–5 级带行为锚点，`evidenceExcerpt` 必须逐字摘自回答；禁止从文本推断口语、情绪、性格、身份或录用概率。
  - 语音：`delivery_fluency` 只由语音指标代码推导（模拟面试按题、真实录音按整场）。
  - 用户改过维度或排除过的观察，重新评估后按（题，原维度）对上照旧生效。
- **指标**（`rules.ts`）：每场取一个点（组内按置信度加权），来源权重 × 180 天半衰期，趋势要三个日期。
- **合成器（profile_synthesis）**：服务端已算好等级、趋势、证据权重，模型只提炼洞察（弱项、训练重点等），不能重新打分。

反哺备课不走洞察：画像页的"近期定性反馈"卡和下一场备课的 `recentWeaknesses` 读的都是逐段评分的短板（`mock-interviews/recent-feedback.ts`），见面试前一篇 §2。洞察是维度级的教练话术，备课需要的是考点。

评测会话的隔离：`Interview.evalTag` 非空的面试由评测运行器创建（见 [eval.md](eval.md)），面试历史、工作台最近面试、最近模拟面试、画像的已完成面试与近期反馈、训练种子都用 `REAL_USAGE_INTERVIEW_WHERE`（`evalTag: null`）排除它们。

## 6. 报告页（`mock-interview-report.tsx` + 会话页）

| 区块 | 内容 |
|---|---|
| 总分 + 总体评价 | 0–100；summary |
| 考察领域 | 每个问到过的领域一行：名称、类型、权重、追到第几层 / 目标几层、面试官关线程时的判断、得分；跳过的标出。注明"总分按领域权重加权；跳过的领域计 0 分，没问到的领域不计" |
| 简历上的说法经不经得起问 | 每条假设：状态徽章（已验证 / 没有讲清楚 / 没问到）、假设原文、一句结论 |
| 站得住的 / 失守在哪 / 下一步练什么 | 三栏；短板标"说错了 / 没答上 / 反复出现"并挂领域名 |
| 逐段反馈 | 每条线程一张卡：题目（切入 + 追问）、作答用时、分数、可展开"查看我的回答"、可展开"这道题在考察什么"（领域、来源、风格、期望信号、面试官的判断）、feedback、维度分（证据 + 缺口）、答得好的与短板（带原话引用）、练什么、可展开"用你的项目，这段可以这样答" |
| 面试官的工作记忆 | 折叠：已确认 / 存疑 / 失守原文 |
| 决策记录入口 + 对话记录 | 会话页提供 |

## 7. 数据落点一览

| 表 | 何时写 | 关键字段 |
|---|---|---|
| MockInterviewMessage | 每回合 | turnIndex, role, kind, content, threadId, toolName, clientId, metricsJson |
| InterviewThread | 开 / 关线程 | areaId, entryQuestion, status, depth, hinted, note, questionId |
| InterviewQuestion | 线程关闭 | question, answer, category, skippedAt |
| InterviewQuestionEvaluation | 线程关闭（pending）→ 后台（completed）→ 示范 | rubricJson, expectedSignalsJson, generationMetadataJson, dimensionsJson, score, strengthsJson, weaknessesJson, adviceJson, exemplarJson, feedback |
| MockInterviewSession | 每回合 / 交卷 | memoryJson, questionCount, startedAt, status, totalScore, reportJson |
| Interview | 创建 / 交卷 | status, interviewedAt；evalTag（评测运行器写，真实使用为 null） |
| AgentRun | 每次模型调用 | agent, status, durationMs, usage, payload / output；selection 事件的 metricsJson 记 quoteMissing、unexplainedLowScore、fabricatedDetail |

## 8. 真机验证（2026-09-08，快速节奏，Agent 平台开发）

两场脚本驱动的面试（候选人连续四回合只要提示，之后正常作答）：

- 面试官收尾后不点按钮，会话在几十秒内变成 completed，房间自动切到报告页
- 第一场只有一个领域、追到第 1 层就被迫收住，总分 66；评分给了 4 条 missing 短板（每条写明是第 1 层追问的哪个点）、3 条建议，示范回答加载了 1 个技能包且没有编造数字
- 第一场的 4 条引用被置空（`quoteMissing 4`），原因是模型给引用加了“”而校验按原字符串比对；改为去标点后比对，第二场引用全部保留
- 第二场两个领域，总分 48；一处示范里的数字核实不到被抹掉（`fabricatedDetail 1`）
- 汇总的假设结论一开始把状态词写进结论开头、没问到的写成"open"，现在由代码统一：没问到的固定措辞，其余去掉状态前缀

顺带修掉的面试中问题：提示 / 澄清次数用完后模型再提就被换成 close_thread，单领域的面试因此在第 6 回合结束（当时的修法是用完只剩一句话不关线程；v5 起提示只有一次、第二次卡住由代码换题，见面试中一篇 §3）；简报只给一个领域时代码补齐领域数。

## 9. 体验版（网页版）怎么走这一段

| 本地版 | 体验版 |
|---|---|
| 线程关闭 → `after()` 跑 `evaluatePersistedMockInterviewQuestion`（评分 + 示范） | 线程关闭 → 页面后台调 `POST /api/trial/evaluate`（同一个评分 agent + 示范 agent，一次请求），结果写进文档段落；失败标 failed，交卷时补跑 |
| 面试结束 → `after()` 自动交卷 `completeMockInterview` | 面试结束 → 房间页 `completeTrialMockSession`：等在途评分、补跑 pending / failed，调 `POST /api/trial/complete`（`outcome.ts` 同一套拼装 + 汇总 agent），报告写进文档并把这场投影到工作台历史（`addCompletedMockInterview`，题目带完整评分） |
| 报告页读库（`queries.ts` → `views.ts`） | 报告页读文档（`mock-view.ts` → 同一个 `views.ts` / `teaching.ts`），逐段维度分、短板、示范、面试官记忆、假设都在 |
| 画像后台任务：模拟面试由评分推导，真实面试调评估器 | 浏览器里跑（`profile-actions.ts`）：模拟面试同样由 `deriveObservationsFromEvaluation` 推导，零模型调用；真实面试调 `/api/trial/assess` |
