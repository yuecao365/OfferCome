# 面试后：从线程切段到报告与画像

> 上一篇：[面试中](interview-flow-during.md) · 首篇：[整体流程](interview-flow-overview.md)
> 代码：`interviewer/segments.ts`（切段）→ `interviewer/session.ts`（写兼容题目）→ `question-evaluation-background.ts` / `question-evaluation-service.ts` / `question-evaluation-agent.ts`（逐题评分）→ `completion.ts` + `summary-agent.ts` + `scoring.ts`（交卷与报告）→ `candidate-profile/`（画像）。

## 0. 总览

```mermaid
flowchart TD
  T[线程关闭<br/>close_thread / close_interview / 跳过] --> SEG[切段 threadSegment]
  SEG --> Q[写 InterviewQuestion<br/>+ Evaluation(pending)<br/>rubric / expectedSignals / metadata]
  Q --> BG[后台逐题评分 agent<br/>after()]
  E[面试结束<br/>ready_to_evaluate] --> BTN[用户点 生成面试报告<br/>POST /complete]
  BTN --> WAIT[等在途评分 ≤32s<br/>补跑 failed / pending]
  WAIT --> TOTAL[总分 = 各题分数平均]
  TOTAL --> SUM[汇总 agent<br/>summary / strengths / improvements / actionPlan]
  SUM --> DONE[status=completed<br/>reportJson]
  DONE --> PROF[画像刷新（后台）<br/>assessment + synthesis]
  DONE --> PAGE[报告页]
```

## 1. 线程 → 一道题（`segments.threadSegment`）

**定义**：兼容题目是把一条线程压成"题 + 答"的一行 `InterviewQuestion`，让原有的逐题评分、复盘、画像链路不用改就能消费对话式面试。

```
question = 切入问题
           + "\n追问 1：" + 第 1 条 probe 的完整话
           + "\n追问 2：" + …
answer   = 该线程内候选人所有 kind=answer 的消息，用空行拼接
skipped  = 线程状态是 skipped，或 answer 为空
probeCount = probe 消息数
```

注意追问消息是面试官整段话（回应语 + 问句），原样进入题目文本。

写入时（`session.persistTurn`）：

| 字段 | 值 |
|---|---|
| InterviewQuestion.category | project→resume_project；behavioral→general；technical→technical |
| InterviewQuestion.answer / skippedAt | 跳过则 answer=null、skippedAt=now |
| Evaluation.difficulty | 固定 "standard" |
| Evaluation.sourceKind | 领域 kind |
| Evaluation.rubricJson | 该领域的评分表（按 kind + style 固定，见上上篇 5.7） |
| Evaluation.expectedSignalsJson | 该领域的期望信号 |
| Evaluation.generationMetadataJson | `{ areaId, areaName, areaKind, areaStyle, competencyOrigin: jd | baseline, skillPack, note（面试官关线程时的判断）, depth, probeCount }`。competencyOrigin 由代码推：领域绑定了蓝图能力为 jd，否则有 baseline 来源为 baseline |
| Evaluation.evaluationStatus | pending（跳过的题不调度评分） |

## 2. 后台逐题评分

### 2.1 调度与并发

`scheduleMockInterviewQuestionEvaluation(questionId)` 用 Next 的 `after()` 在响应返回后执行。`evaluatePersistedMockInterviewQuestion`：

1. 认领：`updateMany` 把 pending / failed 改成 running，改不中说明别人在跑
2. 调评分 agent
3. 只允许仍持有 running 的调用写终态（交卷路径可能把超时的评分强制置 failed 并重跑，迟到的旧结果必须被丢弃）
4. 失败：置 failed 并记录错误，交卷时补跑

### 2.2 评分 agent（`question-evaluation-agent.ts`）

输入：`{ jobTitle, jobDescription≤12000, question, answer≤20000, rubric, expectedSignals }`。

输出 schema：

```
dimensions[]: { name（必须逐字等于 rubric 里的名字）, score 0–100, evidence≤500（回答原文证据） }
strengths[≤5], improvements[≤5], feedback≤1000
```

提示词（原文）：

> 你是模拟面试逐题评分 Agent。只根据预先确定的 rubric 维度和候选人的实际回答评分。dimension name 必须逐字使用 rubric 中的名称；每个维度给出 0 到 100 的分数和回答中的具体证据，没有证据时不得臆测。评价用于训练，不输出录用或淘汰结论。

代码校验（`validateQuestionEvaluation`）：维度名与评分表逐一对应，缺的补 0、多的丢；分数夹在 0–100。

### 2.3 单题分数（`scoring.computeQuestionScore`）

按评分表权重加权平均，四舍五入到整数：

```
score = round( Σ(维度分 × 权重) / Σ权重 )
```

例：technical 评分表，技术正确性 92 × 50 + 分析与取舍 70 × 30 + 表达结构 85 × 20 → (4600 + 2100 + 1700) / 100 = 84。

### 2.4 真实例子

腾讯 Agent Harness 场，A1 线程（切入 + 1 层追问）的评分：

