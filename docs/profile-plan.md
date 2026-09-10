# 能力画像：结构检查与改进计划（阶段 1）

> 基于 [interview-flow-after.md](interview-flow-after.md) §5 描述的现状，回答 [next-steps.md](next-steps.md) §3 的四个问题。代码入口：`src/lib/candidate-profile/`（画像流水线）、`mock-interviews/question-evaluation*.ts`（评分 evaluation-v3）、`mock-interviews/context.ts` + `interviewer/brief-agent.ts`（`knownWeaknesses` 链路）、`components/candidate-profile/`（画像页）。
> 2026-09-10 第一稿。只读代码与数据库（`dev.db`，只读查询），未改代码。
> 执行状态：§9 三点均按建议执行，全部完成（2026-09-10），见文末"执行记录"。

## 0. 四个问题的答案

| 问题 | 答案 |
|---|---|
| 1. 评估器逐题重读回答是否与评分 v3 重复；能否从评分推导 | **重复。** 模拟面试的每一段已经有评分表维度分（0–100）+ 支持分数的原话 + 缺口，以及带原话的优点 / 短板；评估器再读一遍回答，给的是同一批信息的 1–5 级粗版本（同一段摘录常被复用给 3 个维度）。**模拟面试可以纯代码推导，去掉这次模型调用；真实面试没有评分表和逐段评分，仍需评估器。** |
| 2. 画像维度与评分表维度、领域 kind / style 的映射是否清楚 | **不清楚，且没有落在代码里。** kind / style → 评分表是显式的（`rubricForArea`）；评分表的 10 个维度名 → 画像 8 维没有任何对应关系；评估器只看到 `category`（technical / general / resume_project），映射全在模型脑子里。画像 8 维里 answer_relevance、problem_solving 在评分表中没有对应物；delivery_fluency（语音）与 reflection_growth 在文字模拟面试里没有任何产出。 |
| 3. `knownWeaknesses` 是否真的改变了简报 | **现在等于没有接。** 三层原因：(a) 数据上，`getCandidateProfileContext` 只取 roleKey=all、active、`hasConflict=false` 的洞察，库里 all 视角 7 条 active 洞察有 6 条 `hasConflict=1`，过滤后只剩 1 条 strength，弱项为 0 条，所以当前每场备课收到的 `knownWeaknesses` 是空数组；(b) 内容上，洞察是维度级的教练话术（"先把结论放在前面，再补流程细节"），简报的领域是考点级的，前者没有可落的位置；(c) 提示词上，唯一的指令是"可以转化为假设去验证"，而假设的 evidence 必须逐字来自简历，一条表达类弱项根本写不出合法假设。**对照实验本次没跑成**（原因见 §6），作为实施第 1 步补跑。 |
| 4. 画像页除"近期定性反馈"外是否还依赖旧字段 | **页面本身不依赖旧字段**；洞察卡、图谱、分组、时间线都读 `CandidateInsight` / `AbilityObservation` / `CandidateProfileMetric`。但有三处死链或死代码：近期反馈卡的"针对练习"带的是模拟面试的 questionId，而 `seedQuestionId` 只接受 `kind=real` 的题，点了等于没点；报告页"出题参考 / 画像贡献"卡的 `personalizationUsed` 在对话式流程里从不赋值，卡永远不显示；`LEGACY_DIMENSION_MAP`（technical_knowledge 等旧维度名）库里已无数据。 |

数据现状（只读查询，2026-09-10）：

| 项 | 数 |
|---|---|
| 已完成模拟面试 / 其中评测会话 | 49 / 45 |
| 已完成真实面试 | 2（1 场录音转写、1 场复盘文本，无语音指标） |
| 完成的逐段评分（有 dimensionsJson） | 105，全部有维度分；96 条有短板 |
| 能力观察（v4 评估） | 82 条，6 场面试；delivery_fluency 0 条 |
| all 视角 active 洞察 / 其中 hasConflict | 7 / 6 |
| 用户纠正过的观察 / 锁定的洞察 | 0 / 0 |
| profile_assessment 调用 | 4 次成功，均值 4.4 s |

## 1. 原则

1. **同一份证据只让模型读一次。** 逐段评分已经是"带原话的维度判断"，画像只做映射与聚合，不再让第二个模型重新打分。真实面试是唯一没有逐段评分的来源，评估器只为它保留。
2. **映射写进代码，不留在提示词里。** 评分表维度 → 画像维度是一张常量表，与 `rubricForArea` 放在一起，单测保证每个评分表维度名都有归属。
3. **反哺备课的单位是考点，不是维度。** 备课能用的是"上次在哪个考点失守了"，不是"表达结构偏弱"。

