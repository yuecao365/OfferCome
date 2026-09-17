# 面向大厂 Agent 开发岗的技术深度扩展计划（2026-09-16 放行；G1 已做，G5 抛弃）

> 目的：这个项目要帮用户拿大厂 Agent 开发 / Agent harness 岗位的 offer。前提是 AI 模拟面试本身的质量不降（每一步都过失败清单与冒烟），扩展的每一项都要在面试里有真实用途，不为架构而架构。
> 上一篇：[interview-design-revision-3.md](interview-design-revision-3.md)（核心层已收敛到 §11）。

## 1. 调研：2026 年公认的 harness 设计有什么共识

看了 Claude Code、Codex（codex-rs / App Server）、pi（pi.dev）、Manus 的上下文工程、LangGraph / OpenAI Agents SDK / Claude Agent SDK 三家 SDK 的收敛方向，以及 awesome-harness-engineering 与 arXiv 上的 harness 综述。共识可以压成一张表：

| 要素 | 各家怎么做 | 一句话 |
|---|---|---|
| 事件优先的循环 | pi：一切都是事件不是返回值；Codex：循环 = 收上下文 → 调工具 → 观察 → 流式进度；Claude Code：单线程循环，plan / act / observe | 循环里发生的一切先落事件，UI、重放、评测都从事件推 |
| 工具与权限 | Claude Code：约 19 个受权限门控的工具、12 个生命周期 hook（PreToolUse / PostToolUse / Stop……）；Codex：沙箱三档（只读 / 写工作区 / 全权）+ 审批边界；AWS：四种人机确认模式 | 工具按读 / 写 / 需确认分级，敏感调用走审批，hook 是扩展点 |
| 沙箱 | Codex：隔离子进程、默认禁网禁写；OpenAI Agents SDK 2026-04：原生沙箱（Modal / Daytona / Docker / E2B） | 执行类工具必须隔离，"能跑代码"是 2026 年的桌面筹码 |
| 子 agent | Claude Code：子 agent 有独立上下文、提示词与工具权限，子轨迹回传根会话；OpenAI：handoff 显式交接 | 拆 agent 是为了独立上下文与独立预算，不是为了"多" |
| 上下文工程 | Manus：KV 缓存命中率是一等指标（10 倍价差）、前缀稳定、只追加、文件系统当终极上下文、用 logit 掩码而不是增删工具；pi：系统提示 < 1 千 token | 上下文是被"工程"出来的，不是塞出来的 |
| 记忆与技能外化 | Claude Code：项目记忆、skills 文件、MCP；综述把 memory / skills / protocols 统称"外化" | 模型之外的东西（记忆、技能、协议）决定上限 |
| 持久化与中断恢复 | LangGraph：checkpoint、time travel、durable execution；OpenAI：快照外置 + 重水合 | 长任务要能停、能续、能回到某一步 |
| 评测与轨迹调试 | AgentStepper（2026-02）：轨迹步进调试、断点；综述：结构化执行轨迹、失败模式回灌技能 | 评测看轨迹不只看结果，失败要能回到那一步 |
| 三家 SDK 的收敛 | 到 2026 年 durable execution 与沙箱都成了标配，区别只剩"谁掌握循环"：Claude SDK 模型驱动、LangGraph 你驱动、OpenAI handoff | 选型问题变成控制哲学问题 |

大厂 harness 岗的面试会围绕这张表问：什么归代码、什么归模型；工具怎么分级、怎么审批；上下文怎么控成本；轨迹怎么评、失败怎么回灌；停了怎么续。

## 2. 现状对照

