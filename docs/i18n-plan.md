# 中英双语方案（界面 + Agent + 技能包）

状态：**已实施**（2026-09-30，用户"反正就按照你的来"，不跑测试与评测）。实施时的偏差：界面用 cookie + `LocaleProvider`、组件内 `defineMessages`，同一个 View 被服务端与体验版客户端共用时改为客户端组件；技能包 42 本一次全译（不分两批）；`runAgent` 基座与工具循环提示也分语言；能力画像按刷新时的界面语言产出；语音转写不传语言提示（服务商支持不一，保持自动识别）。用户要求：本地版与网页版都有英文界面；Agent 在英文场次里全程输出英文，为此中英各备一套提示词与技能包。

## 0. 判断

三件事分三层，耦合度不同，分开做、分开验：

| 层 | 规模（2026-09-30 统计） | 难点 |
|---|---|---|
| 界面文案 | `src/components` 890 行、`src/app` 151 行含中文；115 个 tsx、216 个非测试 ts 有中文 | 量大但机械；日期格式 `Intl.DateTimeFormat("zh-CN")` 一处 |
| Agent 语言 | 33 个带提示词的文件；`src/lib/interview` 274 行、`src/lib/mock-interviews` 187 行提示词散文；75 句由代码直接产出、最终给用户看的固定句 | 中文不只在提示词里，还在**代码当作协议**的地方：笔记四段标题、档案五段标题、内部词拦截正则、假设兜底句、报告固定句、材料种类标签 |
| 技能包 | 42 本 SKILL.md，共 450 KB 中文 | 翻译量最大；面试官读它出题，英文版质量直接决定英文面试质量 |

不做的：InterviewBench 仍只跑中文（真值与评分词表是中文的，英文版是另一个 bench 版本）；Boss 同步（只有中文平台）；文档与宣传页（宣传页已有中英 `copy.tsx`）。

## 1. 语言从哪来

两个独立的语言维度，不要合成一个：

- **界面语言** `uiLocale: "zh-CN" | "en"`：一个 cookie `locale`（本地版与网页版同一机制，服务端组件与客户端都能读），首次按 `Accept-Language` 判，设置页可切；`<html lang>` 跟着走。不进数据库：它是这台浏览器的偏好，不是数据。
- **面试语言** `language: "zh" | "en"`：每场一个，写在 `MockInterviewSession`（新增列）与 brief 里，事件、笔记、档案、报告都用这个语言产出并**带着它存**。默认 = 界面语言；备课卡上可改（英文 JD、中文界面的人要用英文练是真实场景）。旧场次没有这列的按 zh 读。

档案（跨场记忆）是按简历挂的，可能混语言：写档案的 agent 以**本场语言**重写整份，条目自然被翻过去；不做双份档案。

## 2. 界面文案怎么做

不引 next-intl 这类库：Next 16 App Router 下一个 30 行的 `t()` 够用，也没有路由前缀的需求。

- `src/lib/i18n/`：`locale.ts`（读 cookie / Accept-Language，`setLocale` server action）、`messages/zh-CN.ts`、`messages/en.ts`（同一个 `Messages` 类型，键按页面分组，缺键编译报错）、`t.ts`（`useMessages()` 客户端 hook + `getMessages()` 服务端）。
- 迁移顺序按用户会看到的频率：AppShell 导航与设置 → 模拟面试（备课卡、房间、报告、trail）→ 数据概览 / 投递 / 历史 / 复盘 / 画像 / 简历 → 空态与错误文案 → `route-loading`、trial 页。
- 服务端产出的文案（API 错误信息、`EmptyState` 描述、`formatDateTime`）改成接收 locale。
- 网页版 `copy.tsx` 的中英结构直接并进 messages，删掉它自己的 `language` state，改读全局 locale。
- 只译界面，不译用户数据；公司名、岗位名原样。

预计触达 115 个 tsx 文件，改法机械，可分两三个提交但一次验收。

## 3. Agent 语言怎么做

用户建议"中英两版提示词"。建议的落法：**不复制文件**，每个 agent 的自然语言段抽成 `copy = { zh: {...}, en: {...} }`（与宣传页 `copy.tsx` 同一做法），结构、schema、工具定义、插值逻辑只有一份；`PROMPT_VERSION` 带语言后缀（`interviewer-v15-en`）以便 trace 与缓存区分。理由：22 个提示词版本若各复制一份，每次改规则要改两处，v14 → v15 这种迭代频率下必然漂移；而文案对象只多一个键，tsc 会逼着两边同时补。

**要一起改的"协议级中文"**（这些不是文案，是代码解析的约定，现在硬编码中文）：

