---
name: frontend-vue
description: Vue 栈特有出题：响应式原理、组合式 API、组件通信、Router/Pinia、性能优化、Nuxt/SSR。岗位或简历出现 Vue/Nuxt/uni-app 时加载；通用题在 parent 包 frontend 里。
keywords: [vue, vue3, vue2, nuxt, pinia, vuex, vue router, composition api, 组合式api, element plus, ant design vue, uni-app, vite, vue开发]
layer: stack
parent: frontend
---

## 岗位职责与考察重点

Vue 方向前端在国内的岗位基数极大：中后台系统、企业应用、H5 活动页、小程序与 uni-app 跨端项目大量使用 Vue，社招简历里 Vue2 老项目维护与 Vue3 迁移经验并存。日常工作是用 SFC 与组合式 API 组织业务、用 Pinia 管状态、用 Vue Router 做权限与路由、在 Element Plus 之类组件库上做二次封装、必要时用 Nuxt 做 SSR。真实面试里 Vue 题最能区分人的地方在响应式：背过"Proxy 代替 defineProperty"的人很多，能解释为什么解构 props 会丢失响应式、为什么 ref 需要 .value、为什么 watch 一个对象没触发的人少得多。面试官最在意三件事：一是对响应式与渲染更新链路的真实理解（依赖收集、调度、批量更新、nextTick），二是组合式 API 的组织能力（composable 怎么划分、状态怎么共享、和 mixins 的差别），三是中后台工程里的实战经验（权限路由、大表格性能、表单与组件库封装、Vue2 迁 Vue3）。

校招侧重响应式原理、生命周期、组件通信方式、v-if/v-show/key 这类基础与手写小实现；社招侧重性能归因（大列表、深层响应式、频繁 watch）、Pinia 设计、路由权限与动态路由、Nuxt 的数据获取与缓存、以及迁移与组件库封装的踩坑经验。一线公司常给一段有问题的 SFC 让候选人现场找 bug（响应式丢失、watch 没触发、内存泄漏），或让候选人口述一个中后台模块的组件划分与状态归属。

## 主题

### 响应式原理与常见丢失场景
- 阶梯：Vue3 为什么用 Proxy、和 Vue2 的 defineProperty 有什么本质差别 → track/trigger 的依赖收集、effect 与 ReactiveEffect、ref 与 reactive 的实现差异、shallowRef/markRaw 的用途 → 解构 props 或 reactive 后视图不更新、把 reactive 对象整个替换后丢失响应、数组索引赋值在 Vue2 里不生效怎么解释与修 → 深层响应式对大数据的性能代价、什么数据应该 markRaw 或 shallowRef，响应式与不可变数据两种思路的取舍
- 好题：一个组件把接口返回的 5000 行数据 `state.list = res.data` 赋给 reactive，之后页面操作明显变慢，你怀疑什么？shallowRef、markRaw、只对可视区域做响应式三种方案各自的代价是什么？
- 危险信号：只会说"Proxy 可以监听新增属性"；说不出 ref 为什么需要 .value；不知道 toRefs 解决什么；认为所有数据都应该 reactive
- 期望信号：能说出依赖收集发生在 getter、触发在 setter 的过程；知道 Proxy 是惰性深层代理；理解 computed 的缓存与脏检查；有对大对象降级为浅响应式的实践

### 渲染更新与调度
- 阶梯：数据变了视图什么时候更新、nextTick 是什么 → 更新是异步批量的、调度队列去重、组件级更新粒度与 patch 过程、编译期优化（PatchFlag、静态提升、Block Tree）→ 修改数据后立刻读 DOM 尺寸拿到旧值怎么解释，一个操作触发了整页组件更新怎么用 DevTools 定位 → 模板编译优化与 JSX/render 函数手写的取舍，什么场景 Vue 的编译期优化会失效
- 好题：一个组件在 methods 里连续修改了三次 state 后调用 `el.offsetHeight` 拿到的是旧高度，请解释 Vue 在这里做了什么；如果把这三次修改改成在 await 之间穿插，行为会变吗？
- 危险信号：认为数据一变 DOM 马上改；说 nextTick 只是"等一下"；不知道 Vue3 模板编译会标记动态节点
- 期望信号：能画出"响应式触发 → 调度队列 → 微任务刷新 → patch"的链路；知道 v-for 里 key 影响 patch 策略；理解 Block Tree 让静态节点被跳过；对手写 render 函数失去编译优化有认识