| 要素 | 本项目现状 | 判断 |
|---|---|---|
| 事件优先循环 | 有：`InterviewEvent` 是唯一事实源，逐字稿 / 进度 / 复盘 / 指标全从事件推，重放不调模型 | 已达标，可讲 |
| 什么归代码什么归模型 | 有：`decideMove` 代码决策、模型只报"讲透了"、三条底线 | 已达标，是最有辨识度的设计 |
| 上下文工程 | 有：系统提示 3.5 千字整场不变、历史按块裁、现场卡单独一条、promptCacheKey、命中率 80% 并作为指标 | 已达标，与 Manus 的做法同源 |
| 评测 | 有：模拟器 × 扰动、指标、每场复盘、失败清单驱动 | 已达标，缺轨迹级 |
| 工具与权限 | 无：面试官没有工具（简历超长才有一个只读查询）；没有权限分级、审批、hook | 缺 |
| 沙箱 | 无 | 缺（用户此前决定搁置代码题沙箱） |
| 子 agent | 有影子与评论员，但都是离线 workflow，没有独立预算与权限的子 agent 概念 | 半缺 |
| 持久化与中断恢复 | 有一半：事件日志天然可续（关掉房间再开继续）；但没有"一次多步任务中途停、从某一步续" | 半缺 |
| 记忆与技能外化 | 有：跨场记忆（上几场的说法、短板）、技能包目录、`load_skill` 工具（只有示范 agent 在用） | 半缺：技能包没有渐进式披露地用起来 |
| 轨迹调试 | 有 trace 页按回合展示，不能按步、不能断点 | 半缺 |

结论：**"判断力"这一层（代码 vs 模型、上下文、评测）已经够讲；"运行时"这一层（工具循环、权限、沙箱、子 agent、中断恢复）是空的。** 扩展就补后者，且每一项都要接到面试的真实用途上。

## 3. 扩展计划：六个阶段，每个都有面试里的用处

顺序按"有用 → 有深度"排，前面的是后面的地基。每阶段照旧：先写设计、用户放行、单测 + 1–2 场冒烟、失败清单不新增、复盘指标不退，然后一个提交。

### G1 通用 agent 运行时（`src/lib/ai/agent-loop.ts`）
把现在的 `runAgent / streamAgent`（一次调用 + 抢救 + 记账）抽成一个真正的循环：
- **步事件**：`step_started / tool_called / tool_result / step_finished / budget_exceeded / interrupted`，写进同一套事件日志（面试的事件表加 `runId` 维度），trace 页按步展示。
- **预算**：步数、token、时长三种上限，超了写事件并按策略收尾（不是抛异常）。
- **工具权限三档**：`read`（自动放行）、`write`（记审计）、`confirm`（挂起等确认）；每个工具声明档位，循环按档位执行。
- **hook**：`beforeTool / afterTool / onStep`，纯函数注册，先用于审计与评测，不做插件系统。
- **中断与续跑**：循环状态 = 事件的投影；从事件重放即可从任一步继续。
用途：G2 起所有 agent 都跑在它上面。可讲的点：为什么循环状态不单独存、为什么预算超了不抛错。

**施工记录（2026-09-16，已做）**

