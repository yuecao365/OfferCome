---
name: frontend-react
description: React 栈特有出题：渲染与调和、Hooks 心智模型、状态与数据获取、性能优化、Next.js/SSR、测试。岗位或简历出现 React/Next.js 时加载；通用题在 parent 包 frontend 里。
keywords: [react, react.js, next.js, nextjs, hooks, redux, zustand, react query, tanstack, rsc, server components, jsx, react开发, 前端react]
layer: stack
parent: frontend
---

## 岗位职责与考察重点

React 方向前端的日常是用组件与 Hooks 组织业务界面、管理服务器数据与本地状态、控制重渲染、在 Next.js 或自建 SSR 上做首屏与 SEO、写测试保证重构安全。真实面试里 React 题的分水岭非常清晰：背过文档的人能说出 useEffect 的依赖数组规则，但说不出为什么自己的页面会闪烁两次、为什么列表一滚动就掉帧、为什么 Server Component 里不能用 useState。面试官最在意三件事：一是对 React 渲染模型的真实理解（什么触发渲染、渲染与提交的区别、为什么 state 是快照），二是有没有排查过真实的性能与状态问题（重渲染归因、竞态、缓存失效），三是对 React 生态的选型判断（数据获取库、状态库、Next.js 的 App Router 与 Pages Router、RSC 的边界）。

校招侧重 Hooks 规则、虚拟 DOM 与 diff、受控组件、常见 Hook 的手写与闭包陷阱；社招侧重 Concurrent 特性的实际用法、RSC 与 Server Actions 的架构影响、大型应用的状态分层、性能归因工具链、测试策略与迁移经验。一线大厂与外企现在常给一段有问题的组件代码让候选人现场找 bug 与优化，或者给一个页面需求让候选人口述组件划分与数据流。

## 主题

### 渲染模型与调和（Reconciliation）
- 阶梯：什么会触发组件重新渲染、父组件渲染子组件一定渲染吗 → Fiber 架构的可中断渲染、render 阶段与 commit 阶段的区别、diff 的三条启发式规则与 key 的作用 → 列表里用 index 当 key 出现输入框内容错位怎么解释，一个组件"明明 props 没变"却总是重渲染怎么归因 → 提升组件、children 传递、拆分订阅粒度各自的代价与可读性影响
- 好题：一个表单列表用 index 做 key，删除中间一项后下面的输入框内容"跑到了上一行"，请解释 React 在这一步做了什么；如果数据没有稳定 id，你会怎么办？
- 危险信号：认为"虚拟 DOM 比直接操作 DOM 快"；说 key 只是为了消除 warning；不知道渲染不等于 DOM 更新
- 期望信号：能说出 render 是纯计算、commit 才改 DOM；理解 key 变化会卸载重建；知道 React.memo 只做浅比较、props 里传新对象或函数会让它失效

### Hooks 心智模型与闭包陷阱
- 阶梯：为什么 Hooks 不能写在条件语句里 → Hooks 靠调用顺序存在 Fiber 链表上、state 是每次渲染的快照、useEffect 与 useLayoutEffect 的时机 → 定时器或事件回调里读到"旧的 state"怎么分析（闭包捕获的是那次渲染的值），useEffect 依赖数组漏了什么会出什么现象 → useRef 存最新值、函数式更新、useEvent 类模式的取舍，什么时候该抽自定义 Hook、什么时候会造成隐式耦合
- 好题：一个组件里 setInterval 每秒 `setCount(count + 1)`，结果永远停在 1，请解释原因并给出两种修法及各自适用场景；如果把 count 放进依赖数组会怎样？
- 危险信号：把 useEffect 当生命周期一一对应；依赖数组靠 lint 提示乱加乱删；说不出 useMemo 与 useCallback 到底缓存了什么
- 期望信号：能画出"每次渲染是一次独立函数调用"的模型；知道 StrictMode 下 effect 双调用的用意；理解 useLayoutEffect 阻塞绘制的代价；自定义 Hook 有清晰的输入输出而不是隐式共享

