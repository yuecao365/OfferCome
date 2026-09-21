# InterviewBench

一个评"AI 技术面试官"的 benchmark。任何能和候选人对话、面完给一张评分卡的系统都可以提交：裸模型加一句提示词、固定题本、本仓库的面试官 harness、别家产品。bench 拥有任务、候选人和评分器，提交者只负责面试。

对照 SWE-bench：任务是一个岗位加一份简历加一个候选人（SWE-bench 是一个 issue）；环境是 bench 自带的候选人模拟器（SWE-bench 是仓库和 Docker）；提交物是逐字稿加评分卡（SWE-bench 是 patch）；评分器看评分卡对不对和逐字稿守不守规则（SWE-bench 看测试过不过）。

评的不是"像不像真人面试"（那需要真人），是**面对一个水平已知的候选人，面试官能不能面出正确的结论**，以及过程是否专业、稳定、省回合。

状态（2026-09-20）：子任务层已建并有两模型结果（`results.md`）；端到端层已建：`tasks/dev/` 30 个任务、bench 侧候选人模拟器、评分器、三种提交（裸模型 `bare:<模型>`、固定题本 `script:<模型>`、本仓库 `offercome`），`npm run bench:e2e` 三种提交各在 2 个任务上跑通；开发集全量、留出集与正式榜未跑。冒烟里三家对高水平候选人都系统性低估（等级精确率 0.1–0.2），是提交的问题还是模拟器"高水平"不够像，要在开发集全量上再看。

---

## 1. 两层

| 层 | 形式 | 测什么 | 真值 |
|---|---|---|---|
| 子任务层（`subtasks/`） | 静态题，一题一答 | 面试官的基本功：判对错、识空话、定位错句、出下一问、追还是换、定层级、整场出评分卡 | 外部数据：Beyond the Resumé 的模拟面试与裁判测试（MIT）、本仓库评分器用例、真实面经的提问链；少量人工标注 |
| 端到端层（`tasks/`） | 交互：面完一场 | 把基本功串起来用在一个会回话的人身上，最后判断对不对 | 候选人的构造档案（水平、埋点）+ 逐字稿规则 |

子任务层任何模型都能直接跑，见 §7。下面 §2–§6 是端到端层的定义。

---

## 2. 接口：提交者要实现什么

一个提交是一个**面试官**，实现三个方法。bench 驱动整场对话，提交者不接触候选人模拟器的内部，也拿不到候选人档案。

```ts
interface Interviewer {
  /** 一场开始：拿到岗位与简历，可以在这里备课。返回值 bench 不看。 */
  start(input: { taskId: string; jobTitle: string; jobDescription: string; resume: string; budget: { maxTurns: number } }): Promise<void>;
  /** 每回合：拿到候选人刚说的话（开场为 null），返回面试官的下一句；返回 { end: true } 表示收尾。 */
  turn(input: { candidateSaid: string | null; turnIndex: number }): Promise<{ say: string; end?: boolean }>;
  /** 面试结束：交评分卡（格式见 §5）。 */
  scorecard(): Promise<Scorecard>;
}
```

约束：

- 面试官每回合只能说一段话；一段话里问几个问题由它定，但评分器会数问号（§6 专业项）。
- `maxTurns` 由任务的节奏给（见 §3），到了 bench 强制结束并索要评分卡。
- 提交者可以用任意模型、任意内部结构；bench 记录它声明的模型家族（用于 §6 的家族对照），不做限制。
- 提交写在 `src/lib/evals/bench/submissions/`，实现 `Submission { name, family, create(): Interviewer }`；跑法 `npm run bench:e2e -- --set dev --submissions bare:main,script:main,offercome --k 1`。

---

## 3. 任务格式（`tasks/<set>/<id>.json`）

一个任务 = 真实岗位 + 同向简历 + 一个候选人档案。候选人档案对提交者隐藏，只给评分器。

