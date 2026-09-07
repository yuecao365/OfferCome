# 面试开始前：改进计划（v3 备课）

> 基于 [interview-flow-before.md](interview-flow-before.md) 描述的现状。面试中、面试后另起计划，本篇不动它们，但本篇定下的数据结构要给后两阶段留好位置。
> 修订：2026-09-08 第二稿——JD 是必填的主要依据而不是弱信号；技能包按 Agent Skills 的渐进式披露由模型自行加载；取消联网补全。
> 执行状态：第 1、2、4 步已完成（提交 4739619、44e5318、a74812a）；第 3 步技能包内容进行中；第 5 步评测待做。已定：fundamentals 评分表 60/25/15，索引上限 12，岗位包加 product-manager。

## 0. 三条原则

1. **JD 必填，是岗位特异性的来源。** 同名岗位在不同公司的差别只能从 JD 来，所以 JD 说了的都要进简报。JD 没说的部分（写得薄、过时、只列职责不列要求）由**岗位基线**补齐，基线只补不盖。
2. **技能包 = Agent Skills（渐进式披露）。** 索引（名称 + 一句描述）常驻上下文，模型自己决定加载哪个包的全文，再决定是否读包内更深的参考文件。代码只做一件事：包多时按岗位名和 JD 先缩小索引，不截片段、不替模型选内容。
3. **不联网。** 岗位知识来自仓库内版本化的技能包，同一份 JD + 简历 + 节奏，领域集合应基本稳定。

## 1. 三源合成，JD 优先

### 现状
领域只来自蓝图，蓝图只看 JD；JD 薄时暂停问用户或联网补全。技能包只在备课时按正则截 2500 字塞给模型。

### 改动
- 蓝图不变：仍只看 JD，origin=jd。它保证"JD 说了什么"完整进入简报。
- 新增**岗位基线**：模型从加载的技能包（见第 3 节）里判断"这个岗位通常还会考什么"，作为 origin=baseline 的能力补进领域绑定。基线的作用是**补空**，不是校正 JD。
- 简报 agent 输入：蓝图（jd）+ 技能包索引与加载工具 + 简历与项目 + 已知弱项。提示词的合成规则（草案）：
  > JD 是这个岗位的第一依据：JD 明确要求的方向必须有领域覆盖。JD 没写到、但这个岗位通常会考的方向，从你加载的技能包里补，标为基线来源。候选人简历上有具体项目时，至少一个 project 领域围绕它深挖。
- 溯源：报告页"这道题在考察什么"对 baseline 来源显示"岗位常见要求（技能包 X）"。

### 删除
- **JD 补全 agent、联网搜索、JD 复核暂停（awaiting_jd_review）、jd-strategy 接口与复核页面**整套删除。JD 已是必填；薄 JD 由基线补位，不再打断用户。
- `requiredCompetenciesForPace`、`needsJobDescriptionReview`、`MIN_JD_CHARS_FOR_AUTO_ENRICH` 随之删除。备课流水线变成：上下文 → 蓝图 → 简报 → 落库。

## 2. 领域的风格与阶梯的风格

### 现状
kind 只有 technical / project / behavioral；technical 被要求从场景切入，纯知识题不会出现；阶梯是四句自由文本。

### 改动
- 领域加 `style`：technical 领域取 `scenario`（场景切入，现状）或 `fundamentals`（课纲式知识点）；project / behavioral 不填。评分表按 kind + style：

  | kind / style | 维度（权重） |
  |---|---|
  | technical · scenario | 技术正确性 50 · 分析与取舍 30 · 表达结构 20（现状） |
  | technical · fundamentals | 准确性 60 · 原理深度 25 · 表达结构 15（新增，权重待定） |
  | project / behavioral | 不变 |

- 阶梯每级带风格标签：`ladder: [{ text, style: fact | principle | scenario | tradeoff }]`。备课时由模型标；面试中阶段再让 probe 工具回填实际风格。项目线程的阶梯于是可以写成"职责(fact) → 用到的原理(principle) → 故障场景(scenario) → 取舍(tradeoff)"，这是"把八股和场景题融进项目线程"的**材料**，怎么问仍由面试官自己决定。
- 提示词只说明两种风格何时值得用，不规定数量。

## 3. 技能包：按 Agent Skills 规范重做

### 3.1 披露方式（改动的核心）

| 层 | 内容 | 谁决定 |
|---|---|---|
| 索引 | 每个包的 name + description，常驻备课 agent 的系统提示词 | 代码：包多时按岗位名 / JD 关键词缩小到 ≤12 个候选（不缩内容） |
| SKILL.md 全文 | 主题、阶梯、好题坏题、危险信号 | 模型调用 `load_skill(name)` 自行加载，可多次 |
| 参考文件 | 包目录下的 `references/*.md`：更深的追问链、按主题的题库 | 模型调用 `read_skill_file(name, path)` 自行加载 |