## 2. 模拟面试的观察从评分推导

### 现状
`assessment.ts` 对每场已完成面试调一次 `profile_assessment`（`assessment-agent.ts`），输入全部问答 + 既有评分的 score / feedback，输出逐题 1–5 级观察，代码校验摘录逐字在回答里。为了记录"适用维度"，它还给每道题 upsert 一条 `InterviewQuestionEvaluation`（真实面试的题因此多出 19 条 `sourceKind=profile, pending` 的空评分行），并靠 sourceHash 的特殊处理让空行与无行同哈希。

### 改动
新增纯函数 `candidate-profile/derive.ts`：输入一道模拟面试题的评分（rubric、dimensions、strengths、weaknesses、answer），输出观察列表。

```
每个评分表维度 d（跳过没有画像归属的）：
  dimension = PROFILE_DIMENSION_BY_RUBRIC[d.name]
  score     = 分带：< 50 → 1，50–69 → 2，70–79 → 3，80–89 → 4，≥ 90 → 5
              （与 evaluation-v3 的分带和画像 1–5 锚点逐档对齐）
  excerpt   = d.evidence 若去标点后逐字在回答里（复用 quoteInAnswer）；
              否则取第一条落在同维度的 strength / weakness 的 quote；
              都没有 → excerpt = "缺口：" + d.gap（没有 gap 就不产出这条观察）
  confidence = 有原话 0.9，只有缺口 0.6（常数，聚合里只作组内权重）
跳过的段（answer 为空）不产出观察。
```

评分表维度 → 画像维度（常量表放在 `interviewer/brief.ts`，与 `rubricForArea` 相邻）：

| 评分表维度 | 出自 | 画像维度 |
|---|---|---|
| 技术正确性、准确性 | technical | knowledge_accuracy |
| 分析与取舍、原理深度 | technical | reasoning_depth |
| 表达结构、复盘与表达 | technical / behavioral / project | communication_clarity |
| 事实与细节、证据充分性 | project / behavioral | experience_evidence |
| 判断与反思 | behavioral | reflection_growth |
| 岗位关联 | project | 无（是项目与岗位的匹配度，不是候选人的稳定能力） |

`assessment.ts` 在"产出观察"处分流：`kind=mock` 走 `derive`，`kind=real` 走评估器。其余（sourceHash 幂等、纠正保留、语音观察、事务落库）不变。模拟面试的 sourceHash 改为包含每题评分的 `evaluatedAt` 与 score，评分变了才重算。

### 删除
- 评估器输入的 `existingEvaluation`（真实面试没有评分，这个字段只在模拟面试有意义）；提示词里"既有模拟面试反馈只能作为辅助"一句同步删。
- `InterviewQuestionEvaluation.applicableDimensionsJson`、`assessmentId` 与 `InterviewAssessment.questionEvaluations` 关系：全仓库无读者。随之删掉给真实面试补空评分行的逻辑和 sourceHash 里"空行等于无行"的特殊处理；`sourceKind` 的默认值 `"profile"` 不再有来源。Prisma schema 改动，`db push` + `generate`。
- `rules.ts` 的 `profileEvidenceWeight`（注释自称"给旧调用方"，只有测试在用）。

## 3. 画像维度收敛到有来源的 6 个

### 现状
8 维：answer_relevance、knowledge_accuracy、reasoning_depth、problem_solving、experience_evidence、communication_clarity、delivery_fluency、reflection_growth。文字评估只出前 6 个；页面分三组展示，reflection_growth 不在任何组。

### 改动
- 删 `answer_relevance`（评分表没有对应物；扣题在面试中由 interrupt 处理，完整性体现在 missing 短板与维度 gap 里）和 `problem_solving`（与 reasoning_depth 的"分析深度与取舍"重叠，评分表也不区分）。真实面试评估器的可评维度同步收窄到 knowledge_accuracy、reasoning_depth、experience_evidence、communication_clarity、reflection_growth。
- 分组：内容力 = knowledge_accuracy + reasoning_depth；证据力 = experience_evidence + reflection_growth；表达力 = communication_clarity + delivery_fluency。图谱锚点从 8 个减到 6 个。
- `PROFILE_ASSESSMENT_VERSION` 升 v5 触发全量重建：2 场真实面试各调一次评估器，4 场真实使用的模拟面试零调用。旧版本的观察与洞察随重建作废（无用户锁定、无纠正记录，没有要保留的东西）。