| 位置 | 现状 | 改法 |
|---|---|---|
| `notes.ts` `NOTE_SECTIONS` | `["待验证","已有结论","存疑","接下来"]`，解析器按中文标题切段 | 段落改成内部键 `pending / concluded / doubtful / next`，每种语言一张标题表；解析器接受两种语言的标题（旧场次可读） |
| `dossier-doc.ts` `DOSSIER_SECTIONS` | 五段中文标题 | 同上 |
| `constraints.ts` `LEAK_PATTERN` | 中文内部词正则 | 每种语言一份词表（英文：rubric / expected signals / material / state card / my notes / system prompt） |
| `notes.ts` `initialNotes`、`brief.ts` `fallbackHypothesis` / `fallbackJdHypothesis`、`state.ts` `renderState`、`interviewer.ts` `renderAgenda` / `renderCard` | 代码拼中文句子给模型看 | 走同一个 copy 对象 |
| `summary-agent.ts` "这场没有问到。"、`report.ts` 状态词、`AREA_KIND_LABELS`、`INTERVIEW_PACE_LABELS`、评分维度名、`review-trail` 的动作标签 | 代码拼中文给用户看 | 存语言中立的键，渲染时按**场次语言**（报告）或界面语言（列表）翻 |
| 假设编号 `H-<项目>` / `J-<能力>`、动作枚举、signal | 已是英文 | 不动 |
| 蓝图能力名、切入题、基础题 `basis`、场景题 | 模型按输入语言写 | 提示词里明确"用 {language} 写"，逐字校验不受影响（引的是原文） |

**逐字校验在英文下的坑**：`isVerbatimEvidence`、`stripUnverifiedNumbers`、信息量 TOKEN 正则是按中文设计的（中文按字符匹配，英文要按词边界、大小写、标点归一）。这一块要补英文用例后再放行，否则英文场次的依据门会大量误退。

**评分 / 汇总 / 画像**：同样抽 copy；画像的维度名与观察句按场次语言产出，画像页展示时不翻译（那是用户数据）。混语言的画像先接受。

**语音**：本地版转写接口要把场次语言传给 ASR（现在没传，靠自动检测），TTS 同理。查一遍再定。

## 4. 技能包怎么做

42 本、450 KB。方案：`skills/<name>/SKILL.md`（中文，不动）旁加 `SKILL.en.md`；`loader.ts` 按场次语言取，缺英文版回退中文并在 trace 记一条（回退不阻塞面试，只是英文场次里会夹中文）。

翻译分两步，不一次做完：

1. **第一批 14 本**：索引里暴露的顶层包（基座 + 领域）。用模型初译（DeepSeek，约 15 万 token 输入，预计 < $1），人工过一遍"面试官在意什么"与"常见失守"两段——这两段是出题质量的来源，术语要地道（"失守"→ where candidates fall short，"危险信号"→ red flags，"深挖"→ probe）。
2. **其余 28 本细节包**：同法，按英文场次实际 `load_skill` 的频率排队，没人加载的先不译。

frontmatter 的 `description` / `keywords` 双语都要有（面试官看索引自选，索引语言错了选包就错）。

翻译质量的验收不是读一遍，是英文场次冒烟：同一份英文 JD + 英文简历，看备课是否选对包、题面是否像英文面试官说的话、逐字校验退回率是否与中文相当。

## 5. 顺序与验收

| 阶段 | 内容 | 验收 |
|---|---|---|
| I-1 界面 | i18n 基建 + 全部页面文案 + 设置页语言项 + 网页版 | tsc 缺键即错；两种语言各截一轮图；trial 与本地一致 |
| I-2 Agent | 场次语言列 + 协议级中文改键 + 各 agent copy 抽出 + 逐字校验英文用例 + 语音语言透传 | 单测（notes / dossier 双语解析、constraints 英文词表、verbatim 英文）；中文场次回归 1 场确认无退化；英文场次冒烟 1 场（约 $0.1） |
| I-3 技能包 | 14 本初译 + 人工过 → 28 本 | 英文冒烟 2 场看选包与题面；trace 里回退次数 |

I-1 与 I-2 可并行开工但分开提交；I-3 在 I-2 之后。每阶段一个提交。

## 6. 删除清单

- 宣传页 `copy.tsx` 里独立的语言切换 state（并入全局 locale）。
- `formatDateTime` 里写死的 `"zh-CN"`。
- 所有把中文标题当协议的解析（笔记、档案）改成键之后，旧的按中文标题切段的分支只留"读旧数据"一条路径，不再用于写。

## 7. 明确不做（本版）

- InterviewBench 英文版（是另一个 bench 版本，真值与词表都要重建）。
- 界面语言与面试语言以外的第三种语言。
- 双份档案 / 双份画像；混语言先接受。
- 旧场次内容翻译。
- 为英文单独设计不同的面试方法（提示词规则两种语言同一套，只是语言不同）。

## 8. 风险

- 逐字校验与信息量统计的中文假设是最可能翻车的地方；英文场次冒烟前先补单测。
- 英文技能包初译若不过人工，面试官英文出题会"翻译腔"，这是用户最先感知的。
- 文案迁移面广（115 个文件），中途容易漏；靠 `Messages` 类型与一个 CJK 扫描脚本（`grep -P '[\x{4e00}-\x{9fff}]' src/components src/app` 为零）兜底。