- `src/lib/ai/agent-loop.ts`：纯函数循环 `runLoop({ prompt, tools, budget, hooks, callStep, resume })`，不依赖 AI SDK 的调用细节——模型怎么调由调用方的 `callStep(messages, toolChoice)` 决定。**状态是事件的投影**：循环不存消息列表，每一步用 `messagesOf(prompt, events)` 从事件重放出消息（用户输入 → 每步"助手正文 + 工具调用" → 工具结果），所以续跑就是把事件喂回来；上一步没跑完的调用先补跑（只补没有 `tool_result` 的那几个）。
- 事件：`step_started / step_finished / tool_called / tool_result / budget_exceeded / interrupted / resumed`。预算三种（调工具的步数、token、时长）任一超了写 `budget_exceeded`，再给模型一步 `toolChoice: none` 直接结论（这步即使又想调工具也不执行）；没有工具的 agent 只有一步。
- 工具三档：`LoopTool = SDK tool + access`。read 自动放行；write 照跑、事件里带档位（审计按它查）；confirm 没批准就写 `interrupted` 并返回 `{ status: "interrupted", pending }`，续跑时 `resume.decision` 批准就执行、拒绝就把"用户拒绝了这次调用"作为工具结果回给模型。工具交给模型的只有描述与入参 schema，执行归循环（SDK 的 execute 由循环调）；未知工具、执行抛错都变成失败的工具结果，循环不断。
- hook：`beforeTool`（可拒绝，原因作为工具结果回给模型）、`afterTool`、`onEvent`，纯函数。
- `runAgent` 跑在循环上：`tools` 改为带档位的 `LoopToolSet`，`stopWhen` 删除，改 `budget`（有工具缺省 3 步工具 + 1 步结论）、`hooks`、`resume`；结果多了 `steps / toolCalls / events`，usage 是各步之和；挂起抛 `AgentRunError(kind: "interrupted", events, pending)`，喂回 `resume` 续跑。结构化输出契约（§12.3 的收敛 → 修补 → rescue）不变，作用在最后一步。示范回答 agent 的 `load_skill` 带 `access: "read"`，最多查 2 次。
- 记账：同一张 AgentRun 表。有工具的 agent 逐步记 `step`（每步 usage、finishReason、正文）与 `tool_result`（档位、入参、结果、成败）行，`budget_exceeded / interrupted / resumed` 各一行；`model_call` 汇总行的 metrics 有 `steps / toolCalls`。没有工具的 agent 只有一步，只记汇总（表不翻倍）。`step_started / tool_called` 只在内存事件里。
- 单测：`agent-loop.test.ts`（投影、预算三种、hook 拒绝 / 未知工具 / 抛错、confirm 挂起与批准 / 拒绝续跑、只喂事件从中断处续跑）、`run-agent.test.ts`（真 SDK mock：工具由循环执行、记账行、预算结论步、interrupted → resume）。
- 不在 G1 做的：trace 页按步展示（G6）；面试官的流式回合 `streamAgent` 仍是 SDK 的 stopWhen 循环，G3 给面试官工具时并进 `runLoop`；confirm 档目前没有产品用途（G5 已抛弃），只有测试——留着是因为循环的挂起 / 续跑机制本身就是它。
- 冒烟（DeepSeek，摇摆画像 1 场，约 0.15 美元）：整条链路在循环上跑通——备课、18 回合面试官、6 段评分（其中 3 次采样坏、6 次靠修补）、6 份示范、汇总、报告总分 50，失败清单无新增。示范 agent 这场没有主动查技能包（steps 1 / toolCalls 0），工具执行路径由 run-agent 单测用真 SDK mock 覆盖；线上首次真调工具在 G2。顺手修一处：模型调用在某一步抛错时循环没有返回值，失败记录会丢事件——事件改在 onEvent 里收，失败与修补路径也带 steps / toolCalls。
- 另一条路评估过：AI SDK v7 已内置 `needsApproval` / `ToolApprovalRequest` 与 `stopWhen`。没用它，因为预算超了要"给一步结论"而不是停、要按档位记审计、要从事件续跑——这些都要循环在自己手里；SDK 只负责一次调用。

### G2 面试后评分改成带工具的 agent
现在评分是"一段原文 + 评分表"一次调用两次采样。改成跑在 G1 上、有三个只读工具的 agent：`lookup_resume`（查简历原句核对候选人说的数字）、`load_skill`（查技能包的期望信号与危险信号）、`recall_sessions`（查这个候选人上几场同一材料的表现）。
- 评分引用硬门不变；多一层"引用简历原文核对"的证据。
- 评测：轨迹级——评分 agent 每一步调了什么、有没有乱调、平均步数与 token；用现有 40 道 scorer 用例对照"有工具 vs 无工具"的分数分歧与低置信率。
用途：评分更有依据；轨迹评测第一次落地。可讲的点：什么时候给模型工具是划算的（有可核对的外部事实时）。

