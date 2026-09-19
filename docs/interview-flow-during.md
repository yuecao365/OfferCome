# 面试中：一个回合是怎么跑完的（重建 v5，2026-09-18 起）

> 上一篇：[面试开始前](interview-flow-before.md) · 下一篇：[面试结束后](interview-flow-after.md)
> 设计：[interview-rebuild-v5.md](interview-rebuild-v5.md)（§1 结构性诊断、§2 状态、§3 回合、§4 约束表、§5 事件、§7 删除清单）。更早的设计（v3 覆盖配额、v2 重建）只作历史参考。
> 代码：`src/lib/interview/` —— `orchestrator.ts`（本地版装状态与落库）→ `turn.ts`（回合：调一次模型、校验动作、落事件）→ `interviewer.ts`（面试官的一次调用：系统提示、历史、状态卡、工具）→ `state.ts`（从事件推导的面试状态）→ `constraints.ts`（动作约束）→ `progress.ts`（配额表）→ `events.ts`（事件日志）→ `stream.ts`（HTTP 响应）→ `views.ts`（房间与 trace 视图）。报告用的能力估计：`estimator.ts`（纯函数）。体验版走 `src/app/api/trial/turn/route.ts`，同一个 `runTurn`。

## 0. 总览

```mermaid
flowchart TD
  M[候选人消息 / 开场] --> S[状态 = stateOf(材料, 事件)<br/>每份材料：状态 / 余额 / 角度 / 证据账；候选人：连续无信息几句、求助几次]
  S -- 结束按钮 --> F[固定告别 + ended(by candidate)]
  S -- 其余 --> A[一次非流式模型调用<br/>输出 signal · action · target · facet · why · ledger · reply]
  A --> V{checkAction<br/>预算 / 角度上限 / 不切回聊过的 / 收尾门槛}
  V -- 违约 --> R[把原因写进状态卡，模型重出一次]
  R -- 仍违约 --> C[代码定动作 fallbackAction，模型只写这句话]
  V -- 合规 --> W{checkReply：话里带内部词？}
  W -- 带 --> R
  W -- 干净 --> E[事件：candidate_said(signal) / tool_called / fallback_used / interviewer_said(action, why) / ledger_written / ended]
  C --> E
  F --> E
  E --> UI[整句 + data-turn 交给房间，打字机显示]
```

一句话：**控制作用在动作上、发生在说出口之前**。模型每回合自己判候选人那句是什么、选下一步做什么、写一行证据账、说一句话；代码只校验动作是否越界，越界退回让它重出，仍越界才由代码定动作——但话永远是模型说的，没有任何固定句（唯一的例外是候选人按"结束"按钮）。文字不流式：回合先跑完，再整句交给前端。

## 1. 状态（`state.ts`）

状态不存库，每回合从材料与事件推导（`stateOf(brief, stateEventsOf(events))`），渲染成模型看到的唯一"记忆"（`renderState`，状态卡正文）。

| 东西 | 内容 |
|---|---|
| 材料 | 备课产物（面试开始前篇），整场不变：每个项目一份、基础题几道（每道带锚点）、场景题；每条有材料 id |
| 每份材料的状态 | untouched / open / done / skipped；`asked` 已问几句、`budget` 预算（`planQuota`）；项目材料的每个角度 `probes` 追了几句、status（同一角度最多 2 句）；`ledger` 证据账（模型每回合写的一行，挂在当时的材料上） |
| 候选人 | `noInfoStreak` 连续几句没有信息（dont_know / not_mine / refuse）、`noInfoTotal`、`helpCount`、`wantsToEnd` |
| 阶段 | opening（还没人说话）/ running / ended |

材料切换由 `interviewer_said.action = switch` 记录（也兼容旧事件：`topic` 变了就算换）；`clarify` 不占预算；候选人按"跳过"当前材料变 skipped。

## 2. 配额（`progress.ts`）

没有时钟。节奏定这场聊几份材料、每份最多问几句：快速 1 项目 + 2 基础 + 1 场景，标准 2 + 3 + 1，深入 3 + 4 + 2；预算项目 4 句（项目不够配额时缺的预算分给现有项目，每个最多 6 句）、基础题 2 句、场景题 3 句。配额只是上限：模型可以在候选人没信息时提前换材料或收尾，代码不推着它把余额用完。

## 3. 一次调用（`interviewer.ts`）

非流式，跑在 `runAgent` 的循环上（工具走协议通道，最多 1 步工具再出话），结构化输出：

```
signal:  answered | thin | dont_know | help | not_mine | refuse | wants_end   候选人刚才那句是什么
action:  probe | switch | clarify | end                                       这回合做什么
target:  switch 时的材料 id
facet:   probe 项目时的角度序号
why:     一句理由（≤ 40 字，进事件与 trace）
ledger:  证据账一行（≤ 80 字，对候选人那段的摘要与存疑）
reply:   对候选人说的话
```