### 删除
`LEGACY_DIMENSION_MAP` 与 `normalizeProfileDimension` 的兼容分支（库里所有观察都已是新维度名），留一个 `isProfileDimension` 守卫。

## 4. 反哺备课改为"最近失守的考点"

### 现状
`context.ts` 读画像洞察（+ `seedInsightId` 指定的一条）→ 备课 payload `knownWeaknesses[{title, statement}]`（≤ 6）→ 提示词"可以转化为假设去验证"。如 §0 所述，实际收到的是空数组，收到了也没有落点。

### 改动
- `MockInterviewContext` 新增 `recentWeaknesses`：真实使用（`REAL_USAGE_INTERVIEW_WHERE`）、最近 5 场已完成模拟面试的逐段短板，岗位名相同的排前面，每条 `{ areaName, kind: error | missing, point, quote }`，最多 6 条；`seedQuestionId` 指定的题的短板插到最前。数据来源与近期反馈卡相同（`weaknessesJson`），零模型调用。
- 备课 payload 用 `recentWeaknesses` 替换 `knownWeaknesses`；提示词那句改为：
  > 候选人最近几场失守的考点（recentWeaknesses）：与本岗位相关的，安排一个领域或阶梯中的一级重新验证，并在该领域 description 里注明"复测：…"；与本岗位无关的忽略。
  这是简报能落的位置（领域 / 阶梯），不再借道简历假设。
- `seedQuestionId` 放开到模拟面试的题（去掉 `kind=real` 的限制），近期反馈卡与复盘页的"针对练习"因此生效；真实面试的题仍按现在的方式进 history。
- 删 `seedInsightId` 全链路：`context.ts`、`seeds.ts` 的 insight 分支、`session-state.ts`、创建接口、设置页隐藏字段、洞察卡的"针对性训练"按钮（洞察是维度级的，没有可练的题；卡上的证据本身带题目，用户从证据的问题进复盘再练）。
- 旧题库流程（`relevance.ts` / `planning.ts` / `question-generation-agent.ts`）仍读 `context.profile.insights`，阶段 2 整体删除；本阶段 `context.profile` 字段保留不动，只有新流程改读 `recentWeaknesses`，避免碰将死的代码。

### 验证（对照实验，用阶段 0 的备课链）
一次性脚本（scratchpad，不进仓库、不扩评测框架）：调 `analyzeMockInterviewJob` + `generateInterviewBrief`，2 份 JD（tencent-hunyuan-backend、tencent-hunyuan-agent-harness-engineer）× {无短板, 3 条考点级短板（如"MySQL 回表与覆盖索引没答上""Kafka 顺序性说错""线程池参数取舍没讲"）} × k=2，共 8 次备课。判据：领域 name / description / 阶梯里是否出现对应考点（人工核对 + 关键词），以及无短板组的领域数与基线领域占比是否与 §7.2 的 brief-v6 数字一致（提示词改动不能伤覆盖率）。结果记进本文件"执行状态"。

## 5. 画像页与报告页的清理

- 近期反馈卡：读法不变（strengths / weaknesses 的 point），"针对练习"随 §4 生效。
- 报告页删除"出题参考 / 画像贡献"卡及 `personalizationUsed`、`profileContributionCount`、`getProfileContributionCount`（对话式流程从不赋值前者；后者在推导后等于评分表维度数，没有信息量）。"查看能力画像"链接并入报告页顶部操作区。
- 工作台总结（`analytics.ts`）与真实面试备战页（`prepare.ts`）读洞察 / 指标的方式不变，只随维度收窄自然变化。
- 体验版：`/api/trial/assess` 与浏览器编排（`profile-actions.ts`）本阶段不动，仍对模拟与真实面试都调评估器；阶段 2 网页端同步时改为对模拟面试调 `derive`（纯函数，可直接在浏览器跑），届时评估器只剩真实面试一条路。

## 6. 发现但本阶段不动