### G3 面试官只读工具 + 技能包渐进式披露 + 评论员子 agent
- 面试官拿到 `lookup_resume` 与 `load_skill`（只读档），系统提示里只留技能包索引，全文按需加载——把已有的 `load_skill` 真正用起来。上下文工程要求：工具结果只追加、不改前缀，缓存命中率不退。
- 评论员改成 G1 上的子 agent：独立上下文、独立预算（每场 ≤ N 步）、只有只读工具，产出仍只写事件；这是"子 agent 有独立权限与预算"的最小实例。
- 现场卡加一行"工具账"（这回合查了什么），决策规则不变。
用途：面试官问得更贴简历；技能包用法回到 Agent Skills 规范。可讲的点：只读工具为什么不影响代码决策；子 agent 的边界怎么定。

### G4 记忆与技能外化
- 跨场记忆从快照 JSON 升级成 agent 可读写的**候选人档案**（文件式上下文的思路）：每场结束由汇总 agent 写档案（说法验证、短板、问过的角度），下一场备课与面试官只读它，档案有版本与差异。
- 新增 `agent-harness` 领域包（运行时设计、工具权限与沙箱、子 agent 编排、轨迹评测、记忆与技能外化、中断恢复、人机协作），题池抽样规则不变。
用途：面试更"记得"这个人；题池覆盖 2026 年岗位。可讲的点：记忆放哪一层、什么进提示词什么进工具。

### G5 代码题沙箱（用户此前搁置，放最后）
面试里加一类"写代码"材料：候选人在房间里写代码，沙箱（子进程隔离、禁网、只写临时目录、超时）跑测试用例，结果作为一段的证据进评分。G1 的 `confirm` 档在这里第一次真正被用到（执行类工具需确认或 dry-run）。
用途：技术面的真实环节；沙箱与权限模型有了真用例。可讲的点：沙箱边界、失败降级。

### G6 轨迹评测与步调试
- trace 页升级成按步查看：每步的输入片段、工具调用、输出、耗时、缓存；能从某一步"重放到这里"。
- 评测加轨迹指标：平均步数、无效工具调用率、预算触顶率、每步缓存命中；失败清单加"轨迹级失败"一栏。
- 一次 15 场对照（用户放行、报费用）：改造前后的数字进简历。
用途：调试与面试叙事。可讲的点：为什么看轨迹不只看分数。

## 4. 不做的

- 不迁移到 LangGraph / OpenAI Agents SDK：循环由自己掌握，事件日志已经是 checkpoint；面试时"评估过、说得清为什么不用"比"用过"更有价值。评估结论已记在设计修订 v3 的讨论里。
- 不做为了多而多的多 agent；子 agent 只在需要独立上下文与预算时拆（G3 的评论员）。
- 不把面试中的决策交回模型；工具只给只读档，决策规则不变。

## 5. 面试叙事（做完每阶段都能说出的一句）

- G1：我把一次调用抽成了带预算、权限、hook、可续跑的循环，状态是事件的投影，所以重放就是恢复。
- G2：给评分 agent 三个只读工具后，引用核对率上升 / 低置信率下降（数字待跑）。
- G3：面试官上下文从"塞全文"改成"索引 + 按需加载"，缓存命中率不退。
- G4：候选人档案是文件式上下文，跨场记忆有版本。
- G5：沙箱三条边界与确认档。
- G6：轨迹级评测与步调试；改造前后 15 场对照数字。

## 6. 费用与节奏

每阶段 1–2 场冒烟（约 0.3 美元）；G2 的 40 道 scorer 对照约 2 美元；G6 的 15 场对照约 5 美元，跑前报。每阶段一个提交。

## 来源

- Codex as a platform / Unlocking the Codex harness / Unrolling the Codex agent loop（OpenAI，2026）
- pi.dev、earendil-works/pi、Pi harness comparison 2026
- Claude Code 架构分析（Dive-into-Claude-Code、Anatomy of Claude Code）、Claude Code Agent Teams / Subagents 2026
- Context Engineering for AI Agents: Lessons from Building Manus
- LangGraph vs OpenAI Agents SDK vs Claude Agent SDK（2026 年多篇对比）
- awesome-harness-engineering；Externalization in LLM Agents: A Unified Review（arXiv 2604.08224）；AgentStepper（2026-02）
