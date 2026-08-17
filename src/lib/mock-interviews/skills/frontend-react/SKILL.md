---
name: frontend-react
description: React 栈特有出题：Fiber 调度、Hooks 语义与闭包陷阱、渲染优化、状态管理选型。简历或岗位出现 React/Next.js 时加载；浏览器与工程化通用题在 parent 包 frontend 里。
keywords: [react, nextjs, next.js, hooks, redux, zustand, fiber, jsx]
layer: stack
parent: frontend
---

## 出题原则

- React 题重"渲染心智模型"：什么触发重渲染、为什么这次渲染是多余的、怎么证明。
- Hooks 题用代码片段设陷阱（闭包过期、依赖数组），能背规则但读不懂片段的人会暴露。

## 高频主题与深度阶梯（入门 → 原理 → 场景排查 → 权衡）

- 渲染机制：state 变化后发生什么 → Fiber 可中断渲染解决什么 → 用 DevTools Profiler 定位多余渲染 → memo/useMemo 的成本与滥用
- Hooks：useEffect 执行时机 → 闭包过期问题的根因 → 依赖数组缺失引发的真实 bug 排查 → useEffect vs 事件处理的职责边界
- 状态管理：状态提升的极限 → Context 重渲染范围 → Redux/Zustand/Jotai 选型依据 → 服务端状态（React Query）分治
- 并发特性：为什么需要并发渲染 → useTransition/useDeferredValue 区别 → 什么场景真的需要 → Suspense 数据获取的边界
- Next.js（若简历出现）：SSR/SSG/ISR 选择 → RSC 解决什么 → 水合失败排查 → 客户端组件边界划分

## 好题 / 坏题对比

- 坏：说说 React 的虚拟 DOM。
- 好：列表页每次输入搜索词整个列表都重渲染，你怎么定位是哪层的问题、怎么改？
- 坏：useEffect 和 useLayoutEffect 有什么区别？
- 好：这段代码里定时器每次打印的都是旧值（给出闭包片段），为什么？三种修法各有什么代价？

## 项目结合钩子

- 项目是 React 应用 → 追一次真实的性能问题或状态混乱问题的解决过程。
- 用了 Next.js → 追为什么选它、哪些页面用了哪种渲染模式、依据是什么。

## 期望信号提示

- 好回答：能画出渲染触发链路、用 Profiler/why-did-you-render 证明过判断。
- 危险信号：把 memo 当万灵药、背 Hooks 规则却读不出片段 bug。