删除现在的"按正则截片段注入"。模型一次都不加载时照常备课，并在 selection 日志里记 `skillsLoaded: 0`，作为评测指标。

面试中阶段同样的两个工具会给回合 agent（本篇不做）。

### 3.2 内容覆盖：计算机大部分岗位

第一版目标：一个应届 / 社招候选人贴任何一个主流计算机岗位的 JD，都能命中至少一个领域包。内容由我联网调研整理（招聘页 JD 样本、公开的岗位技能图谱与面试手册），不限于下面这张草稿：

| 层 | 包（草稿，待调研后增删） |
|---|---|
| base | project-deep-dive（项目深挖通用追问）、behavioral（行为面）、system-design（系统设计通用） |
| domain | backend、frontend、mobile、fullstack、data-engineering、data-science、machine-learning、ai-llm（大模型应用 / Agent）、algorithm（算法岗）、infra-sre（运维 / SRE / DevOps / 云）、security、test-qa、embedded、game、database、cs-fundamentals（操作系统 / 网络 / 数据结构 / 数据库原理）、product-manager（产品经理） |
| stack | backend-java、backend-go、backend-python、backend-cpp、backend-node、frontend-react、frontend-vue、mobile-android、mobile-ios、mobile-flutter、ml-pytorch、data-spark、infra-k8s |

每个包的 SKILL.md 固定结构：

```
---
name / description / keywords / layer / parent
---
## 岗位职责与考察重点      这个岗位在真实面试里被问什么、为什么
## 主题                    每个主题：阶梯（入门→原理→场景→取舍）、好题、危险信号、期望信号
## 好题 / 坏题对比
## 项目结合钩子            简历出现 X 时追什么
references/                可选：按主题的深层追问链与题库
```

每个包目标 8–15 个主题；base 与 domain 层优先，stack 层第一版只做上面列的。

## 4. 简历假设：不动规则

evidence 必须逐字来自简历的硬门保留。它只约束"关于简历的断言"，领域来源由第 1 节解决。

## 5. 数据与兼容

- 简报加 `version: 3`；旧简报只读兼容：style 视为 scenario，阶梯字符串包成 `{ text, style: null }`。
- `generationMetadataJson` 加 `style` 与 `competencyOrigin`（jd / baseline），报告页溯源用；旧的 inferred 分支随补全 agent 一起删除。
- 提示词版本升 interviewer-v3。

## 6. 评测钩子（无人评，全部可自动算）

| 指标 | 说明 | 期望 |
|---|---|---|
| JD 覆盖率 | 蓝图 core 能力中被某个领域绑定的比例 | ≥ 0.8，保证"JD 说了的都在" |
| 基线参与率 | 领域 competencyIds 含 baseline 的比例 | 薄 JD 组高于完整 JD 组 |
| 技能包加载率 | 备课时 `skillsLoaded ≥ 1` 的比例；加载的包与岗位方向是否一致 | ≥ 0.9 |
| 假设证据通过率 | 通过逐字硬门的假设比例 | ≥ 0.8 |
| 预算利用率 | plannedTurns / turnRange.max | 0.8–1.0 |
| 领域一致性 | 同一输入重复 3 次，领域名的相似度 | 明显高于随机 |
| 风格分布 | fundamentals / scenario 领域数 | 技术岗两种都出现过 |
| 对抗组 | 注入指令 / 英文 JD / 极薄 JD | 不崩、注入标记不出现在简报里 |

## 7. 实施顺序与验收

| 步 | 内容 | 验收 |
|---|---|---|
| 1 | 删除 JD 补全 / 联网 / 复核暂停整条路径；流水线简化为 上下文 → 蓝图 → 简报 | 测试全绿；极薄 JD 也能直接开房 |
| 2 | 技能包工具：索引缩小 + `load_skill` + `read_skill_file`；删除片段注入 | 一场真实备课日志里能看到加载了哪些包 |
| 3 | 联网调研 + 编写技能包（base、domain 全部；stack 按草稿） | 用 43 份冻结 JD 逐份检查：每份至少命中一个领域包 |
| 4 | 简报 v3：基线来源、style、阶梯标签、评分表、兼容、溯源 | 旧会话报告页照常；新简报含 style 与来源 |
| 5 | 评测脚本按第 6 节跑一遍，记录基线数字 | 数字进 docs/eval-plan.md |

第 3 步是内容工作量大头，预估 2 天；其余 2 天。每步独立提交。

## 8. 待你定

1. fundamentals 评分表的权重。
2. 岗位包草稿：哪些要加（例如产品经理、数据分析这类偏非研发岗）、哪些第一版不要。
3. 索引缩小的上限（草案 12 个候选包）是否合适。
