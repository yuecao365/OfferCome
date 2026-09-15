# 面试流程重构实施计划（按 interview-system-design.md v2，2026-09-14，待放行）

> 设计定了（[interview-system-design.md](interview-system-design.md)），这份是施工图：分几步、每步做什么、删什么、怎么验。每一步单独放行、单独提交。
>
> **写法（用户 2026-09-14 定）**：大幅重构，不在旧代码上改。面试中这一段整体新写在 `src/lib/interview/`（events / clock / policy / orchestrator / aftermath / cognition / eval 各一个模块），旧的 `mock-interviews/interviewer/` 在阶段 B 整目录删除；结构与细节不参考旧实现。§0 里"留"的只是独立的产品件（备课材料、逐段评分、画像、技能包、语音输入），通过新接口调用，不合适的在后续阶段重写。

## 0. 现有资产盘点（能复用的）

| 资产 | 位置 | 处置 |
|---|---|---|
| 备课流水线（蓝图 → 题池抽样 → 简报 v8） | `mock-interviews/generation.ts`、`job-analysis-agent.ts`、`interviewer/brief*.ts`、`skills/*` | **留**；给材料补"能力 id 与难度层"字段（阶段 D 用） |
| 逐段评分 v2（引用原话、短板、示范） | `question-evaluation*.ts`、`InterviewQuestionEvaluation` | **留**；输入从"线程切段"改为"整理员切段"，加引用逐字校验 |
| 汇总报告、画像（AbilityObservation、CandidateProfile*） | `completion.ts`、`summary-agent.ts`、`candidate-profile/*` | **留**，不动 |
| 模型调用基座（防注入、AgentRun 记录、缓存计数） | `ai/run-agent.ts`、`agent-run-store.ts` | **留**；AgentRun 已记输入 / 输出，重放直接用 |
| 评测素材（人设、评分器蜕变用例、JD 夹具、指标） | `lib/evals/*`、`scripts/eval.ts` | **改造**：人设升级为"能力已知"的合成候选人，指标改从事件日志算 |
| 语音输入（录音 → 转写） | `mock-interview-voice-controls.tsx`、`transcribe/route.ts` | **留**，不动 |
| 体验版同构（会话文档 v7、纯函数复用） | `lib/trial/*` | **跟着改**：文档 v8，形状与事件日志对齐 |

## 1. 要删的（不留平行实现）

- 面试中的记账结构：`interviewer/actions.ts`（turn 工具、plan / enter / leave / aside / end schema）、`interviewer/reducer.ts`（六条矛盾守卫）、`interviewer/memory.ts`（三列表与相似度合并）、`interviewer/progress.ts`、`state.ts` 里的 plan / threads / turnsUsed / aside 逻辑、`prompt.ts` 里的记账说明、计划算术、尾段提醒。
- 数据：`InterviewTurnDecision` 表、`MockInterviewSession.planJson / memoryJson`；`InterviewThread` 不再由面试中写入（改为整理员的投影，见 §2）。
- 前端：房间顶栏的计划条、trace 页的"进入 / 离开 / 改了计划"标记。
- 评测：`interviewer-metrics.ts` 里按记账数的指标（没交代就换题、代码接话次数）。
- 文档：`interviewer-agency-plan.md`、`interview-flow-during.md` 等 v8–v13 的流程文档标为历史；`interview-rebuild-plan.md` 删除（已并入设计文档）。

## 2. 数据模型（事件日志 + 投影）

新表 `InterviewEvent { id, sessionId, seq, type, payloadJson, runId?, createdAt }`，`@@unique([sessionId, seq])`。事件类型：`candidate_said / interviewer_said / notebook_written / tool_called / clock_tick / control / label_added / estimate_updated / critic_noted / segment_scored / fallback_used / model_error / ended`。

投影（为了不重写全部读路径，保留现有表作为物化视图，与事件在同一事务写）：
- `MockInterviewMessage`：由 `candidate_said / interviewer_said` 投影；房间与逐字稿照旧读它。
- `InterviewThread`：改由**整理员**产出（阶段 C），面试中不写；`planItemId / depth / verdict` 列删除，加 `startSeq / endSeq / competencyId / difficulty`。
- `MockInterviewSession`：删 `planJson / memoryJson`，加 `notebook`（最新一份）、`durationMinutes`、`clockJson`（最近一次时钟估计，纯展示）。
- `AgentRun` 已有输入 / 输出；事件带 `runId` 指向它，重放用。

重放：`replay(sessionId)` 读事件，用"录制模型"（从 AgentRun 取当时的输出）重跑编排器与后续流水线，不调模型。用于回归与调试。

## 3. 施工步骤

### 阶段 A：地基与基线（不改面试逻辑）