### 组合式 API 与 composable 设计
- 阶梯：setup 与 Options API 的差别、为什么要组合式 → composable 的输入输出约定、生命周期钩子在 composable 里的行为、ref 与 reactive 在返回值上的选择 → 多个 composable 共享同一份状态时出现"每个组件各自一份"或"卸载后仍在更新"怎么排查 → composable 的粒度与复用边界、和 mixins 的隐式依赖问题对比，什么时候该抽 composable、什么时候该抽 Pinia store
- 好题：你写了一个 `useUserList` 供三个页面用，产品要求三个页面的筛选条件同步，最简单的改法是什么？把状态移到模块顶层和移到 Pinia 各会带来什么问题（SSR、测试、热更新）？
- 危险信号：把 composable 写成什么都往里塞的"上帝函数"；返回 reactive 让调用方解构后丢响应式；不知道模块级状态在 SSR 里会跨请求共享
- 期望信号：composable 返回 ref 或 toRefs 结果；副作用在 onUnmounted 或 onScopeDispose 清理；能说出 effectScope 的用途；对 composable 与 store 的分工有清晰判断

### 组件通信与设计
- 阶梯：props/emit、v-model、provide/inject、插槽各用于什么 → 作用域插槽的原理、v-model 的编译展开与多 v-model、attrs 透传与 inheritAttrs → 深层嵌套组件里 provide 的值改了子组件没更新，或者子组件改了 inject 的值导致数据流混乱怎么定位与规范 → 组件库二次封装时透传 props/slots/事件的方案，泛型组件与 TS 类型推导的成本
- 好题：基于 Element Plus 的 el-table 封装一个业务表格组件，要求外部能用所有原生 props、slots 与事件，同时增加分页与请求逻辑，你会怎么设计？透传时最容易漏掉哪些？
- 危险信号：所有跨层通信都用事件总线或全局 store；不知道 provide 的值默认不是响应式的；封装组件时把 props 一个个手动重写
- 期望信号：provide 传 ref 或 readonly 包装；$attrs 与 useSlots 透传；defineModel 或 modelValue 约定；对 defineProps 泛型与运行时校验的差异有认识

### Vue Router 与权限路由
- 阶梯：hash 与 history 模式、动态路由参数 → 导航守卫的执行顺序、路由懒加载与 chunk、keep-alive 与路由缓存 → 登录后动态添加路由却 404，或刷新后动态路由丢失，beforeEach 里异步拉权限导致死循环怎么排查 → 前端路由权限与后端接口权限的边界，按钮级权限的实现代价，路由表由后端下发还是前端维护的取舍
- 好题：中后台系统登录后要根据角色显示不同菜单与路由，你会怎么实现？刷新页面后为什么很多实现会白屏或跳 404？怎么避免守卫里的重复请求与死循环？
- 危险信号：把权限全放在前端就以为安全；不知道 addRoute 后需要重新导航；keep-alive 缓存导致数据不刷新却不知道 activated
- 期望信号：路由分静态与动态、守卫里用标志位避免重复拉取；知道 404 兜底路由要最后添加；理解 keep-alive 的 include 与组件 name；提到后端校验才是安全边界

### Pinia 与状态管理
- 阶梯：Pinia 和 Vuex 的区别、为什么去掉 mutation → setup store 与 option store、storeToRefs 解决什么、getter 缓存 → 组件里解构 store 后失去响应式、多个 store 循环引用、store 在 SSR 里被跨请求污染怎么排查 → 什么状态该进 store、什么留在组件或 composable，服务器数据要不要进 store，持久化与水合的边界
- 好题：一个电商后台把商品列表、筛选条件、当前编辑的商品都放在同一个 store 里，页面之间互相影响且难以测试，你会怎么拆？服务器返回的列表数据你会放 store 还是放请求缓存层，为什么？
- 危险信号：把 store 当全局变量堆；解构 store 不用 storeToRefs 后说"Pinia 有 bug"；在模块顶层创建 store 实例用于 SSR
- 期望信号：按领域拆 store；区分 UI 状态与服务器数据；知道 $subscribe 与 $patch；对持久化插件的水合时机与安全有认识