### 状态分层与数据流设计
- 阶梯：state 该放哪个组件、什么时候提升 → Context 的重渲染范围与拆分策略，外部 store（Zustand/Redux Toolkit/Jotai）的订阅粒度 → 一个大表单页面每敲一个字整页重渲染怎么定位（Context 值变化、单一巨型 state、未拆分订阅）→ 全局状态、URL 状态、服务器缓存、组件本地状态的划分原则，过度全局化与 prop drilling 各自的维护代价
- 好题：一个后台系统把用户信息、主题、当前筛选条件都放在同一个 Context 里，筛选条件一变整个应用重渲染，你会怎么重构？拆 Context、换 Zustand、用 useSyncExternalStore 三种方案各自解决什么、代价是什么？
- 危险信号：所有状态都进 Redux；不知道 Context 值是新对象就会触发所有消费者渲染；分不清服务器状态与客户端状态
- 期望信号：区分 server state 与 client state；知道 selector 式订阅；能说出 useSyncExternalStore 解决的撕裂问题；对 URL 作为状态源有实践

### 服务器数据获取与缓存
- 阶梯：为什么不在 useEffect 里直接 fetch → TanStack Query/SWR 的 stale-while-revalidate 模型、缓存键设计、失效与重取 → 快速切换 tab 后显示了上一个 tab 的数据（竞态）怎么解释与修，乐观更新回滚怎么做 → 缓存时间、预取、分页/无限滚动的缓存结构、与 RSC 数据获取的分工
- 好题：搜索框输入时每次变化都发请求，快速输入后结果显示的是较早那次的返回，请解释原因并给出不用第三方库的修法；用 TanStack Query 后这个问题为什么自然消失？
- 危险信号：说不出竞态怎么产生；把缓存键写成不稳定的对象；乐观更新不做回滚
- 期望信号：AbortController 或 ignore 标记；理解 queryKey 与依赖的对应；知道 staleTime 与 gcTime 的区别；能说出 mutation 后精确失效相关 query

### 性能优化与重渲染归因
- 阶梯：React.memo/useMemo/useCallback 分别干什么 → 为什么滥用 memo 反而变慢，React DevTools Profiler 的火焰图与 commit 列表怎么读，React Compiler 自动 memo 的边界 → 一个万行表格滚动掉帧怎么排查：是渲染次数多、单次渲染重、还是 DOM 节点多，虚拟列表的适用条件 → 用 memo 换可读性、用虚拟列表换可访问性与搜索、用 Concurrent 特性换复杂度的取舍
- 好题：Profiler 显示一个列表每次父组件更新都整体重渲染，你按什么顺序找原因？发现是传给每行的 onClick 每次都是新函数，你会 useCallback 还是把回调下沉，为什么？什么情况下你会决定不优化？
- 危险信号：所有组件都包 memo；不会用 Profiler；把 useMemo 当性能万能药；不知道 React Compiler 的存在及其前提
- 期望信号：先测量再优化；能区分渲染开销与提交开销；有虚拟列表的实践与其缺点（高度不定、锚定滚动）；知道 useTransition/useDeferredValue 解决的是优先级而不是计算量

### Concurrent 特性与 Suspense
- 阶梯：useTransition 和 setTimeout 有什么区别 → 并发渲染的可中断与优先级、Suspense 的边界与 fallback、错误边界的配合 → 用了 useDeferredValue 后输入还是卡怎么分析（计算本身太重、没有可中断点）→ Suspense 用于数据获取的现状与限制，流式 SSR 与 Suspense 的关系，何时值得引入
- 好题：一个搜索页用 useDeferredValue 包了列表渲染，但用户输入依然明显卡顿，可能是什么原因？哪些情况并发渲染帮不上忙？
- 危险信号：把 useTransition 当防抖；不知道 Suspense 在客户端数据获取上的限制；从没在项目里用过并说不出为什么
- 期望信号：理解"可中断"需要渲染被切成多个单元；知道 startTransition 里的更新会被打断与合并；能说出流式 SSR 里 Suspense 边界决定了 HTML 分块

