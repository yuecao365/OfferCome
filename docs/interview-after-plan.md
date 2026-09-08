# 面试后：改进计划（报告 v2）

> 基于 [interview-flow-after.md](interview-flow-after.md) 描述的现状。面试中已按 [interview-during-plan.md](interview-during-plan.md) 完成。
> 2026-09-08 第一稿。评测框架不在本计划内，另议。

## 0. 三条原则

1. **报告的骨架是面试官的现场判断。** 面试中已经落库的线程判断（note）、工作记忆（已确认 / 存疑 / 失守）、简历假设验证结果，是最贴近真实面试评价表的材料；事后评分 agent 负责校准分数与补证据，不能反过来把现场判断丢掉。
2. **负面反馈必须落到候选人的原话上。** "说错了什么""追问到哪一层没答上"是技术面试最有价值的反馈；它与"下一步练什么"是两件事，输出里分开放。
3. **少操作。** 面试一结束报告自动生成；报告页把已有数据全部展示出来，不再让用户点按钮或翻 trace。

## 1. 逐题评分的输出形状

### 现状
`{ dimensions[{name, score, evidence}], strengths[≤5], improvements[≤5], feedback }`。improvements 把"答错 / 没答上"和"建议"混在一起，模型退化成通用补充清单；维度证据只引好的原话，扣分没有解释；评分 agent 看不到线程深度与面试官的判断。

### 改动
输出改为：

```
dimensions[]: { name（逐字等于 rubric）, score 0–100, evidence≤500（支持这个分数的原话）, gap≤300 | null（这个维度缺了什么、错在哪） }
strengths[≤4]:  { point≤200, quote≤200 }          答得好的地方，quote 逐字摘自回答
weaknesses[≤4]: { point≤200, quote≤200 | null, kind: error | missing }
                 error   = 说错的（quote 必填，指出错在哪）
                 missing = 追问到了但没答上或答偏（quote 可空，写清是哪一层追问）
advice[≤3]:      下一步练什么，每条对应至少一条 weakness
feedback≤800:    给候选人看的一段话
```

代码校验：strengths / weaknesses 的 quote 归一化后必须是回答的子串，不是就把该条 quote 置空并记一次 `quote_missing`（与 probe anchor 同一套校验函数，复用 `normalizedText`）；weaknesses 为空且总分 < 70 记一次 `unexplained_low_score`。这两个计数进 AgentRun 的 metricsJson，之后评测直接读。

### 输入增加
```
thread: { depth（追问层数）, targetDepth, probeCount, rescues, note（面试官关线程时的判断）, skipped }
round:  first_interview | second_interview | hr_interview
```
提示词加一段：追问按深度递进，越深越往失守点问；到第 n 层答不上属正常，按达到的深度给分，不按"完美答案"扣分。面试官的 note 是现场判断，评分与它明显不一致时在 feedback 里说明理由（不要求跟随，但要求解释）。期望信号是备课时写的参考，候选人从别的角度答到位同样给分，不按清单扣。

### 分带锚点
提示词给出：90 以上 = 准确、有取舍、能迁移，该轮次面试官会继续加深追问；70–89 = 主干正确、细节或取舍有欠缺，达到该轮次常规要求；50–69 = 有基本尝试但关键点缺失或不稳；50 以下 = 关键内容错误或基本没答。按轮次（一面 / 二面 / HR）与校招 / 社招口径解释"常规要求"，校招 / 社招从简历里的经验年限判断，不单独加字段。

## 2. 汇总 agent 与总分

### 现状
输入只有题目、分数、每题 600 字反馈；输出 `{ summary, strengths, improvements, actionPlan }`。总分 = 所有题平均，跳过按 0。

### 改动
输入改为面试的全貌：

```
areas[]:      { name, kind, style, weight, depthReached, targetDepth, threadNote, score, weaknesses[] }
memory:       { established[], doubtful[], failed[] }
hypotheses[]: { text, status: confirmed | refuted | open, note }
round, pace
```

输出改为：

```
summary≤1200
strengths[≤5]:   { point, areaName }
weaknesses[≤5]:  { point, areaName, kind: error | missing | pattern }   pattern = 跨领域重复出现的问题
advice[≤5]
hypotheses[]:    { text, verdict≤120 }   每条简历假设一句话结论，给候选人看"简历上这句话经不经得起问"
```

提示词要求 strengths / weaknesses 引用的领域必须存在，pattern 至少引用两个领域；不得重新评分；不得输出总分与录用结论。

总分改为按领域权重加权：`round(Σ w_a · score_a / Σ w_a)`，同一领域两条线程取高分（回访补问是给机会）；跳过的领域 score 记 0 但仍计权重。

## 3. 报告自动生成

### 现状
面试结束 `status=ready_to_evaluate`，用户点"生成面试报告"触发 `/complete`。

### 改动
`persistTurn` 里状态改成 ready_to_evaluate 的同一处，用 `after()` 调 `completeMockInterview`；它已有乐观锁与"等在途评分 ≤32 s、补跑失败"的逻辑，直接复用。房间在面试结束后轮询状态（已有 `/status` 接口），completed 就跳转报告页；失败时才显示"重新生成"按钮。`/complete` 接口保留给重试。

