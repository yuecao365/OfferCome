# 前端重设计调研：从「AI 味」到「工具感」

> 状态：调研结论；六步执行顺序已于 2026-09-03 全部落地（见 §七），命令面板与 MiSans 未做。目标是给整站视觉与交互换一套更克制、更有工艺感的语言，同时不推翻现有 token / 组件基建（基建健康，见 `docs/frontend-polish-plan.md` 的评估）。
>
> 调研日期：2026-09-03。部分源站响应过慢已跳过（Refero 的 Linear token 页、Emil 的 7 tips 页、aniq-ui 暗色数值页），结论以其余来源和本地走查为准。

---

## 一、为什么现在一眼能看出是 AI 做的

对照业界总结的「AI 生成前端」指纹（[avoid-ai-design](https://github.com/funboy322/avoid-ai-design)、[How to fix the AI-generated look](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh)），走查了全部 8 张页面截图和 `globals.css` / `ui/*`，我们的项目命中以下几条，按影响排序：

| # | 指纹 | 我们的表现 | 出处 |
| --- | --- | --- | --- |
| 1 | **强调色到处用** | 品牌绿同时承担：eyebrow 小标题、导航选中态、图标底、徽章、按钮、图表线、卡片辉光、背景色相（`#0b100e` 本身就偏绿）。整站像「主题色皮肤」，没有留白呼吸 | Linear / Vercel 的共识是「一种颜色只做一件事」 |
| 2 | **同一个页头模板** | 每页都是「绿色 eyebrow → 大标题 → 灰色一句话 → 分割线 → 卡片」，8 页无一例外。人做的产品每页头部服务于该页任务，不会统一套模板 | dev.to 所列「可预测的纵向堆叠」 |
| 3 | **icon-in-rounded-square** | 模拟面试表单、复盘卡、复盘路径的三步图示、指标条，全是「圆角方块 + 绿色 lucide 图标」 | avoid-ai-design 列为 component tell |
| 4 | **万物皆卡片** | 筛选器是卡片、表格是卡片、指标是卡片套卡片（stat-hero 里再套三张小卡）。层次靠「框」而非靠字号/间距/对齐 | 「rounded-xl + border + shadow 反射式使用」 |
| 5 | **营销页元素混进产品** | 面试复盘页中间的「复盘路径 1-2-3」三步图示、stat-hero 的径向辉光，是 landing page 的手法，出现在日用工具里显得装饰 | Studio Maydit：「去掉纯装饰元素」 |
| 6 | **Inter + 默认数字** | `Inter, ..., Microsoft YaHei`，数字没有 tabular-nums，大数字只是把字号放大 | 「Inter for everything」 |
| 7 | **均匀错峰入场** | `.page-content > *` 全部 fade-in-up 错峰，每页每次导航都播一遍，是复制粘贴式 `fade-in-up` | avoid-ai-design motion tell |
| 8 | **表格行操作全铺开** | 投递表每行 4 个按钮 + 删除图标，一屏 30 个按钮；筛选块要点「应用筛选」 | 密度失控、交互过时 |
| 9 | **产品名 + 副标题 + 首字母 logo 块** | 「OL / OfferLai / Career Workspace」三件套，以及顶栏重复的「Career Workspace ‣ 页名」面包屑 | 模板化 sidebar |

已经做对、要保留的：语义化 token 与完整暗色主题；`button / card / badge / skeleton / empty-state` 组件抽象；a11y（focus ring、skip link、reduced-motion）；`ease-app` 自定义缓动；能力画像画布的点阵底纹（这是全站最有辨识度的一处，应该反过来成为视觉母题）。

---

## 二、目标风格：「编辑器 / 工具感」

调研的高级感样本几乎收敛到同一套语言，即 Linear、Vercel、Raycast、Attio、Mercury 这一支（[Studio Maydit](https://studiomaydit.com/blog/linear-vercel-raycast-aesthetic)、[Pixeldarts 四原则](https://www.pixeldarts.com/en/post/four-design-principles-behind-stripe-linear-and-vercel)、[925studios 35 例](https://www.925studios.co/blog/saas-dashboard-design-examples-2026)）。核心四条：

1. **近乎单色的底 + 唯一强调色**：黑白灰承担 95% 的界面，强调色只出现在主 CTA、焦点态、当前项指示和「需要你看」的数据点。
2. **发丝线代替阴影**：1px（或 0.5px）低透明度边线分隔表面，暗色下加 1px inset 顶部高光让面板有「压」进去的触感；投影只留给浮层。
3. **锐利、偏冷的字体 + 严格的字号阶梯**：Geist / Inter 这一类几何无衬线，标题负字距，数字用等宽或 tabular 数字。
4. **留白翻倍、每个区块只讲一件事**：「觉得够了的间距再乘二」；仪表盘先给一个北极星数字，其余渐进披露。

2026 的趋势文章（[Fireart](https://fireart.studio/blog/the-best-web-design-trends/)、[MockFlow](https://mockflow.com/blog/saas-website-design-trends)）补充了两点对我们有用的：极简不再是「空 + 居中一段字」，而是靠更强的层次和微交互「用更少做更多」；暗色底配 CSS 颗粒/点阵纹理取代 3D 和大渐变来制造深度。我们已有的点阵底纹正好对上。

**不采用**的方向：Tactile Brutalism（0 圆角 + 荧光描边），与求职工具的气质不符；kinetic typography / 滚动驱动字重，日用工具里是干扰。

---

## 三、设计 token 规范（可直接落到 `globals.css`）

### 3.1 颜色：去掉绿色相底，改中性灰底 + 单一绿强调

现状问题是背景、表面、边框全部带绿色相，强调色失去对比。改为中性底：

```
暗色（默认）
--background       #0c0c0d      页面底
--surface          #131315      面板
--surface-raised   #19191c      悬浮/hover 面板
--surface-sunken   #09090a      输入框、代码块、画布
--border           rgb(255 255 255 / 0.08)
--border-strong    rgb(255 255 255 / 0.14)
--foreground       #ededef
--muted-foreground #8a8a91
--brand            #2fbf8a      唯一强调色，只用于主 CTA / 焦点 / 当前项 / 正向数据点
--brand-foreground #062015

浅色
--background       #fafafa
--surface          #ffffff
--surface-raised   #ffffff
--surface-sunken   #f4f4f5
--border           rgb(0 0 0 / 0.08)
--border-strong    rgb(0 0 0 / 0.14)
--foreground       #18181b
--muted-foreground #71717a
--brand            #1a7f5f
```

语义色（success / warning / danger / info）保留，但**徽章默认改为「灰底 + 彩色圆点 + 文字」**，只有阶段推进（Offer、已通过）才用实心色块。现在一列 5 种彩色药丸是表格显「花」的主因。

暗色高光规则：面板 `box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.05)`；浮层 `0 16px 40px -12px rgb(0 0 0 / 0.6)`；卡片不再有外投影；`--app-glow-brand` 删除。

### 3.2 字体：拉丁 / 数字换 Geist，中文走系统栈

中文字体网络加载不现实（全量 3-10MB，[字体子集化指南](https://font-converters.com/guides/font-subsetting-by-language)），Next 的 `next/font/google` 也没有 CJK 子集（[vercel/next.js#86336](https://github.com/vercel/next.js/discussions/86336)）。可行且效果最大的做法：

- **Geist Sans**（`next/font/google`）承担全部拉丁字母与数字；**Geist Mono** 承担时间戳、来源标识、计数、ID 等元数据。Geist 的 Google 子集保留了 `tnum`（[Geist Mono](https://fonts.google.com/specimen/Geist+Mono)），仪表盘数字对齐无需自托管。
- 中文回退到 `"PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei"`；Windows 用户若装了 HarmonyOS Sans / MiSans 会自动更好看，未装也不坏。
- 第二阶段可选：自托管 MiSans 仅两档字重（Regular / Semibold）并按 unicode-range 分块，先只给标题用。

字号阶梯（去掉 `text-display` 这种单点定义，改为 7 级）：

| 级别 | 字号 / 行高 | 用途 |
| --- | --- | --- |
| xs | 11 / 16 | 表格辅助信息、元数据（Mono） |
| sm | 12.5 / 18 | 表头、标签、导航分组 |
| base | 14 / 22 | 正文、导航项、表格主文本（中文行高 1.6） |
| md | 16 / 24 | 卡片标题、表单区块标题 |
| lg | 20 / 28 | 页面标题（不再是 30+ 的大标题） |
| xl | 28 / 34 | 报告总分、区块级数字 |
| display | 44 / 48，weight 500，`tabular-nums` | 仪表盘北极星数字，Geist Mono 或 Geist Sans `tnum` |

字距：拉丁标题 `-0.02em`；**中文不要负字距**（CJK 挤在一起明显发黑），标题若中英混排只对数字/英文段落用 `font-feature-settings: "tnum"`。

### 3.3 圆角与密度

- 一套圆角策略：控件 6px，面板 10px，浮层 12px。移除 `rounded-2xl`（目前 2 处）和 `rounded-xl` 卡片默认值。
- 控件高度：按钮 / 输入框 32px（现 40px），表格行 44px，导航项 32px。参照 [dashboard patterns 2026](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/)：侧栏 240 / 收起 56，导航项 32-36px。
- 间距阶梯只用 4 / 8 / 12 / 16 / 24 / 40 / 64；区块之间 40，区块内元素 12，同组元素 8。目前是 `gap-6` 一把梭。

### 3.4 动效（按 Emil Kowalski 的标准）

来源：[review-animations/STANDARDS.md](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md)。全部数值可直接替换现有 keyframes：

| 场景 | 时长 | 缓动 |
| --- | --- | --- |
| 按钮按压 | 120ms | `transform: scale(0.97)`，ease-out |
| Tooltip / 小 popover | 150ms | `cubic-bezier(0.23, 1, 0.32, 1)` |
| 下拉 / 选择 | 200ms | 同上，`transform-origin` 指向触发点，从 `scale(0.96)` 起 |
| 弹窗 | 220ms | 同上，`transform-origin: center`，从 `scale(0.97) + opacity 0` 起 |
| 抽屉 | 320ms | `cubic-bezier(0.32, 0.72, 0, 1)`（iOS 感） |
| 屏内位移（tab 指示条、列表重排） | 200ms | `cubic-bezier(0.77, 0, 0.175, 1)` |
| 页面切换 | 150ms 仅 opacity | 或用 View Transitions（见 §五） |

规则：
- 只动 `transform` 和 `opacity`；**永远不用 ease-in**。
- 日用高频动作（键盘导航、表格 hover、命令面板）**不加动画**或降到 100ms 以内；hover 效果用 `@media (hover: hover) and (pointer: fine)` 门控。
- 错峰只用于「首次揭示一组新内容」（如报告生成完成），30-80ms 间隔，且不阻塞交互；**移除 `.page-content > *` 的全站错峰**。
- 用 CSS transition 而非 keyframes 做可打断的状态切换（`@starting-style` 可做纯 CSS 进入）。
- `prefers-reduced-motion` 下保留 opacity / 颜色变化，只去掉位移。现有的「全部 0.01ms」写法过于粗暴，改成只中和 transform。

---

## 四、逐页排版建议（参考同类产品怎么排）

### 4.1 壳层（sidebar + header）

- 侧栏 240px，去掉「OL」方块和「Career Workspace」副标题，只留一个小字号 wordmark；底部放主题切换和设置，**顶栏整个去掉**（面包屑和页名重复，主题按钮挪到侧栏）。内容区从顶部 40px 开始。
- 导航项 32px 高、13px 字、无图标底色；当前项用左侧 2px 强调色竖条 + 文字变亮，不再整块填色。分组标签 11px、字距 0.06em、不全大写（中文无大写，现在的 `uppercase tracking-[0.12em]` 只对英文有效）。
- 内容区左对齐、最大宽 1120px，不再 `mx-auto` 居中；居中是营销页的习惯。
- 可选加分项：`Cmd/Ctrl + K` 命令面板（跳页、新建投递、开始模拟）。这是 Linear / Raycast 高级感的核心来源之一，也贴合「少操作」北极星，但属于新功能，放最后。

### 4.2 数据概览（参照 Mercury / Stripe / Plausible）

金融类仪表盘的共识是「先给一个可信的数字，再回答下一步」（925studios）。Plausible 整页六个指标 + 一张时序图，不分 tab。

- 顶部：北极星数字「16 投递进行中」用 display 级 Geist Mono，右侧一行文字说明变化（「近 7 天 +6」用 Mono 小字，不用绿色药丸）。去掉 stat-hero 的辉光和卡中卡。
- 指标条：「7 天新增 / 真实面试 / Offer」改为**无边框的水平指标条**，指标之间用 1px 竖发丝线分隔，数字 28px tabular。这是 Stripe 的排法。
- 图表区 7 : 5 分栏：趋势图（左）+ 阶段分布（右）。Recharts 去掉网格线、去掉圆点标记、线宽 1.5、tooltip 用 `surface-raised` + 发丝线；面积填充用强调色 8% 透明度。区间切换（14 天 / 1 月 …）改为文字 tab + 下划线指示条。
- 「下一步行动」保留，改为列表行（左图标 + 文字 + 右侧时间 Mono），不做卡片网格。

### 4.3 投递岗位（参照 Teal 的表格 + Huntr 的详情抽屉）

Teal 选表格（数据密度）、Huntr 选看板（直观）（[Huntr vs Teal](https://huntr.co/blog/huntr-vs-teal)）。我们的记录量小、字段多，**保留表格**，但借 Huntr 的「点开卡片看详情」：

- 筛选：搜索框 + 状态分段控件（segmented control）+ 来源下拉，**输入即筛选**，删掉「应用筛选」按钮和整块筛选卡片；筛选条直接坐在表格上方，与表格共享左对齐。
- 表格：去掉外卡片，表头 12.5px 灰字，行 44px，行 hover 才显示操作图标（编辑 / 删除），「记录面试 / 模拟面试」收进行尾的 `…` 菜单或详情抽屉。
- 点击行从右侧滑出**详情抽屉**（480px，`ease-drawer` 320ms），里面放 JD、备注、关联面试和「开始模拟」主按钮。抽屉是 Linear / Attio 处理「列表 → 详情」的标准手法，比跳页轻。
- 阶段列：灰底圆点徽章，Offer 才用实心绿。时间列全部 Mono。
- 可选：表格上方一行「漏斗条」（已投递 → 面试中 → Offer 的三段计数），一行文字即可，不做图表。

### 4.4 历史面试 / 面试复盘

- 历史面试同 4.3 的表格规范；「AI 模拟」标记用 Mono 小标签而非绿色药丸。
- 面试复盘：**删掉「复盘路径 1-2-3」图示**（营销元素）；「实习/项目」「通用问题库」两张入口卡改为两行可点的列表项，右侧计数 Mono；「已沉淀复盘记录 7」并入页面顶部作为该页的北极星数字。来源筛选保留为分段控件。

### 4.5 AI 模拟面试：设置页 + 房间 + 报告

**设置页**（参照 Linear 设置页的「左标签右字段」）：
- 单列、最大宽 720px；每个区块左侧是 13px 标签 + 一句说明，右侧是字段，不用带图标的卡片头。
- 「面试设置」摘要行保留，做成一行 Mono 摘要 + 「调整」文字按钮。
- 「最近的模拟面试」改为列表行。

**房间**（沉浸模式，参照 chat 类产品）：
- 顶部 2px 进度条（当前题 / 总题）替代文字计数；题干区左侧竖线强调色做「当前题」标识，替代现在的跑马虚线（`interview-current-x/y`，视觉噪音大）。
- 追问以缩进 + 圆点呈现（已做），进入用 150ms opacity + 4px 上移，不做 clip-path 展开。
- 作答框吸底，提交后按钮进入 pending 态（文字变「评估中…」+ 极简 spinner），不弹 toast。

**报告**（参照 Yoodli：量化指标 + 转录高亮）：
- 顶部一行：总分（display 级）+ 三到四个维度分（28px），维度分用同一色相的单色深浅表示强弱，不用红黄绿。
- 下方两栏：左侧逐题回答与「证据高亮」（在原文上标出被评分引用的句子，Yoodli 高亮填充词的做法），右侧该题评分与建议。雷达图可留在能力画像，报告页不重复。

### 4.6 能力画像

现有点阵画布是全站最有辨识度的元素，保留。把点阵底纹**提升为全站空状态和沉浸模式的背景母题**（浅到 6% 透明度），让各页有统一的「出身」。

### 4.7 空态 / 加载 / 错误

[dashboard patterns](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/) 的第四条：每个组件三态都要设计。我们：
- 空态：一句话 + 一个主按钮，**不用插画、不用图标方块**。
- 加载：骨架与真实布局同形（已有 `skeleton.tsx`），闪光 1.6s linear。
- 错误：组件级内联提示 + 重试，不整页阻断。

---

## 五、技术落地要点

- **View Transitions**：本地 `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md` 确认本版本支持在 `next.config.ts` 设 `viewTransition: true`，配合 React 的 `<ViewTransition>` 做页面切换与列表重排。开启后可以删掉 `.page-content` 的 keyframes。Chromium 125+ / 新版 Safari、Firefox 支持，不支持时自动退化为硬切，正好符合「动画不是功能」的原则。
- **字体**：`next/font/google` 引入 Geist + Geist Mono，挂到 `--font-sans / --font-mono` 再进 `@theme inline`；中文栈写在 fallback。
- **Tailwind v4**：新增 `--radius-control / --radius-panel / --radius-overlay`、`--duration-*`、`--ease-out-strong / --ease-in-out-strong / --ease-drawer` 到 `@theme`，然后禁止组件里写裸的 `duration-200` / `rounded-xl`。可加一条 ESLint（dev.to 建议）拦截 `rounded-2xl`、`shadow-lg`、`bg-gradient-to-*`、`from-purple-*`。
- **图标**：lucide 保留，但统一 `size-4`、`stroke-width 1.5`、无底色；避免 `Sparkles`（8 处）作为「AI」的唯一标识，改用文字标签「AI」Mono 小字。
- **图表**：recharts 保留，只改主题（见 4.2），不换库。
- **不引入**：组件库（shadcn 也不必，现有 `ui/*` 够用）、动画库（CSS + View Transitions 覆盖 95% 场景；若后续要做列表重排的 layout 动画再评估 `motion`）。

---

## 六、给这个项目的「去 AI 味」检查表

改完每页用这张表过一遍：

- [ ] 这页有没有「eyebrow → 大标题 → 副标题 → 分割线」模板？页面标题是否 20px 而非 30px+？
- [ ] 强调色出现次数 ≤ 3（主按钮、当前项、一个数据点）。
- [ ] 没有圆角方块包着的图标。
- [ ] 没有为了「分区」而存在的卡片；能用发丝线 + 间距分开的就不要框。
- [ ] 所有数字是 tabular / Mono，时间戳是 Mono。
- [ ] 表格行 hover 前只有 0-1 个可见操作。
- [ ] 没有全局错峰入场；只有用户触发的变化才动。
- [ ] 徽章默认灰底圆点。
- [ ] 文案没有「一站式 / 全方位 / 赋能」；每句说具体动作和数字。
- [ ] 明暗两套都走查过，暗色面板有 inset 顶部高光而不是外投影。

---

## 七、建议的执行顺序（待确认后再动手）

1. **Token 与字体**（`globals.css`、`layout.tsx`、`button / card / badge`）：中性底、Geist、圆角、动效 token、删除全站错峰与辉光。改动集中、全站受益，可先做出对比截图定调。
2. **壳层**：去顶栏、侧栏瘦身、内容区左对齐、开启 View Transitions。
3. **表格类页面**（投递、历史面试）：去卡片、即时筛选、hover 操作、详情抽屉。
4. **数据概览 + 面试复盘**：北极星数字、指标条、图表主题、删营销图示。
5. **模拟面试设置 / 房间 / 报告**：设置页表单布局、房间进度条与当前题标识、报告页评分与证据高亮。
6. 可选：命令面板、MiSans 标题字体。

每步产出明暗两套截图对比后再进入下一步。

---

## 来源

- [The Linear, Vercel, and Raycast Aesthetic — Studio Maydit](https://studiomaydit.com/blog/linear-vercel-raycast-aesthetic)
- [Four design principles behind Stripe, Linear, and Vercel — Pixeldarts](https://www.pixeldarts.com/en/post/four-design-principles-behind-stripe-linear-and-vercel)
- [avoid-ai-design（AI 前端指纹清单）](https://github.com/funboy322/avoid-ai-design)
- [How to fix the 'AI-generated' look in your frontend — DEV](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh)
- [Emil Kowalski review-animations STANDARDS.md](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md)
- [35 SaaS Dashboard Design Examples 2026 — 925studios](https://www.925studios.co/blog/saas-dashboard-design-examples-2026)
- [Best Dashboard Design Patterns 2026 — artofstyleframe](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/)
- [Web Design Trends 2026 — Fireart](https://fireart.studio/blog/the-best-web-design-trends/)
- [Top SaaS Website Design Trends 2026 — MockFlow](https://mockflow.com/blog/saas-website-design-trends)
- [Huntr vs Teal](https://huntr.co/blog/huntr-vs-teal)、[Teal vs Huntr — cloudcolleague](https://cloudcolleague.com/blogs/job-hunting/teal-vs-huntr/)
- [Yoodli review（报告可视化）— Articuler](https://www.articuler.ai/resources/compare/yoodli-ai-interview-coach/)
- [Geist Mono — Google Fonts](https://fonts.google.com/specimen/Geist+Mono)、[Geist — Vercel](https://vercel.com/font)
- [Font subsetting by language](https://font-converters.com/guides/font-subsetting-by-language)、[next/font CJK 子集讨论](https://github.com/vercel/next.js/discussions/86336)
- [Next.js 16 View Transitions 指南](https://nextjs.org/docs/app/guides/view-transitions)（本地 `node_modules/next/dist/docs` 已核对）
- [HarmonyOS Sans](https://www.thosefree.com/harmonyos-sans)、[无衬线中文字体推荐 — FontHubs](https://www.fonthubs.com/guide/best-sans-serif-chinese-fonts)
