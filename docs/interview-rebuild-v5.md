# 面试中一层的重建施工图（v5，2026-09-18 草案，待审）

> 为什么重建而不是修：见 [interview-design-revision-4.md](interview-design-revision-4.md) §1 的证据与本文 §1 的结构诊断。v4 的三段补丁作废。
> 范围：**面试中**这一层（`src/lib/interview/` 的回合核心）与它压着的实验层；备课只改"题的来源"（§6）；面试后（切段、评分、报告、档案）不动。

## 1. 结构诊断（六条，重建要一次解决）

| # | 现在的结构 | 必然产生的症状 | 重建后 |
|---|---|---|---|
| 1 | 代码把命令写在现场卡上 → 模型流式说话 → 代码对文字跑正则底线 → 不合格就用固定句替换已流出的话 | 撤回、固定句重复、面试官无权收尾 | 控制作用在**动作**上、在说话**之前**；文字不改写 |
| 2 | 说的话是流式 JSON 的一个字段，同一调用还带工具 | 说一半（DeepSeek 把工具调用写进 say）、五层兜底（salvage / coerce / repair / DSML / 空白判定） | 非流式循环：先查后说；话是纯文本 |
| 3 | 六套记忆（笔记、历史、事件、快照 memory、recent-feedback、档案） | 模型没有"这场聊到哪了"，笔记被写空 | 一份从事件推导的面试状态；跨场只剩档案 |
| 4 | 候选人意图靠四张正则词表 | "详细一点"这类永远补不完 | 意图归模型，代码只计数 |
| 5 | 技能包是题库，备课抄题 | 基础题不贴 JD / 简历 | 包是知识，题带依据，代码做门禁 |
| 6 | 评论员、评委、估计器、影子、灰度、先验压在核心上 | 每次改核心都要顾它们，真实使用几乎不开 | 整层删除 |

原则不变：**判断归代码、措辞归模型**——但"判断"重新定义为**校验模型的动作是否违约**，而不是替模型决定每一步。模型的每个意图仍可否决，否决的方式是让它重出，不是代码替它说。

## 2. 面试状态（`state.ts`，纯函数，从事件推导）

```ts
type InterviewState = {
  turn: number;                                  // 面试官说过几句
  materials: MaterialState[];                    // 按简报顺序
  candidate: { noInfoStreak: number; noInfoTotal: number; helpCount: number; wantsToEnd: boolean };
  phase: "opening" | "running" | "ended";
};
type MaterialState = {
  id: string; kind: "project" | "quick" | "scenario"; name: string;
  status: "untouched" | "open" | "done" | "skipped";
  asked: number; budget: number;                 // 已问几句 / 上限（budget 沿用 progress.ts 的配额）
  facets: { text: string; status: "untouched" | "asked" | "done" }[];   // 项目的追问角度
  ledger: { seq: number; note: string }[];       // 证据账：每句回答的一行摘要（模型写）+ 存疑
};
```

- 状态只由事件推导（`stateOf(brief, events)`），不单独存；重放、trace、评测都读它。
- 模型每回合看到的"记忆" = `renderState(state)`：每份材料一段（状态、余额、角度、证据账），候选人一段（连续无信息几句、求助几次）。不再有笔记；`notebook_written` 事件删除。
- 证据账由模型写：每回合输出里带 `ledger: string`（≤ 80 字，对候选人刚才那段的摘要 + 存疑），代码挂到当前材料上。这是笔记的替代，但有归属、不重写、不会被写空。

## 3. 一回合（`turn.ts`，重写）

```
候选人说话
  → 代码：用户按钮（结束 / 跳过）直接处理；否则进入模型回合
  → 模型（runAgent 循环，非流式；工具 lookup_resume / load_skill 走协议通道，先查后说）
       输入：系统提示（人设、方法、约束、材料议程，整场不变）+ 历史 + 候选人这句 + 状态卡（renderState + 可选动作与余额）
       输出：{ signal, action, why, ledger, reply }
  → 代码：校验 action（§4）；违约 → 把违约原因发回让模型重出一次；仍违约 → 代码定动作并让模型按该动作再说一次（不用固定句）
  → 代码：文字只查一条硬规则（内部词泄露 → 重出）；候选人 signal 计数
  → 落事件：candidate_said / interviewer_said（带 action）/ ledger_written / tool_called / ended
  → 响应：整句返回；前端打字机
```

