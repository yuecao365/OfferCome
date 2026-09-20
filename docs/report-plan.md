# 判分与报告改造方案（2026-09-20）

> 起因：[walkthrough-2026-09-20.md](walkthrough-2026-09-20.md) #1–#4、#15–#19，加上用户体感"报告很啰嗦"。方案阶段，未动代码。

## 0. 一句话

评分 agent 改走和面试官一样的**工具契约**（产物在 `write_evaluation` 的入参上，不再要求模型吐整段 JSON），输出 schema 砍掉一半；报告从"什么都列"改成"总分怎么来、失守在哪、练什么、逐段折叠"；切段时把候选人没答的最后一问剔掉。三件事互相独立，一个提交。

## 1. 诊断：症状成组，根因两个

| 症状 | 根因 |
|---|---|
| 评分 agent 这场 14 次调用失败 6 次（`invalid_structured_output`）；harness 报告里它可用产出率 85.5%，全链路最低；每段要跑两次采样兜底 | **输出契约选错了路**。评分是唯一还让 DeepSeek 直接吐大段 JSON 的 agent：三个维度各带 evidence（≤500）+ gap、4 条 strengths 带引用、4 条 weaknesses、3 条 advice、feedback（≤800）、resumeChecks，单次输出常超 1500 token。真实失败样本三种：中文里未转义的引号（`"多跑几遍…`）、输出截断在 advice 之后、工具调用标记混进正文。面试官与规划已改走工具入参路径后 100% 可用（这场 16/16），评分没跟着改。 |
| 报告啰嗦：总评 400 字 + 三卡各 5 条 + 每段 feedback 段落 + 三个维度各带原话与缺口 + 答得好的 4 条带引用 + 短板 4 条带引用 + 练什么 3 条 + 示范 + 考察点 + 证据账 | **同一件事说三遍**。逐段的 weaknesses / advice / feedback 互为改写；汇总的 weaknesses / advice 又是逐段的合并；画像再来一遍。schema 大是报告长的直接来源，也是上面失败率的直接来源——两件事同一刀。 |
| 结束面试后，刚问出、还没答的追问被算成"完全没答"（场景段 64 分） | 切段把段内每句面试官发言都记进 `probes` / `depth`，不管后面有没有候选人回答；评分看到"追问 1：…"却没有对应回答，按没答上扣。 |
| 总分 80 不知道怎么来的；能力估计 6/10 "没问到" | 展示问题：公式在 `computeInterviewTotalScore`（各段最高分按 项目 3 / 场景 2 / 基础 1 加权），页面不说；能力估计把没测到的和测到的并列。 |

## 2. 改动

### A. 切段：已问未答不计（`interview/aftermath/cut.ts`，纯代码）

- 段的最后一句面试官发言之后没有候选人非按钮发言 → 不进 `probes`、不计 `depth`、不进 `facets`、不进题面。开场问（`entryQuestion`）之后没回答的段本来就是 `skipped`，不变。
- 评分输入 `thread.probeCount` 随之减一；评分提示词里"追到第 n 层答不上属于正常"的口径不变。
- 报告"这道题"题面只列答过的追问。决策记录页照旧显示全部发言（那是事件日志）。
- 单测：`cut.test.ts` 加一例"最后一问无回答"。

### B. 评分 agent：工具契约 + 精简 schema（`question-evaluation-agent.ts`，`evaluation-v8`）

**契约改法**（照抄面试官 / 规划的做法，不新造机制）：
- `output: "none"`；新增 confirm 档工具 `write_evaluation`，入参 schema = 评分 schema；钩子 `beforeTool` 里跑 `validateQuestionEvaluation` 的硬门（维度名、引用逐字、简历核对两头逐字），不过就把原因当失败工具结果退回让模型改一次；过了挂起，`interrupted` 的 `pending.input` 就是产物。
- `toolChoiceAt`：有只读工具时前 2 步 `auto`（查简历 / 包 / 档案），第 3 步起强制 `write_evaluation`；`maxSteps 4`。没有只读工具时第 0 步就强制。
- `rescue = salvageJson(schema)` 保留给"模型不调工具直接吐 JSON"的旧路径。
- **删掉双采样**：`Promise.allSettled([带工具, 不带])`、`secondScore`、`lowConfidence`、`toolShift` 全删（报告页"两次评分分歧较大"提示、`InterviewQuestionEvaluation` 里对应列、eval facts/metrics 里的引用一起清）。失败重试仍由 `completion.collectEvaluations` 补跑一次，那次不给工具。
- 双采样当初是为了兜失败率；契约换路后失败率若仍 > 5%，再回来谈。

**schema 砍法**（每项写明去留理由）：

| 字段 | 现在 | 改后 | 理由 |
|---|---|---|---|
| `dimensions[].evidence` | ≤500 | ≤160 | 画像要它做观察证据（置信 0.9），留；只要一句原话 |
| `dimensions[].gap` | ≤300 | ≤120 | 报告里维度旁的一句缺口 |
| `strengths` | ≤4，点 ≤200 + 引用 ≤200 | ≤2，点 ≤80 + 引用 ≤120 | 报告只显示前两条 |
| `weaknesses` | ≤4，点 ≤200 | ≤3，点 ≤120，**新增 `practice` ≤120** | 练什么并进短板，一条短板一条练法 |
| `advice` | ≤3 × 300 | **删** | 与 weaknesses.practice 重复 |
| `feedback` | ≤800 | **改 `verdict` ≤120** | 一句结论，逐段折叠时当标题行；长评语与短板 / 练法重复 |
| `difficulty`、`competencyId`、`resumeChecks(≤3)` | 不变 | resumeChecks ≤2 | |

