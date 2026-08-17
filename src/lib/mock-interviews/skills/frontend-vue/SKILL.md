---
name: frontend-vue
description: Vue 栈特有出题：响应式原理、编译期优化、组合式 API、生态选型。简历或岗位出现 Vue/Nuxt 时加载；浏览器与工程化通用题在 parent 包 frontend 里。
keywords: [vue, vue3, nuxt, pinia, vuex, composition, 响应式]
layer: stack
parent: frontend
---

## 出题原则

- Vue 题重"响应式边界"：什么会丢响应、为什么，用代码片段考语义而非背 API。
- Vue2/Vue3 差异只问设计动机（为什么换 Proxy），不问版本考古。

## 高频主题与深度阶梯（入门 → 原理 → 场景排查 → 权衡）

- 响应式：ref/reactive 区别 → Proxy 相比 defineProperty 解决什么 → 解构导致响应丢失的排查 → shallowRef 的适用场景
- 编译优化：模板编译成什么 → 静态提升与 patchFlag → v-for 不写 key 的真实后果 → 模板 vs JSX 的取舍
- 组合式 API：为什么引入 → 逻辑复用相较 mixin 的优势 → composable 里的生命周期陷阱 → 何时仍用选项式
- 状态与路由：Pinia 相比 Vuex 改了什么 → 跨页面状态残留排查 → 路由守卫的típ误用 → SSR 下的状态串号问题
- 异步更新：nextTick 存在的原因 → 更新队列去重机制 → 读取更新后 DOM 的正确姿势 → watch vs watchEffect 触发差异

## 好题 / 坏题对比

- 坏：说说 Vue 的双向绑定原理。
- 好：从 reactive 对象里解构出的字段改了视图不更新，为什么？给两种保持响应的写法。
- 坏：Vue3 有哪些新特性？
- 好：一个列表切换排序时子组件状态错位，大概率是什么写错了？key 应该取什么？

## 项目结合钩子

- 项目是 Vue 应用 → 追组件通信方案怎么选的、有没有遇到响应式丢失的坑。
- 用了 Pinia/Vuex → 追哪些状态进 store、哪些留组件内，划分依据。

## 期望信号提示

- 好回答：能说清响应式系统的追踪与触发两个阶段，bug 能归因到机制。
- 危险信号：只会背 API 清单、把一切更新问题归咎于"Vue 的 bug"。