上下文布局为了前缀缓存：**系统提示**整场不变（人设、方法、议程含每份材料的切入问法 / 角度 / 锚点、技能包索引、JD ≤ 1500 字、简历 ≤ 6000 字、档案摘录）；**历史**只追加（面试官的话写成 `{"reply": …}`——DeepSeek 在 JSON 模式下见裸文本历史会整回合吐空白；前 20 回合不裁，之后按 4 千字一块裁）；**候选人这句**单独一条；**状态卡**是最后一条用户消息（材料状态、候选人状态、可选动作与余额、已查过的资料、退回原因）。同一场用同一个 `promptCacheKey`。

工具：`load_skill`（备课选的包，索引在系统提示里；换到一道基础题前状态卡点名"先查它标的包"）、`lookup_resume`（只在简历超长时给）。

## 4. 动作约束（`constraints.ts`）

| 提议 | 合规条件 |
|---|---|
| probe | 已在某份材料上；这份还有余额；项目材料要带角度序号，且该角度没追满 2 句 |
| switch | target 是没聊过的材料 id（聊过或跳过的不能切回） |
| clarify | 已在某份材料上（不占预算） |
| end | 候选人连续 ≥ 3 句没信息，或候选人要结束，或材料都聊完且当前这份问满 |
| 任何非 end | 候选人连续 ≥ 6 句没信息或按了"结束"时不允许（必须 end） |

违约把原因原话发回状态卡让模型重出一次；仍违约由 `fallbackAction` 定：当前材料没问够 → probe（项目取第一个没追满的角度），有没聊的 → switch 第一份，否则 end。两次都记 `fallback_used("重出：原因")`。话只有一条硬规则：不带内部词（评分标准 / 期望信号 / 材料 / 状态卡这类），带了同样重出一次。模型两次都没产出（服务不可用、JSON 坏）：这回合失败报给用户"重试"，不编一句。

## 5. 事件与投影（`events.ts`、`orchestrator.ts`）

每回合按序写：`candidate_said`（含按钮 `control` 与模型判的 `signal`）→ `tool_called` → `fallback_used`（有重出时）→ `interviewer_said`（`kind`：say / aside / closing；`topic`、`facet`、`action`、`signal`、`why`）→ `ledger_written`（材料 id + 一行）→ `ended`（结束时，by interviewer / candidate）。同一事务里写消息投影（`MockInterviewMessage`）与 `startedAt`；结束时会话进入 `ready_to_evaluate` 并安排交卷。v5 之前的事件（move_decided、notebook_written、progress_tick、doneFacet）读时忽略，旧场次的状态按 kind 与 topic 推。

幂等：候选人消息带 `clientId`，重复提交回放当时的面试官消息；开场回合已有消息时同样回放。重放某一步（trace 页"重放这一步"）：事件回到那回合之前，用现在的代码与提示词再跑一次，不落库，结果（动作、理由、证据账、重出原因）摆在原话旁边对照。

## 6. 接口与房间

`POST /api/interviews/mock/[id]/turn`：`{ kind: "start" }` 或 `{ clientId, content, intent, composeMs, voiceMetricsJson }`；`intent` 是房间按钮（hint / skip / repeat / end）。响应仍是 AI SDK 的 UI 消息流（前端 `useChat` 不变），但只在回合跑完后写一个 text 块（整句）和 `data-turn`（新消息、阶段、进度、结束方、这回合的证据账）；模型没产出写 error 块，房间给"重试"。

房间：等待时转圈，话到了打字机逐字显示（≤ 4 秒）；顶栏进度"材料 n / N"；按钮：要个提示 / 再说一遍 / 跳过这题 / 结束面试；语音模式多一块录音控件。候选人看不到材料与证据账。trace 页：每回合候选人的话（带模型判的信号）、面试官的话（动作、角度、理由）、证据账、重出原因与次数、模型开销；顶部复盘。

## 7. 体验版

状态（材料、消息含材料 id / 角度 / 动作 / 信号）随请求带上，从消息合成事件后跑同一个 `runTurn`；`data-turn` 回来后写进浏览器的会话文档，证据账逐回合累计（交卷时渲染给报告汇总）。没有事件日志，trace 从消息拼；工具账每回合为空。

## 8. 评测

`npm run simulate`：合成候选人（五种画像 × 能力真值）走同一接口；指标从事件日志算（`src/lib/interview/eval/`）。复盘（`npm run postmortem -- <sessionId>`，trace 页顶部同一份）读模型判的 signal：回答按信号计数（答实 / 答空 / 求助 / 答不上 / 不是我做的 / 不作答 / 跳过 / 超长）、面试官违反准则的回合（同一题重复问、一句多问、预算用完还在问、两次答不上还没换题）、重出次数、一句归因。没有正则分类。

扰动：`--perturb long_answers,dont_know,dont_know_all,hollow_resume,manipulate,not_mine,help_loop,inflate`（`dont_know_all` 是 v5 加的：自我介绍后整场"我不会"，看面试官会不会在连续 3–6 句后收尾）。改动先跑对应扰动 1–2 场；失败先进 `docs/interview-failures.md` 再修。