1. `InterviewEvent` 表 + 写入器；现有回合在落库时**同时**写事件（双写，一次迁移期）。
2. 重放器：`scripts/replay.ts <sessionId>`，读事件 + AgentRun 重跑切段与评分，不调模型。
3. 候选人模拟器 `scripts/simulate.ts`：
   - 合成候选人 = 简历 + 画像（扎实 / 一知半解 / 爱跑题 / 爱求助 / 对抗）+ **每项能力的真实水平**（从岗位能力模型采样，写进画像提示词："对 X 只懂术语不懂机制"）。
   - 用小模型按"只回答面试官刚才的问题"作答；走真实 HTTP 接口，是另一个客户端。
   - 复用 `lib/evals/fixtures.ts` 的 JD 夹具与简历。
4. 指标脚本：从事件日志算——聊了几个项目、每项目几面、基础题几道、场景题问没问、时长盒是否守住、重复提问（相似度）、求助后是否给方向而不是换题、每场 token / 缓存率 / p95；结果写 `evals/out/<run>.json` 与一张表。
5. **基线**：用现在的 v13 跑 5 画像 × 1 岗位 × 3 种子 = 15 场，留数字。这是简历上"改造前"的数。

验证：单测（事件写入、重放幂等）；15 场基线跑通。

### 阶段 B：面试官重建

1. 新 `interviewer/policy.ts`：一次调用，结构化输出 `{ say, notebook }`；工具只有 `lookup_skill`、`lookup_resume`。系统提示词 = 人设与方法（≤ 400 token）+ 材料 + 技能索引 + JD + 简历；历史只追加；现场卡 = 已用 / 总时长 + 上一回合笔记 +（阶段 C 起）聊过什么。
2. 时钟 `interviewer/clock.ts`：按双方字数与固定交换开销折算分钟，参数集中；90% 提醒、100% 收尾、交换次数 1.5 倍兜底。
3. 编排器 `interviewer/orchestrator.ts`：幂等、同一时刻一个回合、组装现场卡、调用、校验 `say`（长度、不泄露内部词）、写事件与投影（一个事务）、流式返回、降级（超时 → 固定话 + `fallback_used`）。
4. 删 §1 列的记账代码与表；`turn.ts / turn-agent.ts / session.ts` 按新形状收缩。
5. 房间：顶栏改为时钟（已用 / 总时长），去掉计划条；按钮照旧发候选人的话。trace 页：每回合显示笔记全文、开销、是否降级。
6. 体验版：会话文档 v8（events + notebook），`applyTurnPayload` 对齐。

验证：单测（时钟、编排器降级、输出校验）；模拟器 15 场对比基线（覆盖、重复、求助处理、成本）。

### 阶段 C：整理员与事后流水线接上

1. `aftermath/segmenter.ts`：面试结束后一次调用，从逐字稿切段（起止 seq、材料 id 或临场、种类、能力 id、难度层、一句判断），写 `InterviewThread` 投影与兼容的 `InterviewQuestion` 行 → 现有评分与报告照跑。幂等、可重跑。
2. 评分加引用逐字校验（引用不存在的结论丢弃并降置信）；同段双采样分歧大标低置信（先只记录，不改分）。
3. 面试中异步标注器（每 4 条消息一次，小模型）：产出 `label_added`，汇总成"聊过什么"回填现场卡；房间顶栏显示覆盖了哪些能力。
4. 指标脚本改用整理员的分段算追问深度与换题是否交代。

验证：重放旧会话得到同样的分段；模拟器 15 场看重复率下降与报告完整。

### 阶段 D：能力估计器

1. 材料补能力 id 与难度层（备课 schema 加字段，兜底按阶梯位置）。
2. 在线评委：小模型在每段结束（标注器判断话题切换）时打分与置信。
3. 估计器 `cognition/estimator.ts`：每项能力按难度分桶的 Beta 后验；输出"最值得追 / 已足够确定"一行进现场卡；停止规则进时钟提醒。
4. 模拟器的能力真值 ↔ 估计值：相关系数、达到置信的问答数。

### 阶段 E 及以后（各自独立放行）

评论员（开 / 关对比）→ 影子运行与灰度、仪表 → 语义记忆模块与检索 → 语音。

## 4. 每步的产出与提交

每阶段：计划已在此文档，放行后实施 → 单测 + 模拟器跑数 → 更新 `interview-flow-*.md`（重写为新流程）与本文档的执行记录 → 本地提交一次。

## 5. 要定的

1. **评测侧语言**：建议 TypeScript（复用现有 `lib/evals` 与夹具，一套工具链；训练侧在另一个项目里用 Python）。
2. **投影表保留**：`MockInterviewMessage / InterviewThread / InterviewQuestion` 作为事件的物化视图保留，避免重写全部读路径；接受吗。
3. **先跑基线**：阶段 A 用 v13 跑 15 场留数字，再进阶段 B。
4. **阶段 A 的模拟器模型**：候选人用 gpt-5.4-mini（与面试官同档，答得像人）；成本按 15 场 × 20 回合估。