```
技术正确性 92  证据："回答按请求生命周期分层：'第一层看上下文构建'、'第二层看计划生成'……
               提到'同一个 trace_id 下'和'LangSmith 看 timeline'也符合定位思路。
               不足是对追问中'证明是模型没想到而不是后面断了'的证据链展开不够"
总分 83
strengths: 能按 request / plan / tool call / state 回传分层定位问题；能给出具体 trace 证据字段；能结合 LangSmith、SQLite 说明落地
improvements: 补充每类证据分别能排除什么假设；加入 error type、retries、state snapshot；补充采样与成本权衡；说明 replay / 最小复现
```

### 2.5 当前判分偏严的两个来源（待修）

1. **线程深度没有进入评分**。一条追到第 4 层的线程和只问了切入问题的线程，评分 agent 看到的都是"一道题 + 一段回答"。深层追问本来就往失守点问，答不上是正常的，但会被当成"没答全"扣分。`generationMetadataJson` 里已经有 `depth` 与 `probeCount`，只是没传给 agent。修法：把深度传进去并明确"追问越深、答不上越正常，按达到的深度给分"。
2. **没有分带锚点**。提示词只说 0–100，模型默认按"完美答案"扣分。修法：给出分带描述（90 以上 / 70–89 / 50–69 / 50 以下各代表什么），并说明按轮次与校招 / 社招标准评价。

## 3. 面试结束的两条路

| 触发 | 结果 |
|---|---|
| 面试官 close_interview（区间内自行判断，或到上限被迫） | 关掉 active 线程并切段；`status=ready_to_evaluate` |
| 候选人点"结束面试"或说"结束" | 同上，无视回合下限；进行中的线程照样切段评分，没问到的领域不产生题目、不计分 |

房间显示"面试已结束"和"生成面试报告"按钮。

## 4. 交卷（`completion.completeMockInterview`，`POST /complete`）

1. 已有报告直接返回；状态不是 ready_to_evaluate 或还有既没回答也没跳过的题 → 报错
2. 乐观锁把状态改成 evaluating；抢不到说明另一个请求在评分
3. **收集评分**：等在途（running）的评分最多 32 秒；pending / failed 的当场补跑；仍不完整 → 退回 ready_to_evaluate 并报"仍有题目正在评分"
4. **总分**：所有题（含跳过的，按 0 分）的平均值，四舍五入
5. **汇总 agent**（`summary-agent.ts`）：输入岗位名 + 每题（题目 ≤800 字、分数、反馈 ≤600 字）。提示词：

   > 你是模拟面试报告汇总 Agent。根据已完成的逐题评分总结整体表现、优势、改进方向和行动计划。不得重新评分，不得计算或输出总分，不得臆造逐题反馈之外的表现。

   输出 `{ summary≤2000, strengths[≤6], improvements[≤6], actionPlan[≤8] }`。全场都跳过时不调模型，用固定文案。
6. 事务：`status=completed`、`totalScore`、`reportJson`、`completedAt`；`Interview.status=completed`
7. 任一步失败 → 退回 ready_to_evaluate，用户可再点一次
8. 事务外：`enqueueCandidateProfileRefresh()`

## 5. 能力画像刷新（`candidate-profile/`，后台）

两段：

- **评估器（profile_assessment）**：逐题判断哪些画像维度适用，只输出适用维度，用带行为锚点的 1–5 级量表（1 关键内容缺失或错误 … 3 达到常规面试要求 … 5 准确、深入、可迁移且有明确取舍），`evidenceExcerpt` 必须逐字摘自回答；明确禁止从文本推断口语、情绪、性格、身份或录用概率
- **合成器（profile_synthesis）**：服务端已算好等级、趋势、证据权重，模型只提炼洞察（弱项、训练重点等），不能重新打分

这些洞察下一次备课时作为 `knownWeaknesses` 进入简报 agent，形成闭环。

## 6. 报告页（`mock-interview-report.tsx` + 会话页）

| 区块 | 内容 |
|---|---|
| 总分 | 0–100 |
| 总体表现 | summary |
| 做得好的部分 / 优先改进 / 下一步训练计划 | strengths / improvements / actionPlan |
| 逐题反馈 | 每条线程一张卡：题目（切入 + 追问）、分数、可展开"查看我的回答"、可展开"这道题在考察什么"（领域名、领域类型与风格、来源：JD 明确要求 / 岗位常见要求（技能包 X）/ 兜底蓝图推断、期望信号） |
| 对话记录 | 可展开的完整气泡记录 |

**尚未展示（P2）**：考察领域与各领域追到第几层、面试官的工作记忆（已确认 / 存疑 / 失守）、简历假设的验证结果。数据已经在 `queries.ts` 的 conversation 里（仅 completed 状态返回），只差界面。

## 7. 数据落点一览

| 表 | 何时写 | 关键字段 |
|---|---|---|
| MockInterviewMessage | 每回合 | turnIndex, role, kind, content, threadId, toolName, clientId |
| InterviewThread | 开 / 关线程 | areaId, entryQuestion, status, depth, rescues, note, questionId |
| InterviewQuestion | 线程关闭 | question, answer, category, skippedAt |
| InterviewQuestionEvaluation | 线程关闭（pending）→ 后台（completed） | rubricJson, expectedSignalsJson, generationMetadataJson, dimensionsJson, score, feedback |
| MockInterviewSession | 每回合 / 交卷 | memoryJson, questionCount, startedAt, status, totalScore, reportJson |
| AgentRun | 每次模型调用 | agent, status, durationMs, usage, payload / output |
