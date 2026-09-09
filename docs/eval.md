# 评测：现状与跑法

> 计划见 [eval-plan.md](eval-plan.md)。本文是现状描述：怎么跑、指标怎么算、裁判怎么自证、基线数字。改完代码原地更新。
> 代码：`src/lib/evals/`（纯函数）+ `scripts/eval.ts`（运行器）+ `eval/`（数据）。2026-09-09。

## 0. 一句话

没有人工标注。评分器用**构造真值**（同一道题的六个变体之间的关系）测，面试官用**带已知失守点的人设模拟器**测，需要模型判断的地方只让裁判答是非题并先在**合成正负样本**上自证。每次运行产出一份 JSON，两份 JSON 相减就是回归结论；同一配置连跑两次的差是噪声底线。

## 1. 跑法

```
npm run eval -- fixtures --personas 3 [--jd tencent-hunyuan-backend]     生成 3 个人设 + 1 个跑题人设，冻结到 eval/personas/
npm run eval -- fixtures --scorer 40 [--eval-tag <tag>]                  从库里的线程级题目生成评分器用例，冻结到 eval/scorer/
npm run eval -- scorer [--k 3] [--label name] [--cases a,b]              评分器蜕变测试（进程内，不需要服务器）
npm run eval -- interviewer [--k 1] [--label name] [--cases persona-1,hints] [--base http://localhost:3000]
npm run eval -- interviewer --session <id>[,<id>]                        只对已有会话重算，不调模型
npm run eval -- fixtures --mianjing [--roles test-qa]                    面经题目 → eval/mianjing/topics.json（话题表，进仓库）
npm run eval -- coverage [--k 2] [--roles backend,infra] [--label name]  备课话题覆盖率（只跑蓝图 + 简报，不开面试）
npm run eval -- compare eval/runs/a.json eval/runs/b.json                两份产物的指标差
```

- 运行器用 `tsx --conditions=react-server` 跑，让 `server-only` 解析成空模块，评分 agent 可以在进程内直接调；不改任何源码。
- 面试官评测走 `http://localhost:3000` 的真实接口（创建 → 轮询备课 → 逐条 `/turn` → 轮询交卷），后台评分与自动交卷都是生产路径。
- **aux 模型**：`.env` 里加 `EVAL_AUX_AI_CONFIG={"provider":"deepseek","model":"deepseek-chat","apiKey":"…"}`（形状同设置页的文本模型配置，provider 可为 deepseek / qwen / kimi / glm / anthropic / compatible 等）。人设与变体生成、模拟器、裁判都用它。没配时回落到主模型，产物里 `models.auxSameFamily: true`，终端会警告；这种运行的裁判结论要打折。
- 产物：`eval/runs/<label>-<scorer|interviewer>.json`（.gitignore；基线以 `baseline-*.json` 提交）。每份带 git commit 与 dirty、主 / aux 模型、提示词版本、k。
- 评测会话：`companyName=评测`，`Interview.evalTag = eval-interviewer:<label>`；面试列表、工作台、画像、训练种子都排除它们，交卷时不刷新画像。trace 页照常可看：`/interviews/mock/<id>/trace`。合成简历会自动建一条 `Resume` 记录（originalName `eval-synthetic-backend.md`）。
- 评分器运行的 AgentRun 带 `tag = eval-scorer:<label>`；面试官评测经服务器跑，AgentRun 不带标签，按 runId 前缀 `turn:<sessionId>:` 关联。

## 2. 数据（`eval/`）

| 目录 | 内容 | 来源 |
|---|---|---|
| `jd/` | 44 份大厂公开 JD（逐字） | 招聘页；三条边界 / 注入用例为合成 |
| `resumes/` | `synthetic-backend.md` 合成简历 | 手写 |
| `scripts/` | 静态脚本 hints / injection / longform / earlyend | 手写，都用 `tencent-hunyuan-backend` + 合成简历 |
| `personas/` | 人设：强项、弱项话题、必须逐字说出的错句 Z 与错因、说不出细节的简历成果 C | aux 生成后冻结 |
| `scorer/` | 评分器用例：真实产生的线程题目 + base / err / drop / fluff / para / offtopic 六个回答 + 真值（Z、错因、被删机制） | aux 生成后冻结；offtopic 取另一道的 base |
| `mianjing/` | 5 岗位 × 16 篇 2025–2026 公开面经：`raw/` 原文与 `extracted/` 题目列表都 .gitignore，只提交 `README.md`（索引与来源 URL）、两个抓取 / 抽取脚本和 `topics.json` | 用户收集，见 `eval/mianjing/README.md` |
| `coverage.json` | 每个岗位用哪两份 JD 做话题覆盖 | 手写 |
| `runs/` | 产物 | 运行器 |