输出 schema（一个对象，字段都是标量或短文本，DeepSeek 一次通过率高）：

```ts
{
  signal: "answered" | "thin" | "dont_know" | "help" | "not_mine" | "refuse" | "wants_end",   // 候选人刚才那句
  action: "probe" | "switch" | "clarify" | "end",
  target: string | null,        // switch 时材料 id；probe 时角度序号（项目）或 null
  why: string,                  // ≤ 40 字
  ledger: string,               // ≤ 80 字，进证据账
  reply: string,                // 对候选人说的话，纯文本
}
```

- 开场回合：action 固定 probe、target 开场材料（代码给），模型只写 reply。
- 一回合一次调用；工具最多 1 步（换到基础题且该包没查过时状态卡点名，沿用 G3 的做法）。
- `streamAgent` 删除，`stream.ts` 改为整句响应（仍用 `data-turn` 把回合结果交回前端）；房间组件的 `useChat` 流式渲染换成打字机（收到整句后按 30 ms/字显示，可点击跳过）。首字延迟 2–4 秒，房间显示"面试官在想"。

## 4. 动作约束表（`constraints.ts`，纯函数，替代 decide.ts 的十条规则）

| 约束 | 违约条件 | 处理 |
|---|---|---|
| 材料余额 | probe 时当前材料 asked ≥ budget | 违约：重出，提示"这份材料问够了，换材料或收尾" |
| 角度上限 | 同一角度已追 2 句还 probe 同一角度 | 重出，提示换角度 |
| 不重复 | switch 到 done / skipped 的材料 | 重出 |
| 收尾门槛 | end 时：材料没聊完且候选人 noInfoStreak < 3 且不 wantsToEnd | 重出，提示"还不能收尾，可选：…" |
| 枯竭 | noInfoStreak ≥ 3：允许 end；≥ 6：**要求** end（用户 2026-09-18 定） | 6 句时 action 强制 end |
| 候选人要结束 | wantsToEnd（按钮或模型判 signal） | 强制 end |
| 答疑不占预算 | clarify 不计 asked | — |
| 内部词 | reply 含"评分标准 / 期望信号 / 材料 / 现场卡 / 系统提示词里…" | 重出（唯一的文字规则） |

- 违约重出最多 1 次；第二次仍违约，代码选一个合法动作（顺序：当前材料没问够 → probe；有 untouched 材料 → switch；否则 end），再调一次模型只写 reply。**没有任何固定句**（开场兜底句、接话句、换题句全部删除；模型连续两次没说出话就记 model_error 并把这一回合报给用户重试，不假装说话）。
- 配额（每种材料几份、每份几句）沿用 `progress.ts` 的常量；`decide.ts`、`progress.ts` 的运行时逻辑并入 `state.ts` + `constraints.ts`。

## 5. 事件变更（`events.ts`）

- 保留：candidate_said、interviewer_said（payload 加 `action`、`target`、`signal`、`why`；去掉 `doneFacet`，角度完成由 action 推）、tool_called、fallback_used（只剩"重出"与"代码定动作"两种 reason）、model_error、ended、progress_tick（改为从状态推，可删）。
- 新增：ledger_written { materialId, text }。
- 删除：move_decided（并入 interviewer_said）、notebook_written、estimate_updated、critic_noted、segment_scored、shadow_said、clock_tick 残留。
- 旧场次：只读旧事件的 trace / 报告继续能开（投影函数对缺字段容错）；不做数据迁移。

## 6. 备课：包是方法书，题从 JD 和简历来（用户 2026-09-18 确认）

技能包回到最初的定位：告诉模型这个方向怎么面、项目 / 实习怎么深挖，**不再是代码抽题的题纲**。

