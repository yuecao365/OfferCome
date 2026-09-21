# 项目进度（现状）

> 只写"现在是什么样"。完成一个阶段、定下一步、发现新的未决问题时原地更新本文件并标日期。上次更新：**2026-09-21**（InterviewBench v2 修复之后）。

## 1. 一句话现状

流程闭环已完成：投递 → 简历 → 模拟面试（备课 + 面试合并为一个 agent loop）→ 切段评分 → 报告 / 档案 → 能力画像；体验版与本地版同构；评测框架（自博弈、消融、复盘）可用，最终架构上的三组对照已跑完。**当前处于"用户实测体感驱动修失败清单"的阶段，没有正在施工的大计划。**

## 2. 各模块状态

| 模块 | 状态 | 说明 |
|---|---|---|
| 投递管理 + Boss 同步 | 稳定 | 浏览器 CDP 采集方案已验证；30 天无动静自动标"已拒绝" |
| 简历中心 + 项目抽取 | 稳定 | PDF / Word / 图片抽文本，项目识别一次落库 |
| 面试记录 + 录音 / 文本导入 | 稳定 | 转写 + 说话人分离 + 结构化草稿 + 语音指标 |
| 面试复盘 | 稳定 | 真实 + 模拟同收，来源筛选 |
| **AI 模拟面试** | 核心，持续打磨 | 见 [interview-pipeline.md](interview-pipeline.md)。版本：JD 分析 `mock-interview-v8-no-priority`、备课 `brief-v23`、面试官 `interviewer-v11`、评分 `evaluation-v8`、示范 `exemplar-v1`、汇总 `summary-v4`、档案 `dossier-v1`、报告 reportJson v3 |
| 能力画像 | 稳定 | 模拟面试观察零模型调用，六维度；每岗位视角一次合成 |
| 体验版（Vercel） | 功能对齐 | 剩余不可对齐：评测工具、Boss 无感同步（需扩展）、真实面试整场录音导入（待定）。已知未修：开面试可能超 Vercel 60s 函数上限（见 §4） |
| 语音模拟面试 | 本地可用 | 录音 → 转写 → 作为回合发送；面试官按句朗读（speechSynthesis）；没做服务端 TTS / VAD / 流式 ASR |
| 评测 / 自博弈 / 消融 | 封版 | 不再扩框架；见 [eval.md](eval.md) 与 `interview-merge-plan.md` §D |

## 3. 已完成的阶段（时间线，只留一句）