- **冲突判定过严**：`detectInsightConflict` 在跨面试分差 ≥ 1.5 时标冲突，真实（权重 1）与模拟（0.5）混合、每维只有两三场时几乎必中，所以 6/7 的洞察挂着"存在反向证据"。§4 之后备课不再读洞察，这只影响页面观感；阈值调整留给阶段 4 一起看画像质量。
- **评测跑不起来**：本机 `node_modules` 缺 `.bin` 目录和 `@esbuild/win32-x64`，`npm run eval` / `npm test` 报 `'tsx' is not recognized`（`node_modules/@next` 今天 13:43 有改动，可能是另一个会话在装包）。§4 的对照实验和 §7 的回归都要先 `npm install` 恢复。
- 语音观察（`deriveDeliveryObservation`）保留原样，阶段 3 语音面试接入后才有数据。

## 7. 数据与兼容

- Prisma：`InterviewQuestionEvaluation` 删 `applicableDimensionsJson`、`assessmentId`（及索引与关系）；`InterviewAssessment` 删 `questionEvaluations`。`npx prisma db push` + `npx prisma generate`，重启 dev 并清 `.next`。
- 版本：`PROFILE_ASSESSMENT_VERSION` = ability-assessment-v5（全量重建）；`BRIEF_PROMPT_VERSION` = brief-v7（提示词一句话改动 + payload 字段名）。
- 库里 19 条 `sourceKind=profile` 的空评分行随列删除一并清理（一条 SQL，在迁移步骤里做）。
- 流程文档：`interview-flow-after.md` §5、`interview-flow-before.md` §2 / §5.2 原地更新；`next-steps.md` §3 标完成。

## 8. 验收与回归

| 步 | 内容 | 验收 |
|---|---|---|
| 1 | 修复 node_modules；跑 §4 的对照实验（改代码前，先量现状的 `knownWeaknesses` 是否有效果：同一脚本注入 3 条维度级洞察） | 结果写进本文件；预期现状组无变化 |
| 2 | `derive.ts` + 映射表 + 单测；`assessment.ts` 分流；sourceHash；删 `existingEvaluation` | 单测：每个 `rubricForArea` 维度名在映射表里；分带边界；摘录不在回答里则退到 quote / gap；跳过的段无观察 |
| 3 | 维度收敛到 6 + 分组 + 图谱锚点 + 评估器维度收窄；版本 v5；删 legacy map | `npm test` 全绿；画像页全量重建后 6 维有等级、`AgentRun` 里没有模拟面试触发的 `profile_assessment` |
| 4 | schema 清理 + 删空评分行 | `db push` 后一场模拟面试交卷 → 画像刷新成功 |
| 5 | `recentWeaknesses` + 提示词 brief-v7 + `seedQuestionId` 放开 + 删 `seedInsightId` | 对照实验：3 条考点级短板至少 2 条在简报里有复测位置（k=2 两遍一致）；无短板组覆盖率与 §7.2 brief-v6 相比差值不超过 §6.3 噪声（`coverage --k 4 --label profile-1` + `compare`） |
| 6 | 报告页删卡 + 文档更新 | 报告页无"出题参考"卡；三份流程文档与实际一致 |

真机：`http://localhost:3000` 跑一场快速模拟面试 → 报告出来后画像页在一分钟内更新且刷新过程没有 `profile_assessment` 调用；近期反馈卡"针对练习"进入创建页并在备课简报的某个领域 description 里看到"复测"。

预估 1 天：第 2–4 步半天，第 5 步（含实验与回归）半天，每步独立提交。

## 9. 待你定（已定：三点均按建议）

1. 删 answer_relevance 与 problem_solving 两个维度（§3）。替代方案是保留但只由真实面试评估器产出，模拟面试永远"待积累"；我建议删。
2. `knownWeaknesses` 是改成考点级短板反哺（§4，建议）还是直接删掉反哺链路（更省，但闭环就断了，"针对练习"也没有落点）。
3. 报告页"画像贡献"那半张卡是否要保留一句"本场已计入能力画像"（§5）。我建议整卡删除，只留链接。

## 10. 执行记录（2026-09-10）

### 10.1 对照实验：备课对"已知弱项"的反应

一次性脚本（scratchpad，未进仓库）：2 份 JD（tencent-hunyuan-backend + 后端合成简历、tencent-hunyuan-agent-harness-engineer + ai-llm 合成简历），深入节奏，每条件 k=2。判据：简报领域的 name / description / 切入问题 / 阶梯里是否出现注入的三个考点（关键词），以及 description 里是否明确写了"复测"。