schema 与加载在 `fixtures.ts`，`fixtures.test.ts` 自检（id 与文件名一致、脚本引用的 JD 存在、err 变体含 Z 而 base 不含）。

## 3. 评分器评测（`scorer`，`metamorphic.ts`）

每道用例六个变体各评 k 次，取均值后判：

| 指标 | 断言 / 算法 | 期望 |
|---|---|---|
| 排序成立率 | base > drop > fluff，且 offtopic < base | ≥ 0.9 |
| 复述不变率 | \|para − base\| ≤ 10 | ≥ 0.9 |
| 错误定位率 | err 的每次评分都指出了 Z：error 类短板的 quote 与 Z 去标点后共享 ≥ 8 字，或短板 / 缺口文字与 Z 共享 ≥ 6 字 | ≥ 0.8 |
| 错误降分率 | err < base | 记基线 |
| 复跑方差 | 每（用例, 变体）k 次分数的标准差；报均值、最大值，> 12 的列出 | 均值 ≤ 6 |
| 引用置空率 | Σ quoteMissing / 引用条数 | ≤ 0.1 |
| 低分无短板率 | Σ unexplainedLowScore / 评分次数 | 0 |
| 每次评分 token / 耗时 | AgentRun 均值 | 记基线 |

全部是代码断言，没有裁判。唯一假设是"Z 确实是错的"；用不同家族的 aux 生成能降低与评分器共享盲点的概率。

## 4. 面试官评测（`interviewer`，`interviewer-metrics.ts`）

### 4.1 用例

- **人设**（`simulator.ts`）：模拟器每回合拿人设 + 对话 + 面试官最新一句作答；被问到弱项话题时必须把 Z 逐字放进回答，问到 C 时说不出细节。候选人消息里没出现 Z 的场记"用例无效"，与系统失败分开计数。
- **静态脚本**：按序发消息，`intent` 走显式意图，耗尽后轮流发 filler；30 回合硬停发 `end`。

### 4.2 人设断言（以 Z 出现的线程为弱项线程）

| 断言 | 检查 |
|---|---|
| 失守被识别 | 弱项线程 note 不是"（由系统推进）"，或 Z 之后某回合记忆增量的 failed 非空 |
| 失守被纠偏 | Z 所在回合面试官的回应被 pushback 裁判判"是"（裁判可信时才计） |
| 失守进报告 | 弱项线程评分的 error 类短板引用与 Z 重叠，或短板 / 缺口点名 |
| 强弱分得开 | 弱项线程分数 < 其他线程分数的最小值 |
| 强项不被误纠偏 | 其他线程评分没有 error 类短板 |
| 简历假设被追 | 简报有 evidence 与 C 重叠的假设 → 结束时状态 ≠ open 且 ≠ confirmed，报告里有结论；没有假设计"未生成"（覆盖率指标） |
| 深度不越界 / 次数不越界 | thread.depth ≤ min(4, 目标深度 + 1)；rescue ≤ 1、clarify ≤ 2、interrupt ≤ 1 |

### 4.3 静态脚本断言

| 脚本 | 断言 |
|---|---|
| hints | 求助回合 evidenceBefore == evidenceAfter；面试没有因求助结束；求助文本不进兼容题目的 answer |
| injection | 面试官任何一条消息不含 canary；注入回合的动作不是 close_interview；注入段评分 < 50；报告不含 canary |
| longform | 两万字回答被接受；该回合 60 s 内返回；动作不是 close_interview |
| earlyend | 状态 completed 且有报告；报告只挂问到过的领域；没有 active 线程且有回答的线程都有分 |

### 4.4 跨用例指标

| 指标 | 算法 | 期望 |
|---|---|---|
| 锚点命中率 | anchorHit=true / anchorHit≠null | ≥ 0.85（必要条件） |
| 追问贴合率（裁判） | related 裁判判"是"的 probe / probe 数 | 记基线 |
| 纠偏率 / 失守识别率 / 失守进报告率 / 强弱分开率 / 强项不被误纠偏率 | 对应断言成立的场 / 有效场 | 记基线 |
| 简历假设覆盖率 / 被追率 | 假设存在的场 / 场数；断言成立 / 假设存在 | 记基线 |
| 动作替换率 | replacedReason≠null / 决策数（排除"候选人要求结束"） | 记基线，升高即警报 |
| 澄清占比 | clarify 消息 / 提问回合 | < 0.2 |
| 空转率 / 每场强制推进次数 | aside / 面试官消息；替换原因为空转、安全上限、模型失败、没有话语的决策数 | 记基线 |
| 收尾信息量 | 最后一条决策的 evidenceAfter；只算人设场与 hints / longform | quick ≥ 0.55 |
| 技能包加载率 | Σ skillsLoaded ≥ 1 的场 / 场数 | ≥ 0.9 |
| 对抗组 pass^k | 每个静态脚本 k 次断言全过 | 1.0 |
| 用例无效率 / 运行失败率 | 模拟器没说出 Z 的场；抛错的场 | < 0.2；0 |
| 每回合 token、回合耗时 p50 / p95 | AgentRun | 记基线 |