```json
{
  "id": "e2e-042",
  "set": "dev",
  "job": { "title": "AI Agent 开发工程师", "company": "字节跳动", "description": "…真实 JD 全文…", "source": "eval/jd/bytedance-agent-eval-engineer-aily.json" },
  "resume": { "text": "…简历全文…", "source": "eval/resumes/synthetic-ai-llm.md" },
  "competencies": [
    { "id": "agent-runtime", "name": "Agent 运行时与工具调用", "weight": 3 },
    { "id": "eval", "name": "评测与回归", "weight": 3 },
    { "id": "llm-basics", "name": "大模型基础", "weight": 2 },
    { "id": "backend", "name": "后端工程", "weight": 1 }
  ],
  "budget": { "pace": "standard", "maxTurns": 16 },
  "candidate": {
    "style": "shaky",
    "seed": 7,
    "levels": { "agent-runtime": "high", "eval": "medium", "llm-basics": "medium", "backend": "low" },
    "facts": [
      { "type": "wrong", "topic": "消息队列", "says": "ack 机制保证消息只会被消费一次" },
      { "type": "inflated", "topic": "接口性能", "resume": "P95 1.6 秒", "says": "P95 0.8 秒" },
      { "type": "hollow", "topic": "RAG 项目", "resume": "召回准确率提升 30%", "canExplain": false }
    ],
    "behavior": "humble_lead"
  }
}
```

字段说明：

- `competencies`：从 JD 抽出的岗位能力清单，带权重（核心 3 / 重要 2 / 边缘 1）。这是评分卡的维度，也是"回合花在哪"的真值。抽取由 bench 构建时做一次并人工过一遍，之后固定。
- `budget`：节奏决定回合上限（quick 10 / standard 16 / deep 24）。所有提交面对同一上限。
- `candidate.levels`：每项能力的真实水平，三档：`low` 只到名词、`medium` 说清机制、`high` 讲到取舍与验证。由代码按 `seed` 采样，`style` 决定分布（扎实 / 一知半解 / 啰嗦 / 爱求助 / 对抗）。
- `candidate.facts`：真实候选人会做的事，最多三条：`wrong` 说错一句、`inflated` 把简历数字说大、`hollow` 简历上写了但说不出细节。每条写明触发话题和候选人该怎么说。三分之一的任务不埋任何 fact（测误报）。
- `candidate.behavior`：一种表现方式或空：`humble_lead` 先说不会再答、`long_answers` 啰嗦、`help_loop` 反复求助、`manipulate` 要分 / 不作答、`off_resume_intro` 自我介绍夹简历外项目。

规模：开发集 30（10 份 JD × 3 候选人），留出集 20（另 10 份 JD × 2）。留出集只在发布时跑。任务由 `npm run bench:build -- --set dev|heldout` 一次性生成（能力清单与埋点候选由 `env.json` 的 taskBuilder 模型提出，水平与埋点组合由种子决定），生成后人工过一遍能力清单与 wrong 埋点是否真的错，之后只改文件不重跑。

---

## 4. 候选人模拟器（bench 拥有）

所有提交面对同一个候选人。模拟器：

- 固定模型与版本（写在 `env.json`，换版本就是换 bench 版本），与主流提交的模型**不同家族**。
- 输入：简历、`levels`、`facts`、`behavior`、`style`、面试官的上一句。输出：候选人的一句话。
- 三条硬约束（沿用 Beyond the Resumé）：**不主动交代证据**（没问到的不说）、**只答被问到的**、**按水平答**（`low` 的能力被追到机制层就答不上；`high` 的能力被问到取舍能答出取舍）。
- `facts` 在触发话题第一次被问到时必须按 `says` 说出；`behavior` 按其定义每回合生效。
- 模拟器自己不知道评分标准，也不知道面试官是谁。

局限（随结果一起报）：候选人是 LLM 模拟的，比真人整齐、偏配合；偏差方向已知，幅度未对真人校准。

---

## 5. 评分卡格式

真实招聘委员会的格式，任何面试官都能填：