| 日期 | 阶段 | 结论 |
|---|---|---|
| 2026-08 | 投递 / 简历 / 面试记录 / 复盘 / 画像 v1、前端深色改版、技能包 P0 | 基础功能 |
| 2026-09-07 | 对话式面试官 v1 | 从"问完 8 道预生成题"改为对话 |
| 2026-09-08 → 09-11 | 面试前 / 中 / 后三段改造、评测框架阶段 0 封版、画像结构检查、体验版全同步、流程简化 | 评分 v3 误报率 0.45 → 0；备课提示词对覆盖率无作用（缺口在包内容） |
| 2026-09-12 → 09-14 | 微调、节奏、按真实一面阶段重构、主动权归面试官 | 前缀缓存命中 79%，每回合 24k → 5k token |
| 2026-09-14 → 09-16 | 整体重建（设计 v2 + 施工图 A–E4）：事件日志、模拟器、切段、估计器、评论员、影子、语义记忆、语音接回 | 机制全通；实验层互相打架 → 设计修订 v3 |
| 2026-09-16 | F1 核心层收敛、F2 失败驱动评测（postmortem、失败清单、扰动）、§9–§12（删档位、覆盖配额、纯代码切段、边界与输出契约）、G1–G4 + G6（agent 循环、评分带工具、面试官只读工具、档案、轨迹评测） | 提示词 7.3k → 3.5k；实验层默认关 |
| 2026-09-17 → 09-18 | 重建 v5：删实验层、动作层控制、意图归模型、包改方法书、依据分型 | 撤回 / 重说 / 固定句根治 |
| 2026-09-19 → 09-20 | 备课与面试合并为一个 loop（A 候选人变工具 → B 备课并进 loop → C 删交接产物 → D 三组对照）；包正文不再回放 | 见 §5 数字 |
| 2026-09-21 | InterviewBench 端到端层（[eval/bench/README.md](../eval/bench/README.md) §2–§6）：面试官接口、30 个开发集任务（真实 JD × 同向简历 × 带隐藏水平与埋点的候选人）、bench 侧候选人模拟器（gpt-5.4-mini）、只读逐字稿与评分卡的评分器（含单测）、三种提交（裸模型 / 固定题本 / 本仓库 harness） | 冒烟 1 任务裸 DeepSeek：跑通；留出集与正式榜未跑 |
| 2026-09-21（下午） | InterviewBench 端到端层 v2：v1 在开发集跑到 89/120 场时经独立审查（Opus 5 子 agent，只读）判定环境不可信，逐条重建——评分卡三档一对一、模拟器分档字数 + high 自查 + 埋点只做一次、埋点与水平互斥（wrong 只落 medium、hollow 不落 high 且带数字）、面试规范由 bench 公开给所有提交、评分卡翻译模型对齐、hollow 命中只认推脱句或带单位数字、误报按句级豁免、唯一"通过"定义；三轮审查后合格（[eval/bench/README.md](../eval/bench/README.md) 状态行） | 正式跑批被 **OpenAI 额度用完**挡住（模拟器是 gpt-5.4-mini）；v1 结果作废 |
| 2026-09-20（夜 2） | 走查剩余项（[walkthrough-fixes-plan.md](walkthrough-fixes-plan.md)）：面试官对议程外经历先承认再切（interviewer-v11，`off_resume_intro` 扰动）、按钮行不再冒充候选人发言、内部词拦"材料"、开场按节奏报时长；新建页与列表页文案；资料抽屉数字引用；画像标签人话化、刷新只合成总览 + 本场岗位（8 次调用 → ≤ 2）；**评分模型独立成设置项，默认 gpt-5.4-mini** | 单测 + tsc；模拟 1 场 `off_resume_intro`；真机见下 |
| 2026-09-20（夜） | InterviewBench 子任务层（[interviewbench-plan.md](interviewbench-plan.md)、[eval/bench/README.md](../eval/bench/README.md)）：从真实面试角度拆六种面试官能力，七个静态子任务共 364 题（真值来自 Beyond the Resumé 的 ML 模拟面试与裁判测试、本仓库评分器用例、27 篇面经的真实提问链）；`npm run bench` 跑任意模型 | 两模型结果见 [eval/bench/results.md](../eval/bench/results.md)：判对错 / 定位错句接近满分（题偏易）；定层级 DeepSeek 压高分（κ 0.51 vs gpt-5.4-mini 0.82）；出评分卡两家 0.66 / 0.63（论文 GPT-5 0.76），都分不开混合型原型；追还是换真值待抽检；S3 待人工标。费用 $0.46 |
| 2026-09-20（晚） | 判分与报告改造（[report-plan.md](report-plan.md)）：切段不计没答的最后一问；评分走工具契约、单采样、schema 砍半（evaluation-v8）；汇总 summary-v4、报告 v3（练法并进短板）；报告页重排（总分公式、失守与练法、逐段折叠、删内部物）；示范只给 < 80 或有说错的段 | 458 测试通过；真机 1 场（快速节奏，$0.03）评分 0 失败；评分器蜕变测试 k=1：排序 0.68 → 0.82、引用置空 0.12 → 0.01、删机制未检出 0.32 → 0.18、结构化输出失败 0/177（见 eval.md §7.6） |
| 2026-09-20 | 精简：删模拟面试的轮次与人设（含 `behavioral` 包）、蓝图能力 priority、JD 分析简化 schema 重试、整理员 / 评论员残留字段；系统提示词改为岗位 → 候选人 → 方法 → 输出，去掉版本号行；技能包改为模型看全量索引自选（代码只守至少一个领域包、最多 3 个）；项目评分表改为 事实与细节 / 取舍与复盘 / 表达结构；技能包重组为两级多对多共 42 个（12 domain 各留 8 个左右核心主题、28 detail 可属多个领域、索引只列顶层 14 个，见 decisions；每族按 2026 面试变化补了"面试官在意什么"）、描述统一 ≤ 60 字去掉简历与题库措辞；文档重整为 AGENTS.md + status / architecture / features / pipeline / decisions | 457 测试通过；备课冒烟 1 场（资深测试开发·AI 评测岗）：模型自选 test-qa + ai-llm + project-deep-dive，依据门禁退回 1 次后写成，3 步 $0.011 |