| 条件 | 后端 JD 命中（3 个考点） | Agent JD 命中 | 明确标注复测的领域数 |
|---|---|---|---|
| 改前 brief-v6，无弱项 | 0/3、3/3 | 2/3、1/3 | 0、0 / 0、0 |
| 改前 brief-v6，注入 3 条**维度级**洞察（现状的 `knownWeaknesses` 内容） | 3/3、2/3 | 2/3、2/3 | 0、0 / 0、0 |
| 改前 brief-v6，把**考点级**内容塞进同一字段 | 3/3、3/3 | 3/3、1/3 | 1、1 / 0、0（写法是"结合历史薄弱点"） |
| 改后 brief-v7，`recentWeaknesses` 考点级 | 3/3、3/3 | 1/3、2/3 | 3、3 / 4、2 |
| 改后 brief-v7，列表为空 | — | — | 0、0 / 0、0 |

读法：后端 JD 的三个考点本来就是该岗位的常考题，无弱项时也常被覆盖（0/3 与 3/3 是噪声）；能说明问题的是"复测"标注：维度级洞察 0 次，考点级 4 场里 12 处，且写的就是注入的那句失守点（"复测：回表与覆盖索引的区别没有答上"）。Agent JD 里模型偶尔把一条失守点标到不相干的领域上（tracing 领域标了"工具调用重试与幂等"），是过度套用，不影响该考点本身有领域覆盖。

中途发现：提示词里只要出现"复测"一词，列表为空时模型也会在简历项目上编一条"复测：状态机重构的职责边界"（4 场里 3 场）；"列表为空时不写复测"的指令无效。改为代码只在 `recentWeaknesses` 非空时才拼入这一段，之后 4/4 场零复测。

### 10.2 代码改动

- `candidate-profile/derive.ts`（新）：评分 → 观察的纯函数；`interviewer/brief.ts` 加 `PROFILE_DIMENSION_BY_RUBRIC`；`assessment.ts` 按 kind 分流，模拟面试零模型调用；`assessment-agent.ts` 只服务真实面试，删 `existingEvaluation`。
- 维度收敛到六个（`types.ts`），图谱锚点、颜色、分组随之调整；`LEGACY_DIMENSION_MAP` 与 `profileEvidenceWeight` 删除；`persist.ts` 清掉已删维度的指标行。
- schema：`InterviewQuestionEvaluation` 删 `assessmentId`、`applicableDimensionsJson`，`sourceKind` 去掉默认值；库里 19 条 `sourceKind=profile` 的空评分行删除。
- `mock-interviews/recent-feedback.ts`（新）：最近几场的逐段反馈，画像页冷启动卡和备课的 `recentWeaknesses` 共用；`context.ts` 改喂 `recentWeaknesses`，`seedQuestionId` 放开到模拟面试的题；`seedInsightId` 全链路删除（创建接口、快照、种子、设置页、洞察卡按钮）。
- brief-v7：提示词的反哺段落只在有失守考点时拼入。
- 报告页删"出题参考 / 画像贡献"卡与 `personalizationUsed` / `profileContributionCount`，总体评价下加"查看能力画像"链接。

### 10.3 验证

- `npm test` 444 通过；新增 `derive.test.ts`（映射全覆盖、分带、引号剥离、缺口兜底）和 service 测试"模拟面试不调评估器"。
- 真机：升到 ability-assessment-v5 后画像页自动全量重建，6 场真实使用的面试里 4 场模拟面试零模型调用、2 场真实面试各调一次评估器，合成 3 次（all + 2 个岗位视角），14 条洞察；页面六维图谱正常。评分 v2 时代（没有 gap、evidence 是转述）的 3 段推不出观察，属预期：没有逐字证据就不产出。
- 备课覆盖率回归：见 10.4。

### 10.4 覆盖率回归（brief-v7 vs brief-v6）

`coverage --k 4 --label profile-1` 五岗覆盖率全部"翻倍"（backend 0.15 → 0.40、ai-llm 0.21 → 0.47），远超噪声；用今天的裁判重判 brief-v6 存档的简报全文得到同样的数字（backend 0.37、ai-llm 0.47），所以是 DeepSeek 裁判跨天漂移，不是简报变了。结论：brief-v7 对覆盖率无影响，回归通过；裁判漂移记入 [eval.md](eval.md) §7.5 / §8。

按用户当天定的原则（模拟面试的价值在项目追问，八股用户可以自己背），覆盖率只作门禁，不再是备课改动的目标。