```json
{
  "ratings": [
    { "competencyId": "agent-runtime", "level": 3, "evidence": "我们把 tool_choice 设成 none 强制收尾…" },
    { "competencyId": "eval", "level": 2, "evidence": "同一配置跑两遍，两遍之差当噪声" }
  ],
  "redFlags": [
    { "type": "wrong", "quote": "ack 机制保证消息只会被消费一次", "note": "ack 只保证至少一次" },
    { "type": "inflated", "quote": "P95 0.8 秒", "note": "简历写 1.6 秒" }
  ],
  "overall": "hire",
  "summary": "两句话"
}
```

- `level`：1 不会 / 2 知道 / 3 会用 / 4 有判断。对应真值 `low` = 1–2、`medium` = 3、`high` = 4（评分器按这个映射比）。
- `evidence` 与 `redFlags.quote` 必须逐字来自逐字稿里候选人的话（去标点后为子串）。
- `overall`：`strong_no_hire` / `no_hire` / `hire` / `strong_hire`。
- 没问到的能力可以不填；评分器记为"未评"，不当错，但影响覆盖。

---

## 6. 评分器

只读两样东西：逐字稿、评分卡。不读提交者的任何内部状态。

### 6.1 判断对不对（主指标）

| 指标 | 算法 | 真值 |
|---|---|---|
| 等级一致性 | 评分卡各项 `level` 映射到三档后与 `levels` 比，报精确率与二次加权 κ | 候选人档案 |
| 结论单调性 | 同一岗位下，真值平均水平高的候选人 `overall` 不低于低的；报违反的配对比例 | 候选人档案 |
| 依据真实率 | `evidence` 逐字出现在候选人发言里的比例 | 逐字稿 |

### 6.2 有没有被忽悠

| 指标 | 算法 | 真值 |
|---|---|---|
| 红旗命中率 | 每条 `fact`：`redFlags` 里有一条 `quote` 与 `says` 重叠 ≥ 8 字，分 wrong / inflated / hollow 三类报 | 埋点 |
| 当场追出率 | `fact` 说出后两回合内，面试官的话引用了它或追问了它的口径 | 埋点 + 逐字稿 |
| 红旗误报率 | 说错 / 夸大类红旗里对不上任何埋点的条数（没埋点的任务应为 0）。"说不出细节"类不计误报：低水平候选人对简历项说"是同事做的"，真面试官也会记一笔 | 埋点 |

### 6.3 问得值不值

| 指标 | 算法 | 真值 |
|---|---|---|
| 达到正确判断的回合数 | bench 侧的独立裁判每两回合出一次等级（提交者不参与；`--turn-judge` 开启，费用约翻倍），记每项能力从第几回合起稳定在正确等级；报平均值与未达到的比例 | 候选人档案 |
| 覆盖 | 权重加权的"被问到"比例 | JD 能力权重 |

### 6.4 专业不专业（逐字稿规则，全部代码）

| 规则 | 判定 |
|---|---|
| 一次一问 | 面试官单句问号数 ≥ 2 的比例 |
| 不重复 | 同一问题（去标点后相似度 ≥ 0.9）出现两次 |
| 不泄露 | 面试官发言含"评分标准 / 满分 / 期望答案"类字样 |
| 说不会就换 | 候选人连续两句表示不会（模拟器按 `low` 水平作答时会标记）后，面试官仍在同一能力上追 |
| 按时收尾 | 在 `maxTurns` 内主动收尾并交了评分卡 |
| 接话（唯一用裁判的项，**未实现**） | 追问是否顺着候选人上一句：裁判用与提交不同家族的模型，先过冻结校准集（人工标注 40 条，κ ≥ 0.6 才报），并做打乱配对的关系测试。等 s3 标注完成后再建 |

### 6.5 稳不稳

| 指标 | 算法 |
|---|---|
| pass^3 | 留出集每任务跑 3 次；一次"通过" = 等级一致性 κ ≥ 0.6 且红旗误报为 0 且专业项全过；三次全过才算 |
| 等级复跑方差 | 三次评分卡各项等级的标准差 |
| 对抗稳健 | `manipulate` / `help_loop` 任务上的判断一致性不低于无 behavior 任务 |

### 6.6 效率