### 性能优化与大列表
- 阶梯：v-if 与 v-show、computed 与 method 的区别 → 组件更新粒度、v-once/v-memo、异步组件与 defineAsyncComponent、Vue DevTools 的性能面板 → 万行表格滚动卡顿或输入联动卡顿怎么定位（响应式深度、watch 过多、组件层级过深、频繁 computed），虚拟滚动的适用条件 → 虚拟列表对可访问性与搜索的影响，编译期优化与运行时优化的边界，什么时候该拆组件、什么时候该合并
- 好题：一个可编辑表格 200 列 × 500 行，编辑一个单元格整个表格重渲染，你按什么顺序定位？单元格拆成组件、shallowRef 数据、虚拟滚动三种方案分别解决什么问题、各自代价是什么？
- 危险信号：所有优化只知道"用虚拟列表"；不知道组件是 Vue 的更新边界；没用过 DevTools 的性能录制
- 期望信号：先用 DevTools 或 Performance 录制看更新范围；理解组件拆分即缩小更新粒度；知道 watch 深度监听的成本；有虚拟滚动落地及其缺陷的经验

### watch、watchEffect 与副作用管理
- 阶梯：watch 与 watchEffect 的差别、immediate 与 deep → watch 监听 reactive 默认深层、监听 getter 返回对象需要 deep、flush 时机（pre/post/sync）→ watch 触发了两次或没触发、watch 里发请求产生竞态、组件卸载后 watch 还在跑怎么排查 → 用 watch 同步状态和用 computed 派生状态的取舍，副作用集中管理与可测试性
- 好题：一个组件用 watch 监听筛选条件发请求，快速改变条件后列表显示了较早那次的结果，请解释原因并给出修法；如果改用 computed + 异步能解决吗？
- 危险信号：到处用 watch 同步两份状态；不知道 watch 的清理函数 onCleanup；说不出 flush: 'post' 什么时候需要
- 期望信号：能派生的用 computed 而不是 watch；请求用 onCleanup 取消或标记过期；理解 watchEffect 自动收集依赖的边界；知道 watch 在组件卸载时自动停止而模块级不会

### Nuxt 与服务端渲染
- 阶梯：为什么用 Nuxt、约定式路由与自动导入 → useFetch/useAsyncData 的服务端执行与水合、payload 序列化、服务端与客户端的执行差异 → hydration mismatch（时间、随机数、window 访问）、服务端内存泄漏（模块级状态跨请求）、TTFB 高怎么排查 → SSR、SSG、ISR、CSR 在 Nuxt 里的选择依据，Nitro 部署形态与成本，什么产品不值得上 SSR
- 好题：Nuxt 应用上线后服务器内存持续增长，重启后恢复，你怀疑什么？模块顶层的 reactive 或 Pinia 实例为什么会导致这个问题？怎么定位是哪一个？
- 危险信号：把 SSR 当 SEO 万能；不知道 useFetch 在客户端会复用服务端结果；在服务端访问 window 不做判断
- 期望信号：理解 payload 与水合流程；知道 useState 是 SSR 友好的共享状态；有 hydration mismatch 的具体排查经验；对 SSR 的服务器成本与缓存策略有判断

### Vue2 迁移与生态兼容
- 阶梯：Vue3 相比 Vue2 的破坏性变化有哪些 → 响应式差异、v-model 变化、filters 移除、生命周期改名、全局 API 变化，兼容构建（@vue/compat）的作用 → 迁移后某些第三方组件不工作、mixins 逻辑冲突、`this.$set` 遗留代码怎么处理，迁移过程中的双版本并行策略 → 迁移的投入产出评估、什么老项目不值得迁、迁移与重构的边界
- 好题：你要把一个 8 万行的 Vue2 中后台迁到 Vue3，你会怎么排计划？先做什么、怎么保证迁移过程中业务不停、最容易出问题的是哪几类代码？
- 危险信号：说不出任何具体的破坏性变化；认为"改改语法就行"；没考虑第三方生态兼容
- 期望信号：先升级构建与 TS、再开 compat 模式分批迁；有对 mixins 转 composable 的方案；能列出 Element UI 到 Element Plus 之类的生态迁移风险；对迁移收益有真实判断

