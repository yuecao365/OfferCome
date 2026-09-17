# 面试后：从整理员切段到报告与画像（报告 v2）

> 重建后（2026-09-15，阶段 C）：面试结束后从逐字稿切段；§11（2026-09-16）起切段是纯代码，段的判断由评分写回；之后的评分、汇总、画像链路不变。

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
  WAIT --> TOTAL[总分 = 每个话题按种类权重加权<br/>项目 3 · 场景 2 · 基础 1]
  TOTAL --> SUM[汇总 agent<br/>读全貌：每个话题的种类、轮数与判断、记忆、假设]
  SUM --> DONE[status=completed<br/>reportJson v2]
  DONE --> PROF[画像刷新（后台）]
  DONE --> PAGE[报告页]
```

三条原则：报告的骨架是评分与面试官的工作记忆（笔记、假设验证）；负面反馈必须落到候选人的原话上，"说错了什么 / 没答上什么"与"练什么"分开；面试一结束报告自动生成，用户不点按钮。

## 1. 切段：逐字稿 → 话题段（`src/lib/interview/aftermath/`，纯代码，§11.2）

**触发**：交卷（`completeMockInterview`）第一步 `ensureSegments`，幂等——已有分段直接返回；`resegment` 删掉旧分段与兼容题目重切（调试用）。体验版在浏览器里直接调同一个纯函数。

**切段**（`cut.ts`，`cutSegments`）：§10 起每句面试官的话都带代码指派的材料 id 与角度，一段 = 进入一份材料的第一句提问（`kind: say`）起，到下一份材料之前；答疑（`aside`）与代码接的话归当前段；开场与告别不算段。每段带材料 id、种类、名称、切入问法、追问数（答疑不算）、问过的角度（`facets`）、候选人的回答（按钮替说的话不算）、有没有实质回答（`skipped`；每句都是"我不会"的段 `unanswered`：记 failed、不评分）。不需要模型，结果与面试中的决策完全一致。

**段的判断由评分写回**：切段时线程只有 `verdict: skipped | answered`（有没有回答）；评分落库后按分数推导（`verdictForScore`：< 50 failed、< 70 thin、其余 answered），`difficulty`（答到阶梯第几层 1–4）与 `competencyId`（主要考的能力）由评分 agent 多输出的两个字段写回（场景题的能力切段时就按材料绑定）。`note` 不再有。简历假设的验证交给汇总 agent，交卷时把结论写回 `hypothesesJson`（跨场记忆 `previousClaims` 读它）。

**重切**：`npm run resegment -- <sessionId> [...]` 按当前代码重切已结束的场次（删旧段、兼容题目与评分，评分同步跑完）。

**落库**（一个事务）：每段一行 `InterviewThread`（areaId、kind、label、entryQuestion、depth、verdict、startSeq、endSeq、competencyId、difficulty）+ 一行兼容 `InterviewQuestion`（题目 = 第一问 + "追问 n：…"，回答 = 候选人在这段里的话；`generationMetadataJson` 带 areaId / areaName / areaKind / competencyOrigin / skillPack / facets / facetsDone / facetsAll（报告页列"追问的角度"：讲透了 / 问过没讲透 / 没问到）/ depth / probeCount / verdict / startSeq / endSeq）。

**评分的引用硬门与置信**：strengths / weaknesses 里写了引用却不在回答里的条目整条丢掉（不再只是置空）；`resumeChecks` 两头都要是原话（claim 在回答里、resumeSays 在简历里），少一头整条丢。同一段两次采样：带工具的作数，不带工具的只作对照——总分相差超过 15 标 `lowConfidence`（报告里提示"仅供参考"，不改分）；带工具那份调了工具时分差记 `toolShift`（工具改了多少分）。任一成功即出分。

## 2. 后台逐段评分

### 2.1 调度与并发

`scheduleMockInterviewQuestionEvaluation(questionId)` 用 Next 的 `after()` 在响应返回后执行。`evaluatePersistedMockInterviewQuestion`：

1. 认领：`updateMany` 把 pending / failed 改成 running，改不中说明别人在跑
2. 调评分 agent
3. 只允许仍持有 running 的调用写终态（交卷路径可能把超时的评分强制置 failed 并重跑，迟到的旧结果必须被丢弃）
4. 评分落库后，有短板的段接着跑示范回答（§2.5），示范失败不影响评分
5. 失败：置 failed 并记录错误，交卷时补跑

### 2.2 评分 agent（`question-evaluation-agent.ts`，evaluation-v5：跑在 G1 循环上，带三个只读工具）

输入：`{ jobTitle, jobDescription≤12000, question, answer≤20000, rubric, expectedSignals, thread: { kind, depth, probeCount, facets }, round, competencies, resumeText, skillPacks, memory }`。后三项给工具：`lookup_resume`（按关键词查简历原文，逐字返回）、`load_skill`（技能包全文，索引在提示词里）、`recall_sessions`（按关键词查会话快照里的候选人档案；没有档案不给）。用法写进提示词、代码不替它选：项目段先核对回答里的数字与事实（最多 2 次），基础 / 场景段拿不准时查技能包（最多 1 次），上几场也漏了同一机制的在 feedback 里点出"反复出现"。预算 3 步工具 + 1 步结论；`beforeTool` 拒绝同一工具同样入参的重复调用。thread 来自切段 metadata（kind 是这个话题的种类：基础题通常一两轮、一两句回答是正常的，评分按问到的那一层答得准不准给）；metadata 不全时传 `thread: null`。

输出 schema：

```
dimensions[]: { name（逐字等于 rubric）, score 0–100, evidence≤500（支持分数的原话）, gap≤300 | null（缺了什么、错在哪） }
strengths[≤4]:  { point≤200, quote≤200 }                          quote 逐字摘自回答
weaknesses[≤4]: { point≤200, quote≤200 | null, kind: error | missing }
                 error   = 一句在技术上站不住的具体陈述（quote 必须是那句原话，原样复制）
                 missing = 追问到了没答上 / 答偏 / 该讲的关键机制没出现（point 里写是哪一层追问）
                 笼统、"不够严谨"、"过于绝对"、缺细节缺数字 都不是 error（v3 起明确，之前误报成 error）