## 6. 模拟器跑一轮的成本估算

按 2026-09-14 当天 6 场真实会话的 AgentRun 用量折算每场（gpt-5.4-mini）：

| 环节 | 未命中输入 | 命中缓存 | 输出 |
|---|---|---|---|
| 面试官（约 16 回合） | 41k | 255k | 9k |
| 备课（蓝图 + 简报） | 9k | 3k | 5k |
| 逐段评分 + 示范答案 | 41k | 10k | 7k |
| 汇总 | 3k | 0 | 1k |
| 画像合成 | 67k | 0 | 11k |
| 模拟候选人（估） | 30k | 120k | 5k |

单价按 gpt-5-mini 公开价假设（输入 0.25 / 缓存 0.025 / 输出 2.0 美元每百万 token；gpt-5.4-mini 若不同按比例换）：

- 一场全流程 ≈ 0.13 美元；评测时跳过画像合成（打 evalTag 不进画像）≈ 0.08 美元。
- 阶段 A 基线 15 场 ≈ 2 美元；100 场扫一遍 ≈ 8–13 美元；1000 场 ≈ 80–130 美元。
- 输出 token 占六成，面试官每回合 550 输出里一半是工具入参 JSON——阶段 B 只输出 `{ say, notebook }` 后会再降。

## 7. 执行记录

### 阶段 A（2026-09-14）

代码（本地提交）：
- `InterviewEvent` 表；`src/lib/interview/events.ts`：事件类型与 payload schema（含后续阶段预留的类型）、`appendEvents`（seq 连续分配）、`parseEventRow`（坏数据丢弃）、逐字稿投影。旧回合在 `persistTurn` 里双写候选人 / 面试官说话、房间按钮（`control`）、降级、结束。
- `src/lib/interview/eval/simulator.ts`：五种画像（扎实 / 一知半解 / 爱跑题 / 爱求助 / 对抗）× 每项岗位能力的真实水平（按种子采样，写进作答规则）；爱求助的按节奏澄清与要提示，对抗的按节奏夹注入句。走真实 HTTP 接口。
- `src/lib/interview/eval/metrics.ts`：覆盖（项目数、每项目面数、基础题数、场景题问没问 / 答没答）、预算、重复提问（3 元字符组相似度 ≥ 0.6）、求助识别与"求助后没换题"比例、代码接话、token / 缓存率 / p95。`facts.ts` 装事实（阶段 A 的分段来自线程表）并做逐字稿对账。
- `scripts/simulate.ts`（`npm run simulate`）：用例 = 画像 × 种子，并发跑，产物 `eval/runs/sim-<tag>.json`，会话打 `evalTag = sim:<tag>`；`--recompute` 只重算指标。`scripts/replay.ts`（`npm run replay`）：事件重建逐字稿、与消息表对账、算指标，不调模型。
- 合成简历建 Resume 行的逻辑抽到 `lib/evals/resume-row.ts`，评测与模拟器共用。

冒烟（快速节奏，爱求助画像）：跑通；事件 30 条、逐字稿 29 句与消息表 29 行对账一致；6 次求助里 5 次没被换题；输入 281k、缓存 86%、p95 6.9 秒。

基线（v13，标准节奏，JD tencent-hunyuan-agent-harness-engineer，简历 synthetic-ai-llm）：计划 5 画像 × 3 种子，跑到第 8 场时 OpenAI 额度用完，中断；两场另因本地 /turn 的瞬时断连失败（脚本已加一次重试，接口按 clientId 幂等）。完成 7 场（扎实 3、一知半解 3、爱跑题 1），残缺会话已删；产物 `eval/runs/sim-baseline-v13.json`，充值后补跑其余 8 场再用 `--recompute` 汇总。

| 指标（7 场均值） | 值 |
|---|---|
| 面试官回合 | 19（预算 20，全部守住） |
| 聊到的项目数 / 每项目面数 | 2.29 / 1（v13 线程只记进入时的材料，面数恒为 1，指标要到阶段 C 才有意义） |
| 基础题数 | 1.57 |
| 场景题问了 / 答上 | 100% / 100% |
| 项目段平均追问轮数 | 3.95（扎实 4.78、一知半解 3.78、爱跑题 2） |
| 重复提问 / 代码接话 | 0 / 0 |
| 每场输入 / 输出 token（面试官） | 378k / 10k，缓存 87% |
| 每场模拟候选人 | 18 次调用，52k 输入、2.8k 输出 |
| 回合 p95 延迟 | 9.9 秒 |
| 成本（gpt-5-mini 价折算，不含评分与画像） | 面试官 0.041 + 候选人 0.015 ≈ 0.06 美元 / 场 |

三个画像里求助与对抗还没跑到，"求助后不换题"与注入指标暂无数。