- **包的结构改为四段**：① 这个方向的面试官在意什么；② 项目 / 实习怎么深挖（从简历的哪类经历切、追到哪一层算实）；③ 常见失守与危险信号；④ 常考主题清单（只列名字与阶梯，作参考不作配额）。"主题抽样"与"好题"整体删除。34 个包按此重写（方法段是新内容，主题清单从现有阶梯压缩）。
- **备课由模型定方向**：输入是 JD、简历、蓝图、包的方法段；模型自己决定聊哪几个项目、从哪切、追什么角度，基础题问什么按这份 JD 与这份简历定，每道题带 `anchor: { kind: "resume" | "jd"; quote: 逐字 }`。代码只做三件事：配额上限（几份材料、每份几句，沿用现有常量）、锚点门禁（无锚点或与包内示例相似度 ≥ 0.6 的退回重写一次，仍不合格标 `copied`）、栈包只在 JD 点名语言时才给模型读。
- **面试中**：换到某份材料时点名 load_skill 读对应的包，包是"问到哪一层算实"的参考，不是命令。
- **删除**：`topics.ts` 的主题解析与抽样、`QUICK_POOL_SIZE`、题与主题的绑定（`topic.skill` / `fromResume`）、备课载荷里的 `topics`、`recentTopics` 降权。
- **评测口径变化**：基础题不再保证覆盖"必考"主题（AI 岗可能整场不问操作系统），"面经话题覆盖率"这条思路作废；新指标是"题带锚点的比例"与"照抄率"。

## 7. 删除清单

| 删 | 原因 | 影响面 |
|---|---|---|
| `critic.ts`、`judge.ts`、`variants.ts`、`background.ts`、`memory.ts`、`memory-recall.ts`、`flags.ts` 的 lab / shadow / policy 开关、`estimator.ts` 里的先验与面试中更新 | 实验层（面试中的后台任务）整体移除。**报告页的"能力估计"栏保留**：它是面试后从评分推的产品功能（`estimator.ts` 的纯函数 + `buildEstimates`），与实验层无关，用户后续改报告时再定 | trace 页仪表的评论员 / 影子栏、模拟器 `--lab / --policy / --shadow`、指标表里在线估计与评论员 6 行、`scripts/rejudge.ts`、`scripts/recall.ts` 里先验部分 |
| `decide.ts`、`progress.ts` 运行时部分、`policy.ts` 的现场卡 / 底线 / salvage、`turn.ts` 的 speak / guards / FALLBACK_SPEECH | 被 state / constraints / 新 turn 取代 | 对应测试重写 |
| `streamAgent` 与 `stream.ts` 的流式部分、`policy.ts` 的 looseText 预处理、历史改写成 `{"say":…}` | 不再流式、不再 JSON 里带话 | 房间组件、体验版 turn 路由 |
| 正则：HELP / DONT_KNOW / NOT_MINE / NON_ANSWER / END / FAREWELL / LEAK 的一部分 | 意图归模型；只留内部词一条 | `classifyReply` 改为读事件里的 signal（复盘与切段用） |
| `recent-feedback` 在备课里的用法（recentWeaknesses / recentQuestions / recentTopics） | 跨场只剩档案 | 画像页的"近期反馈"卡保留它的查询 |
| `InterviewMemory`、快照里的 `memory` | 随估计器删 | 评分的 recall 工具已读档案，不受影响 |

预计删除约 1800 行、新增约 700 行。

## 8. 不动的

面试后整条链（切段、评分带工具、示范、汇总、档案、报告）、G1 运行时（runAgent、循环、工具门、输出契约、记账）、G6 的 trace 按步与重放（重放改调新的 turn）、评测运行器与失败清单机制、体验版同构原则。

## 9. 顺序（每步一个提交，每步单测 + 1–2 场冒烟）

1. **删实验层**（§7 第一行）：先减重，让核心可见。指标表、trace、报告页相应收缩。
2. **状态与约束**：`state.ts`、`constraints.ts` + 单测（纯函数，不调模型）。
3. **新回合**：schema、提示词、`turn.ts` 重写、`orchestrator` / 体验版路由改非流式、房间打字机；删 streamAgent 与旧 policy / decide / progress 运行时；事件变更；重放改接新 turn。冒烟 3 场（正常、`dont_know` 整场、`needy`）。
4. **意图归模型**：删正则，复盘 / 切段改读 signal。
5. **备课重做与技能包重写**：§6。冒烟 2 场看依据类型分布。
6. 文档：flow-during 重写、失败清单补"v4 补丁作废、结构性原因"一行、深度计划里 G1"流式例外"删除。