## 4. 示范回答

### 现状
没有。

### 改动
每条未跳过的线程一段"用你自己的项目来说，这一层可以这样答"，新 agent `answer_exemplar`：

- 输入：题目（切入 + 追问）、候选人的回答、weaknesses、简历里该项目的原文段落、该领域加载过的技能包名（agent 可 load_skill）
- 输出：`{ exemplar≤1200, addressed[]: 对应的 weakness point }`
- 硬约束（提示词 + 代码）：示范里出现的项目事实必须来自简历原文或候选人的回答，不得编造数字、组件、事故；代码抽取示范里的数字与专有名词，简历和回答里都没有的记 `fabricated_detail` 并把示范降级为"思路提纲"（去掉具体数字）。
- 与逐题评分同一后台调度（评分完成后接着跑），存在 Evaluation 表新列 `exemplarJson`；失败不影响报告。

## 5. 报告页

| 区块 | 改动 |
|---|---|
| 总分 | 加一行"按领域权重加权；跳过的领域计 0" |
| 领域概览（新） | 每个领域一行：名称、权重、追到第几层 / 目标几层、面试官判断（note）、分数；失守的领域标出 |
| 简历假设（新） | 每条一行：假设原文、验证结果（已验证 / 被否定 / 没问到）、一句话结论 |
| 总体表现 | summary + strengths / weaknesses / advice 三栏，weakness 标 error / missing / pattern |
| 逐题卡 | 维度分展开时显示 evidence 与 gap；strengths / weaknesses 带原话引用；示范回答可展开；作答用时保留 |
| 面试官记忆（新，折叠） | 已确认 / 存疑 / 失守原文 |
| 对话记录 | 不变 |

数据都已在 `queries.ts` 的 conversation 里（completed 时返回 memory 与 hypotheses），只补 areas 的 weight 与 note。

## 6. 清理

- `Evaluation.difficulty`：本地版不再写；创建页在本地版隐藏难度下拉框（表单与体验版共用，体验版仍走旧题库流程）。列与旧出题模块（question-generation-agent、follow-up-agent、planning）等体验版对齐到对话式流程后一起删。
- `MockInterviewReport` 类型与 `reportJson` 升版：新增 `version: 2`；旧报告按 v1 读（improvements 映射到 advice，weaknesses 为空），报告页兼容两版，不迁移历史数据。
- 体验版的 `/api/trial/evaluate`、`/api/trial/report` 共用评分与汇总 agent，输出形状随之变化；体验版报告页同步改，或在对齐前先按 v1 形状适配（改名映射），二选一，见第 9 节。
- 画像的 `recent-feedback-card` 与 `candidate-profile/queries.ts` 读 strengths / improvements：改读 strengths / weaknesses / advice。

## 7. 评测钩子（本计划只记数据，不建框架）

| 记录 | 位置 | 之后能算什么 |
|---|---|---|
| quote_missing、unexplained_low_score | 评分 AgentRun metricsJson | 反馈是否锚在原话 |
| 现场判断 vs 事后分数 | note 含"失守 / 没答上"而 score ≥ 70，或 note 含"充分 / 到位"而 score < 60 | 评分器与面试官的一致性 |
| fabricated_detail | 示范 AgentRun metricsJson | 示范是否编造 |
| 评分器输入快照 | payload 已存 | 复跑同一输入看方差、换提示词版本对比 |

## 8. 实施顺序与验收

| 步 | 内容 | 验收 |
|---|---|---|
| 1 | 评分输出形状 + 输入增加深度与 note + 分带锚点 + quote 校验 | 单测：quote 不在回答里被置空；旧 rubric 仍可用。真机：一条追到第 3 层失守的线程分数落在 60–80，weaknesses 里有一条 missing 指明是第几层 |
| 2 | 汇总 agent 新输入输出 + 加权总分 + reportJson v2 兼容 | 单测：加权公式、同领域取高分、v1 报告可读。真机：hypotheses 每条有结论，pattern 引用 ≥2 个领域 |
| 3 | 报告页新区块 | 打开一场 completed 的面试，领域概览、假设、记忆都能看到；旧报告不报错 |
| 4 | 自动生成报告 | 面试结束后不点按钮，≤40 s 内跳到报告页；评分失败时出现重试按钮 |
| 5 | 示范回答 | 真机：示范里的数字与组件都能在简历或回答里找到；找不到时降级为提纲 |
| 6 | 清理（difficulty、画像读法、体验版适配） | npm test 全绿，体验版报告页不报错 |

预估 3 天。第 1、2 步动的是 agent 契约，先做；第 5 步独立，可以最后。

## 9. 待你定

1. 体验版是先按改名映射适配（半天），还是等对话式对齐后一起改（届时旧出题模块整体删除）。我建议前者，避免体验版报错。
2. 示范回答是否所有线程都生成，还是只给分数低于某个阈值的线程（省一半模型调用）。我建议只给 weaknesses 非空的线程。
3. 报告里的"简历假设"是否给用户看"被否定"这个词，还是换成"没有讲清楚"这类缓和的措辞。