### Next.js 与服务端渲染
- 阶梯：CSR/SSR/SSG/ISR 各解决什么、hydration 是什么 → App Router 的 Server Components 与 Client Components 边界、Server Actions、路由段缓存与 fetch 缓存 → hydration mismatch 报错怎么查（时间、随机数、localStorage、浏览器扩展），页面 TTFB 高怎么归因（数据获取串行、无缓存、冷启动）→ RSC 带来的架构收益与心智负担，Pages Router 迁 App Router 的风险，Vercel 与自部署的差异
- 好题：一个 Next.js App Router 页面控制台报 hydration mismatch 且只在部分用户机器上出现，你会怀疑哪些原因？怎么定位？哪些情况你会选择 suppressHydrationWarning 而不是修？
- 危险信号：认为 SSR 等于 SEO 万能；分不清 Server Component 与 SSR；不知道 "use client" 边界之下依然会被 SSR；把 Server Action 当普通 API 用而不考虑安全与幂等
- 期望信号：能说出 RSC 不下发 JS 的收益与 props 序列化限制；知道 Next.js 的多层缓存与失效方式；有 SSR 性能归因经验；对 Server Action 的鉴权与 CSRF 有意识

### 组件设计与复用模式
- 阶梯：受控与非受控组件的区别 → 复合组件、render props、Hooks 抽逻辑、forwardRef 与命令式句柄 → 一个"万能组件"props 已有 40 个怎么重构，组件库如何做到既可定制又不失控 → 组件 API 稳定性、无头组件（headless）与样式绑定的取舍
- 好题：设计一个 Select 组件，要求支持自定义选项渲染、异步搜索、多选与键盘操作，你会怎么设计 API？为什么很多人做成一堆 props 后来维护不下去？
- 危险信号：所有配置都用布尔 props 堆；不知道 children 也可以当函数用；组件内部偷偷 fetch 数据导致不可测试
- 期望信号：复合组件 + Context 共享状态；区分展示与容器职责；提到 headless 库（Radix、React Aria）的思路；对 ref 转发与焦点管理有实践

### 表单与复杂交互
- 阶梯：受控输入为什么每次都 setState → react-hook-form 为什么用非受控减少渲染，校验时机与错误展示 → 一个几十字段的表单输入卡顿怎么定位，联动字段与异步校验的竞态怎么处理 → 表单库的选择、schema 校验（zod）与后端校验的一致性、Server Action 与表单的结合
- 好题：一个有 60 个字段、多处联动的动态表单输入卡顿，你会怎么诊断？换 react-hook-form 能解决什么、解决不了什么？
- 危险信号：把整个表单值放在一个 useState 对象里并每次全量校验；不知道非受控的意义
- 期望信号：字段级订阅；校验 schema 前后端复用；异步校验去抖与取消；提交状态与错误恢复有设计

### 测试策略
- 阶梯：单测该测什么、快照测试的问题 → React Testing Library 的"按用户行为测"哲学、mock 网络（MSW）、异步断言 → 测试在 CI 上随机失败怎么查（未 await、定时器、共享状态、act 警告）→ 单测、组件测试、E2E 各投多少，Hooks 单测的价值与成本
- 好题：一个组件测试在本地稳定通过、CI 上 5% 概率失败，你按什么顺序排查？你怎么决定一个组件该写 RTL 测试还是 Playwright E2E？
- 危险信号：只有快照测试；测实现细节（state 值、内部方法）；不会处理异步与定时器
- 期望信号：findBy/waitFor 的正确使用；MSW 拦截而不是 mock fetch；对 flaky 测试有具体根因经验；测试金字塔有自己的比例判断