费用：全程约 8–10 场冒烟，2 美元以内。

进度（2026-09-18）：第 1–6 步已提交。第 4 步：正则分类删除，复盘 / 切段 / 指标读 signal。第 5 步：34 个包改四段方法书（转换：旧"岗位职责与考察重点 + 出题原则"→ 面试官在意什么；"项目结合钩子"→ 项目 / 实习怎么深挖；各主题的危险信号汇成一段；主题只留阶梯与答实的标志；好题全删），备课 brief-v18 由模型定方向、每道基础题带锚点并验逐字、不合格退回一次；`topics.ts`、`QUICK_POOL_SIZE`、`recentTopics`、`topic.skill / fromResume` 删除；"照抄率"门禁不再需要（包里没有可抄的题），新指标只剩"题带锚点的比例"。第 6 步：flow-during 重写、flow-before §4–5 重写、失败清单加三行、深度计划的流式例外注销。第 3 步的记录：第 3 步冒烟 3 场（solid 正常 / shaky 整场"我不会" / needy）都由面试官自己收尾，没有固定句；动作被退回 2–4 次一场，全是"项目 probe 漏填 facet"与"想提前收尾"。观察到的模型侧问题（不在代码里修）：整场"我不会"那场有一句被判成 answered 并编了理由，收尾因此晚了几回合。笔记（notebook 列、报告的"面试官的笔记"）已由证据账取代；旧场次的笔记随列一起删了（本地 dev.db 有备份 dev.db.before-v5-step3.bak）。

## 10. 风险与取舍

- 首字延迟变长：接受；打字机保留体验。
- 模型自己选动作可能"偏"：约束表兜住硬边界，指标"动作被否决的比例"看它偏多少；如果长期偏，调的是约束与状态卡，不是回退到代码命令。
- DeepSeek 一次通过率：新 schema 全是标量与短文本，比现在的评分 schema 简单得多；输出契约的收敛与修补仍在。
- 旧场次的 trace / 报告：投影函数容错，不迁移数据。

## 12. 修订：锚点 → 依据（2026-09-18，用户实测后）

第 5 步的"每道基础题必须带一句逐字锚点"有两个问题，用户看 trace 后指出第二个：

1. **判定在真实简历上几乎必然误杀**：PDF 抽出来的文本在换行处插空格，`normalizedText` 只把空白折成一个空格、不删，差一个空格就判"改写"。真实场次里模型给的 10 条引用 3-gram 覆盖率全是 1.00，却 0 条通过，基础题 2/2 判为无锚点、简历假设丢掉 2/6，还白跑一次重试（9 秒、1802 token）。冒烟看不见，因为评测用的合成简历是 markdown，没有换行空格。
2. **"必须引到一句原文"本身在筛题**：最值钱的判断往往是推出来的——岗位要质量保障而简历全是模型应用、三个项目都是一个人做的、写了多步循环没写预算与终止条件、两处数字都没交代口径。这些引不出原文，于是备课出不了这类题。同一场面试官收尾时说的"质量保障这条线你也没接过手"是全场最准的判断，而锚点机制永远生不出这道题。

改法：

- `isVerbatimEvidence` 改为去空白后比对（`denseText`）。意译与改写仍然不过（实测覆盖率 0.64 的改写句、无关句都拦住）。简报依据、简历假设、场景题 jdEvidence、蓝图能力 jdEvidence 四处共用，一起修好。
- 锚点（`QuestionAnchor`）换成依据（`QuestionBasis`）：`kind` 四类 resume / jd / gap / pattern，`quote` 可空，`note` 必填（模型自己的话，写清凭什么问他这道题）。代码只在写了 quote 时验逐字；推断类只要 note。议程把 note 给面试官看。
- 指标从"带锚点比例"换成依据类型分布（AgentRun）与"依据是推断的比例"（coverage 评测）。

验证（同一份 PDF 简历与 JD 重跑备课，brief-v19）：3 道题依据全部成立、无重试，假设 6/6 全留下；其中一道正是落差类——"你简历里没有质量保障或测试相关的经历，如果让你把做 Agent 那套能力用到测试用例自动生成上，你会先从哪里入手？"