## 4. 未决问题（按用户是否会感知排序）

- **InterviewBench 开发集 v2 全量未跑**：环境已过三轮独立审查，命令 `npm run bench:e2e -- --set dev --submissions bare:main,bare:openai:gpt-5.4-mini,script:main,offercome --k 1 --label dev-v2`（约 120 场，估 6–8 美元），需要 OpenAI 有额度（候选人模拟器）。跑前探针 dev 服务器。审查留下两条非阻塞局限（README §10）：豁免的句级粒度、重复检测弱。
- **harness 没有"回合上限"输入**：按节奏配额走（13/19/28 回合），bench 给的 10/16/24 用不上，"主动收尾"这一列对它不可比；要不要加这个产品输入，用户定。

| 问题 | 首次 | 状态 / 方向 |
|---|---|---|
| 用户视角走查（2026-09-20，真实简历 + 混元 Agent Harness JD，13 回合）发现 21 条，清单在 [walkthrough-2026-09-20.md](walkthrough-2026-09-20.md) | 2026-09-20 | 判分与报告一组（#1–#4、#15–#19）已按 [report-plan.md](report-plan.md) 修完；画像（#5、#6）、面试官与文案（#7–#14、#20、#21）待定 |
| `recentQuestions`（同岗位最近几场的切入题）喂给备课"换切入点"：如果多数场次第一题相同，会压低后续切入的多样性 | 2026-09-20 | 待与用户讨论 |
| 模拟面试删了轮次：二面 / HR 面若要做，要另想设计（原来只差人设一句话） | 2026-09-20 | 用户未想好，先不做 |
| 面试官一句多问（比例约 0.5） | 2026-09-17 | 未修；v5 后没有底线层，只能改提示词 / 约束；先看用户体感 |
| 体验版开面试疑似 Vercel 函数超时（"An error o… is not valid JSON"） | 2026-09-06 | 未修；方向：客户端先判 content-type；确认 Fluid Compute 或拆请求 |
| 粘贴 AI 生成的回答 | 2026-09-15 | 不揭穿、不标记，可接受 |
| 评分一次通过率（DeepSeek 不按 schema） | 2026-09-17 | 部分修：提示词压缩 + 配平解析；看后续记账 repair 行数 |
| "自适应 vs 固定题本"在能力估计 ρ 上没赢（0.62 vs 0.80，区间重叠） | 2026-09-20 | n=10 不够判；是否再投钱由用户定 |
| 真实 PDF 简历曾丢失（`.local/` 目录），默认简历以 txt 恢复 | 2026-09 | 用户需重传 PDF |
| `scripts/boss/browser-launch.test.ts` 不在 `npm test` 的 glob 里 | — | 小事，顺手时并进 |
| CI 只构建 Docker 镜像，不跑 lint / test | — | 测试全靠本地 |

完整的真实失败清单（含已修）在 [interview-failures.md](interview-failures.md)。

## 5. 可上简历的数字（来源与局限）

来源 [resume/project.md](resume/project.md) 与 [resume/career-claim-ledger.json](resume/career-claim-ledger.json)，全部可由 `npm run harness-report` 或 `eval/runs/*.json` 复现。