输出预算从 2400 降到 1200 token。评测 `eval/scorer`（蜕变测试）用的字段——dimensions.score、weaknesses.kind / quote、strengths.quote、quoteMissing——都还在，指标口径不变。

### C. 汇总 agent 与报告形状（`summary-agent.ts` → `summary-v4`，`report.ts` → v3）

- `summary` ≤300 字：两句话，先站得住的再失守的。
- `strengths` ≤3；`weaknesses` ≤5，每条加 `practice`；`advice` 删。`hypotheses` 不变。
- `REPORT_VERSION = 3`。`parseStoredReport` 读到 v2 时在内存里升级（advice[i] 挂到 weaknesses[i] 的 practice，多出的 advice 各自成一条 kind=missing 的短板，不改库）。体验版存档同样走这个函数，不用改文档版本。
- 档案 agent（dossier）读 `report.weaknesses` 不读 advice，不受影响；画像不读报告，不受影响。

### D. 报告页重排（`mock-interview-report.tsx`，本地版与体验版共用）

从上到下：

1. **总分**：数字旁一行"六段按材料权重加权：项目 3 · 场景 2 · 基础 1；没答的段不计"（用实际段数与权重渲染）。右侧 `summary` 两句。
2. **失守与练法**：≤5 条，每条：标签（说错了 / 没答上 / 反复出现）+ 短板一句 + 练法一句 + 所在段名。这是报告的主体。
3. **站得住的**：≤3 条，一行一条。
4. **简历上的说法**：只展开"已验证 / 没有讲清楚"；"没问到"合成一行"这场没问到：A、B"。
5. **能力估计**：只列有样本的，带估计与置信；没测到的合成一行"没问到：…"。
6. **逐段反馈**（默认折叠）：折叠行 = 段名 · 分数 · `verdict` 一句。展开后：题面（只含答过的追问）、维度分（名 + 分 + 缺口一句，不再印 evidence）、短板（带引用 + 练法）、答得好的（≤2）、简历核对（有才显示）、我的回答（折叠）、示范（折叠）。
7. 页尾一个小链接"决策记录"。

**删掉的展示**：总评旁的"按这个团队的业务出题"段；"这道题在考察什么"整块（期望信号是内部物；追问角度"问过 / 没问到"信息量低）；"面试官的证据账"折叠块；每段的 feedback 段落；维度的 evidence 原话；"两次评分分歧较大"提示。

**文案**：短板标签与正文之间的间距核一下（截图确认，走查文本里是贴着的）；规划提示词加一句"称候选人用'候选人'，不用他 / 她"（假设区出现"让她给出"，`brief-agent.ts` 规则段）。

### E. 示范回答只给需要的段

`attachExemplar` 条件从"有短板"改为"分数 < 80 或有 error 类短板"。这场 6 段全生成（$0.008），改后约一半。示范本身不改。

## 3. 明确不做

- 不给评分加第二个裁判或自洽投票；失败率靠契约换路解决，不靠多跑。
- 不改评分表（rubric）与画像映射，2026-09-20 刚定。
- 不把能力估计改成"下一场优先补测"的调度——那是记忆 / 备课的事，另议。
- 不动决策记录页（trace）：它是开发者工具，只从报告页降级成页尾链接。
- 不做报告导出 / 分享。

## 4. 删除清单

- `question-evaluation-agent.ts`：双采样、`LOW_CONFIDENCE_GAP`、`secondScore` / `lowConfidence` / `toolShift` 返回值与 `selection` 记账里的对应指标。
- schema 字段：`advice`、`feedback`（改 `verdict`）；`summarySchema.advice`。
- Prisma `InterviewQuestionEvaluation`：`lowConfidence`、`secondScore`、`toolShift` 三列（查 `queries.ts`、`types.ts`、`trial/interview.ts`、`interview/eval/facts.ts`、`metrics.ts` 的引用）。
- 报告组件：`Teaching`、`Ledger`、`business` 段、`lowConfidence` 徽章；`teaching.ts` 只剩 `answerSeconds` / `verdict` 时并进 question 视图字段，`MockInterviewQuestionTeaching` 类型删。
- `outcome.ts` / `completion.ts`：advice 拼装。

## 5. 验证

1. 单测 + `tsc`：cut（新例）、question-evaluation（validate 不变）、report（v2 → v3 升级）、summary、trial interview 文档。
2. 真机一场（标准节奏，约 $0.06）：看评分 agent 成功 / 退回次数（目标：0 次 `invalid_structured_output`）、报告页各块、折叠行。
3. 评分器蜕变测试跑一遍 `npm run eval -- scorer --k 1`（28 题 × 6 变体 = 168 次，估 $0.3）：排序成立率、错误定位率、引用置空率不劣于 2026-09-10 的 v3 基线（0.68 / 0.89 / 0.12）。这一步要用户点头再跑。
4. 走查清单 #1–#4、#15–#19 逐条复核，更新 walkthrough 文档状态。

## 6. 文档

`interview-pipeline.md` §6–§8（切段规则、评分契约与 schema、汇总与报告 v3、版本号）、`features.md`（报告结构）、`status.md`、`decisions.md` 加"评分走工具契约、单采样"一条。