resumeChecks[≤3]: { claim≤200, resumeSays≤300, consistent }   简历核对：回答那句（逐字）、简历原文（逐字）、是否一致；与简历矛盾的同时记一条 error 短板；报告页在段下列"简历核对"
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
| 面试官 `end`（该聊的聊完），或总回合用完由代码收尾 | 关掉 active 线程并切段；`status=ready_to_evaluate`；同一处 `after()` 安排自动交卷 |
| 候选人点"结束面试"或说"结束" | 同上，不经模型；进行中的线程照样切段评分，没聊到的材料不产生题目、不计分 |

房间显示"面试已结束，正在评分并生成报告"并每 3 秒刷新；报告一出来页面切回带导航的报告视图。超过 90 秒还没出来（评分失败会把会话退回 ready_to_evaluate）才显示"重新生成报告"按钮，它调原来的 `POST /complete`。

## 4. 交卷（`completion.completeMockInterview`）

1. 已有报告直接返回；状态不是 ready_to_evaluate → 报错；没有简报（旧流程会话）→ 报错
2. 乐观锁把状态改成 evaluating；抢不到说明另一个请求在评分
3. **收集评分**：等在途（running）的评分最多 32 秒；pending / failed 的当场补跑；仍不完整 → 退回 ready_to_evaluate 并报错
4. **每个话题的结果**（`areaOutcomes`）：按线程（不再按简报领域，计划外的话题也在内）：种类、追问轮数、面试官离开时的判断、分数（跳过记 0）、weaknesses；权重按种类（`KIND_WEIGHT`：项目 3、场景 2、基础 1）
5. **总分**（`scoring.computeInterviewTotalScore`）：`round(Σ w_a · score_a / Σ w_a)`，只算问到过的题
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

## 4.5 候选人档案（`interview/dossier.ts`，dossier-v1，G4）

交卷写完报告后，档案 agent 拿上一版档案（没有就空模板）+ 这场的事实（岗位、日期、报告的总结 / 强项 / 短板 / 假设结论、每个话题问过与讲透的角度、逐段短板）整份重写一版：固定五段（已验证的说法 / 没讲清的说法 / 反复出现的短板 / 问过的项目角度 / 场次记录），每条带日期与岗位，同一件事多场出现合并标 ×N，一场的短板只进那场的记录行；`changes` 一句改动。代码 `normalizeDossier` 保证段落齐全、丢自创段、封顶 4000 字，版本 +1 存 `CandidateDossier`（评测场次带 evalTag，真实使用只读真实场次写的）。写失败只记日志、报告照出。下一场备课、面试官、评分从会话快照里读它（见 before / during 两篇）。报告页显示"候选人档案已更新到第 N 版：改动"。`npm run recall -- <resumeId>` 打印最新一版。

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
| 这场问了什么 | 按话题种类分节（项目深挖 / 基础快问 / 场景题）：每个聊过的话题一行：标签、追问了几轮、面试官离开时的判断、得分；跳过的标出。注明"总分按话题种类加权（项目 3 : 基础 1 : 场景 2）；跳过的计 0 分，没聊到的不计" |
| 简历上的说法经不经得起问 | 每条假设：状态徽章（已验证 / 没有讲清楚 / 没问到）、假设原文、一句结论 |
| 能力估计 | 岗位每项能力：估计（低 / 中 / 高）、置信、评了几段、是否核心；没问到的标出。用面试中同一个估计器，输入换成整理员的分段（能力、答到第几层）+ 双采样评分（低置信的段只算半次）；`queries.buildEstimates` 读时现算 |
| 站得住的 / 失守在哪 / 下一步练什么 | 三栏；短板标"说错了 / 没答上 / 反复出现"并挂题名 |
| 逐段反馈 | 每条线程一张卡：题目（第一问 + 追问）、作答用时、分数、可展开"查看我的回答"、可展开"这道题在考察什么"（话题、种类、来源、期望信号、面试官的判断）、feedback、维度分（证据 + 缺口）、答得好的与短板（带原话引用）、练什么、可展开"用你的项目，这段可以这样答" |
| 面试官的工作记忆 | 折叠：已确认 / 存疑 / 失守原文 |
| 决策记录入口 + 对话记录 | 会话页提供 |

## 7. 数据落点一览

| 表 | 何时写 | 关键字段 |
|---|---|---|
| MockInterviewMessage | 每回合 | turnIndex, role, kind, content, threadId, toolName, clientId, metricsJson |
| InterviewThread | 开 / 关线程 | areaId, entryQuestion, status, depth, hinted, verdict, note, questionId |
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