回合数、每场 token 与成本、回合延迟 p95，由提交者自报或 bench 记账。

---

## 7. 子任务层（已建）

| 子任务 | 题数 | 语言 | 给什么 | 要什么 | 真值来源 | 指标 |
|---|---|---|---|---|---|---|
| s1-correctness | 56 | 中 | 一问一答 | 有没有技术错误 | 评分器用例：原版 vs 插入错句版 | 准确率、平衡准确率 |
| s1b-evidence | 60 | 英 | 一问一答 + rubric | 回答有没有实质证据 | Beyond the Resumé 裁判测试：夸大 / 无关 / 重复 = 无 | 平衡准确率 |
| s2-locate | 28 | 中 | 一问一答（含错） | 摘出错句 | 插入的错句 | 命中率 |
| s3-next-question | 60 | 中 30 / 英 30 | 对话前缀 | 写下一问 | 真实面经的下一问（中）；BtR 面试官的下一问（英） | 人工判"同一意图"，标注文件在 `labels/` |
| s4-probe-or-switch | 40 | 英 | 对话前缀 | 追同一能力还是换 | BtR 裁判后验的维度变化（不平衡，追 9 / 换 31） | 平衡准确率 |
| s5-level | 60 | 英 | 一问一答 + 三档锚点 | low / medium / high | 模拟候选人的原型水平 | 精确率、相邻率、二次加权 κ |
| s6-scorecard | 60 | 英 | 整场逐字稿 + 简历 + 六维 rubric | 每维等级 + 依据 + 红旗 | 模拟候选人的原型；BtR 报 GPT-5 裁判 0.761 | 原型识别率、每维精确率、等级 MAE |

跑法：

```
npm run bench -- --tasks s1,s1b,s2,s4,s5,s6 --models main,openai:gpt-5.4-mini --label <label>
npm run bench -- --tasks s3 --models main --label <label>      # 生成下一问 → labels/ 人工判
```

`main` 是设置页的文本模型；`provider:model` 借设置页里该服务商的 key；其他名字读环境变量 `BENCH_MODEL_<name>`。产物 `runs/<label>-<task>-<model>.json`（不进仓库）；结果表在 `results.md`。

---

## 8. 榜

基线是裸模型：GPT、Claude、DeepSeek 各配同一句"你是这个岗位的技术面试官，先看 JD 和简历，面完给评分卡"。然后是固定题本（按简历顺序出题、问完打分，不自适应）。然后是本仓库的面试官 harness 及其关掉某个部件的版本。每行报 §6 全部指标，表下固定一段局限（§4）。

---

## 9. 预注册与版本

- 任务集、评分器代码、裁判校准集在跑留出集之前进仓库；跑完不改口径。
- `env.json` 记模拟器模型与版本、裁判模型与版本、种子；任一变动 bench 版本号加一，旧结果不跨版本比。
- 每次运行产物带 git commit、提交者声明的模型家族、k、费用。

## 10. 局限

- 候选人是 LLM 模拟的，未对真人校准；"像不像真实面试"不在本 bench 的测量范围内，本 bench 测的是"给一个可控的候选人，能不能面出正确结论"。
- 岗位能力清单与权重由构建时抽取并人工确认，是任务的一部分，不是被测系统的产出。
- 人工标注只有一人（s3、接话裁判校准），报自身复标一致性作上限。
- 子任务层的英文题候选人由 GPT-5 模拟，比真人整齐。

## 11. 目录

```
eval/bench/
  README.md              本文
  results.md             子任务层结果（两模型）
  subtasks/*.json        子任务题
  labels/*.json          s3 人工标注文件
  external/btr/          Beyond the Resumé ML 子集快照（MIT）
  tasks/dev|heldout/     端到端任务（dev 已建 30 个；heldout 待建）
  env.json               模拟器 / 裁判 / 任务生成的模型版本
  ../../src/lib/evals/bench/   types、candidate（模拟器）、grade（评分器）、submissions/{bare,script,offercome}
  ../../scripts/bench-build-tasks.ts、bench-e2e.ts
  runs/                  运行产物（不进仓库）
```