| 主张 | 数字 | 局限 |
|---|---|---|
| 输出契约三级降级 | 1636 次真实调用一次通过 78.6% → 可用产出 97.0%；800 万输入 token 总成本 $0.46 | 含开发期与评测流量，单人使用 |
| 动作层校验 | 621 句里拦下 47 次非法动作（7.6%） | 只说明拦了多少 |
| 约束层消融（2026-09-20，10 + 10 场配对） | 行为判定通过 70% → 37%，配对 9 劣 / 0 优 / 1 平 | 干净的正结果 |
| 技能包消融 | 备课出题方向可复现地变化（"预算耗尽"主题 6/10 vs 0/10）；面试层无差异 | 太弱不上简历，作设计事实 |
| 自适应 vs 固定题本 | 每次追问信息量 +39%（配对 9/10） | 信息量是新词量代理；ρ 上不能写"更准" |
| 前缀缓存 | 命中约 80–84%；包正文不回放后每场输入 224k → 163k | n=2 |

## 6. 下一步候选（都未放行，等用户定）

- **InterviewBench 端到端层**（[interviewbench-plan.md](interviewbench-plan.md) §2.2）：模拟候选人带真值与埋点、评分卡黑盒接口、pass^k。子任务层已建（见下）。
- `recentQuestions` 对切入点多样性的影响。
- 一句多问：提示词或约束层。
- 体验版超时修复。
- 报告页显示项目问了哪些角度。
- 是否为"自适应 vs 固定题本"再投场次。
- 长期：语音（服务端 TTS / VAD）、前端打磨（`frontend-polish-plan.md` 待重估）。

## 历史文档索引

按主题，最新在前。标"现状"的会随代码更新；其余是当时的方案 / 施工图 / 调研，只作追溯。

**现状类**：[interview-pipeline.md](interview-pipeline.md)（模拟面试全流程，2026-09-20）· [eval.md](eval.md)（评测跑法与基线）· [interview-failures.md](interview-failures.md)（失败清单）· [provider-contracts.md](provider-contracts.md)（多服务商契约）· [deployment.md](deployment.md) / [deployment_CN.md](deployment_CN.md)

**面试架构演进**：[interview-merge-plan.md](interview-merge-plan.md) + [interview-merge-design.md](interview-merge-design.md)（2026-09-19/20，合并 loop，已实施）· [interview-rebuild-v5.md](interview-rebuild-v5.md)（2026-09-18，已实施）· [interview-design-revision-4.md](interview-design-revision-4.md)（被否的补丁版，留档）· [interview-design-revision-3.md](interview-design-revision-3.md)（2026-09-16，F1/F2 与 §9–§12，已实施）· [agent-depth-plan.md](agent-depth-plan.md)（G1–G6，G5 抛弃）· [interview-refactor-plan.md](interview-refactor-plan.md) + [interview-system-design.md](interview-system-design.md)（2026-09-14 重建施工图与设计 v2）· [interviewer-agency-plan.md](interviewer-agency-plan.md)（2026-09-14）· [interview-phases-plan.md](interview-phases-plan.md) / [interview-realism-plan.md](interview-realism-plan.md) / [interview-pacing-plan.md](interview-pacing-plan.md) / [interview-tuning-plan.md](interview-tuning-plan.md)（2026-09-12/13）· [interview-simplify-plan.md](interview-simplify-plan.md)（2026-09-10）· [interview-before-plan.md](interview-before-plan.md) / [-during](interview-during-plan.md) / [-after](interview-after-plan.md)（2026-09-08）· [interviewer-agent-plan.md](interviewer-agent-plan.md)（2026-09-07）· [ai-refactor-plan.md](ai-refactor-plan.md)（2026-08-17）

**其他模块**：[eval-plan.md](eval-plan.md) · [profile-plan.md](profile-plan.md) · [trial-sync-plan.md](trial-sync-plan.md) · [skill-packs-plan.md](skill-packs-plan.md)（部分作废）· [frontend-polish-plan.md](frontend-polish-plan.md) / [frontend-redesign-research.md](frontend-redesign-research.md) · [resume/project.md](resume/project.md)（简历素材）