### 错误处理与健壮性
- 阶梯：错误边界能捕获什么、不能捕获什么 → 事件回调与异步错误的处理、全局兜底与上报 → 一个页面偶发整页白屏但监控没抓到堆栈怎么查（压缩堆栈、错误被吞、错误边界粒度过大）→ 错误边界粒度与降级 UI 的设计，重试与刷新策略
- 好题：线上偶发整页白屏，监控只收到 "Minified React error #31"，你怎么还原并定位？错误边界应该放在哪几层？
- 危险信号：只在根组件放一个错误边界；不知道错误边界不捕获事件处理与异步错误；不知道生产错误码怎么解码
- 期望信号：分区错误边界与局部降级；source map 与错误码还原；对 Suspense 与错误边界的配合有认识

## 好题 / 坏题对比

- 坏：说说 useEffect 的依赖数组规则。
- 好：组件里 setInterval 每秒 `setCount(count + 1)`，页面停在 1 不动，请解释 React 在这里的执行模型；给出函数式更新与 ref 两种修法，并说明什么场景下你会选哪种、把 count 加进依赖会带来什么新问题。

- 坏：React.memo、useMemo、useCallback 有什么区别？
- 好：Profiler 显示列表每次父组件更新都整体重渲染，你按什么顺序定位？如果原因是每行拿到的回调都是新函数，你会 useCallback 还是把回调下沉到行组件？什么情况下你会决定不做优化？

- 坏：什么是 SSR？Next.js 有哪些渲染模式？
- 好：Next.js App Router 页面报 hydration mismatch 且只出现在部分用户机器上，可能的原因有哪些、怎么定位？Server Component 与 Client Component 的边界你会怎么划，哪些数据不能跨边界传？

## 项目结合钩子

- 简历出现"性能优化 / 减少重渲染" → 追用什么工具测的、优化前后渲染次数或 INP 数字、最大的一处根因是什么、有没有过度 memo 后来回退的
- 简历出现 Redux / Zustand / MobX / Jotai → 追为什么选它而不是 Context 或另一个库、订阅粒度怎么控、服务器数据是不是也塞进去了、迁移过吗
- 简历出现 TanStack Query / SWR → 追缓存键怎么设计、失效策略、乐观更新有没有回滚、分页与无限滚动的缓存结构
- 简历出现 Next.js → 追用的 Pages 还是 App Router、Server Component 边界怎么划、缓存层踩过什么坑、TTFB 与 LCP 数字、部署在哪
- 简历出现自定义 Hooks 库 → 追最复杂的一个 Hook 解决什么问题、怎么测试、依赖数组怎么处理、有没有造成隐式耦合
- 简历出现组件库 / 设计系统 → 追 API 设计原则、受控与非受控的支持、可访问性、按需加载、破坏性升级怎么管
- 简历出现 Class 组件迁移 Hooks / 大版本升级 → 追迁移策略、最难的生命周期对应、StrictMode 双调用暴露了什么问题
- 简历出现测试覆盖率 → 追测的是什么层、flaky 率、mock 策略、覆盖率数字有没有意义

## 出题原则

- 先问现象再问原理：从"页面闪烁两次""输入框内容错位""旧 state"这类真实 bug 切入，能背文档但没写过的人在这里会露馅。
- 每个优化手段都追"怎么测的、数字多少、什么时候不该用"，尤其是 memo 类优化，追问"你有没有因为过度优化回退过"。
- Next.js 与 RSC 题结合候选人实际用的路由模式与部署方式出，没用过 App Router 的不强考 RSC 细节，但要考 SSR 与 hydration 的通用理解。
- 不考 API 时效：不问"React 19 新增了哪些 Hook"这类记忆题，考的是渲染模型、状态设计与工程判断；浏览器与构建通用题交给 parent 包 frontend。