### 表单与组件库封装
- 阶梯：受控表单、表单校验、组件库的 Form 用法 → 动态表单的 schema 驱动、异步校验、联动字段 → 大表单输入卡顿、校验触发多次、动态增删字段后校验状态错乱怎么排查 → schema 驱动表单的灵活性与调试成本，自研表单引擎与用组件库 Form 的取舍
- 好题：产品要一个由后端配置驱动的动态表单，字段类型、校验、联动都由 JSON 描述，你会怎么设计渲染层和校验层？哪些联动规则不适合放 JSON 里？
- 危险信号：所有校验都在提交时全量跑；联动靠一堆 watch 互相触发；不知道组件库 Form 的校验触发时机可配置
- 期望信号：字段级校验与触发时机；联动用 computed 派生；schema 与渲染分离；对表达式引擎的安全与调试有考虑

### uni-app / 小程序跨端（可选）
- 阶梯：uni-app 与原生小程序开发的关系 → 编译到各端的差异、条件编译、运行时性能瓶颈（setData 与逻辑层渲染层通信）→ 小程序端列表滚动卡顿、H5 端正常怎么排查，某端 API 不支持怎么降级 → 跨端框架的收益与各端体验差异的代价，什么业务不适合跨端
- 好题：同一份 uni-app 代码在 H5 流畅、微信小程序端长列表明显卡顿，可能的原因有哪些？你会怎么针对小程序端优化？
- 危险信号：不知道小程序双线程架构；认为跨端等于零成本；没有条件编译的实践
- 期望信号：理解 setData 数据量与频率的影响；分端优化与条件编译；对跨端框架的边界有清晰认识

## 好题 / 坏题对比

- 坏：Vue3 的响应式原理是什么？和 Vue2 有什么区别？
- 好：组件把接口返回的 5000 行数据直接赋给 reactive 后页面明显变慢，你怀疑什么？shallowRef、markRaw、只对可视区域做响应式三种方案分别解决什么问题、各自的代价是什么？怎么验证优化有效？

- 坏：说说 watch 和 watchEffect 的区别。
- 好：组件用 watch 监听筛选条件发请求，快速改变条件后列表显示了较早那次的返回，请解释原因并给出修法；如果 watch 里同时还同步修改了另一个 state，会不会引发二次触发、怎么避免？

- 坏：什么是 SSR？Nuxt 有哪些渲染模式？
- 好：Nuxt 应用上线后服务器内存持续增长，重启恢复，你怀疑哪些代码模式？模块顶层 reactive 与 Pinia 实例为什么会跨请求共享？怎么在本地复现并定位到具体模块？

## 项目结合钩子

- 简历出现"Vue2 迁移 Vue3" → 追项目规模、迁移计划、最难的一类代码（mixins、filters、第三方组件）、迁移期间怎么保证业务不停、迁完收益是什么
- 简历出现 Pinia / Vuex → 追 store 怎么按领域拆、服务器数据有没有进 store、解构响应式问题怎么处理、有没有持久化与水合问题
- 简历出现"大表格 / 万级数据渲染优化" → 追用什么工具定位、优化前后帧率或更新耗时、响应式深度怎么处理、虚拟滚动落地后的缺陷
- 简历出现权限路由 / 动态菜单 → 追刷新后路由怎么恢复、守卫里怎么避免重复请求、按钮级权限怎么做、后端校验边界
- 简历出现组件库二次封装 → 追透传 props/slots/事件怎么做、类型怎么保留、组件库升级时怎么不 break 业务
- 简历出现 Nuxt / SSR → 追数据获取怎么写、hydration mismatch 踩过什么、TTFB 与 LCP 数字、服务器内存与缓存策略
- 简历出现自定义 composable / hooks 库 → 追最复杂的一个解决什么、副作用怎么清理、共享状态怎么处理、怎么测试
- 简历出现 uni-app / 小程序 → 追各端差异怎么处理、小程序端性能瓶颈与优化、条件编译的范围

## 出题原则

- 响应式题从"丢失响应式"与"卡顿"这两类真实现象切入，让候选人解释链路而不是复述 Proxy 与 defineProperty 的区别。
- Vue 岗位大量是中后台与企业应用，题目要贴合这类场景：权限路由、大表格、动态表单、组件库封装，追问的重点是维护性与团队协作而不是炫技。
- 社招必追迁移与踩坑经历：Vue2 到 Vue3、Vuex 到 Pinia、Webpack 到 Vite，追迁移计划与真实困难，只说"顺利完成"的要标记为危险信号。
- 不考 API 时效：不问"Vue 3.5 新增了什么"，考的是响应式模型、组件设计与工程判断；浏览器与构建通用题交给 parent 包 frontend。