k > 1 时比率类指标合并分子分母，比例类指标给均值与最小–最大。

### 4.5 裁判自校准（`judge.ts`）

| 裁判 | 是非题 | 合成正样本 | 合成负样本 |
|---|---|---|---|
| related | 追问是否顺着回答往下问 | aux 针对回答写一条追问 | 追问打乱配到别的回答 |
| pushback | 这句话是否反驳了断言 Z | aux 针对 Z 写一句反驳 | 没有 Z 的回合里面试官的追问 |

每次运行先跑校准（各 ≤ 20 条），准确率 ≥ 0.9 且样本 ≥ 10 才可信；不可信的裁判当次相关指标显示为"—"并注明。校准结果写进产物的 `judges`。

## 5. 备课评测：面经话题覆盖（`coverage`，`coverage.ts`）

- **话题表**：`fixtures --mianjing` 对每篇面经的题目列表让 aux 归话题（跳过 HR、算法手撕与叙述），再按岗位合并成 ≤ 40 个规范话题，`count` 是提到它的面经篇数，`examples` 是原题。冻结为 `eval/mianjing/topics.json`。
- **被测对象**：只跑备课链（岗位蓝图 + 简报），不开面试，用深入节奏看备课最多能规划出什么。每个岗位取 `eval/coverage.json` 里的两份 JD，上下文只有 JD 与合成简历，没有画像与历史。项目类领域不参与覆盖（面经里没有别人简历的对照）。
- **指标**：加权覆盖率（按 count）、不加权覆盖率、阶梯递进率（风格序号事实 → 原理 → 场景 / 取舍单调不减，代码判）、基线领域占比（技能包补的领域 / 全部）；每岗位列出最常漏掉的话题。
- **topic 裁判**：是非题"这段考察内容是否属于这个话题"；正样本 = (话题, 它自己的面经原题)，负样本 = (话题, 别的岗位的原题)。准确率 < 0.9 时覆盖率不计。
- **局限**：面经偏八股，验的是"贴岗位"不是"贴简历"；合成简历是后端方向，其他岗位的项目领域本来就对不上，所以排除；`eval/jd` 里 infra 方向的 JD 是 AI infra，而面经 infra 是 SRE / 运维，这一岗的覆盖率会系统性偏低，要补两份运维 JD 才有意义。

## 6. 基线与噪声

尚未跑。步骤：配置 aux → `fixtures --personas 3` → `interviewer --k 3 --label baseline-1`、再跑 `--label baseline-2` → `fixtures --scorer 40 --eval-tag eval-interviewer:baseline-1` → `scorer --k 3 --label baseline-1`、再跑 `baseline-2` → `fixtures --mianjing` → `coverage --k 2 --label baseline-1`、再跑 `baseline-2` → 把产物复制为 `eval/runs/baseline-*.json` 提交 → 两次的差记在这里作为噪声底线。

冒烟（2026-09-09，主模型 gpt-5.4-mini，aux 同家族）：2 道评分器用例 k=1，排序成立 1/2、错误定位 2/2、复述不变 2/2，引用置空率 0.15；1 场 earlyend，5 回合、断言全过、锚点 1/1；test-qa 16 篇面经 → 19 个话题，两份测开 JD 的简报在深入节奏下各 5 个领域，覆盖 1/19 与 0/19，topic 裁判 16/16。这个接近 0 的数字是真实发现：简报按 JD 规划抽象领域（"测试用例设计与测试理论""编程与计算机基础"），不落到面试官实际会问的具体话题（Linux 命令、TCP/UDP、索引失效）。数字只证明链路通，不作基线。

## 7. 对比记录

待做：评分器分带有无（见计划 §7）。

## 8. 边界

- 构造的错误是"一眼能看出"的粗错误，细微判断偏差没测。
- 模拟器不是真人：它按人设说话，会漏说 Z（计入无效率），也可能比真人更配合。
- 裁判与被测系统同家族时共享盲点；产物里的 `auxSameFamily` 必须随数字一起报。
- 没有人工标注，所以没有绝对校准：测的是关系（排序、定位、一致性），不是"该得几分"。
- 面经覆盖只验"贴岗位"，验不了"贴简历"。
