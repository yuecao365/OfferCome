---
name: backend-node
description: Node.js 后端出题：事件循环与异步模型、Express/Nest 框架机制、流与背压、性能与内存泄漏排查、集群与部署。岗位或简历出现 Node.js/NestJS/Express/Koa 后端或全栈时加载。
keywords: [node, nodejs, node.js, nestjs, express, koa, typescript, 事件循环, event loop, stream, 全栈, bff, node后端, 服务端开发, backend]
layer: stack
parent: backend
---

## 岗位职责与考察重点

Node.js 后端集中在 BFF 与网关层、全栈团队、工具与平台类产品、实时通信（IM、协作、推送）、Serverless 与边缘函数，以及大量出海与外企的 TypeScript 全栈岗位。日常是用 NestJS/Express/Koa 或 Fastify 写 API、聚合下游服务、处理 WebSocket、写 SSR 与构建服务，跑在 PM2 或容器里。Node 面试的主线很清晰：事件循环与异步模型、Promise 与 async/await 的细节、流与背压、模块系统、性能与内存泄漏排查、集群与多进程、框架（Nest 的 DI 与生命周期）、TypeScript 工程化。因为单线程模型的特殊性，面试官最在意三件事：一是候选人是否真的理解"什么会阻塞事件循环"并能定位它；二是对异步错误处理是否严谨——未捕获的 rejection、流的错误、进程崩溃的处理；三是有没有把 Node 服务跑稳过：内存泄漏怎么抓、CPU 密集任务怎么隔离、多核怎么用、优雅退出怎么做。

校招侧重语言与运行时基础：事件循环各阶段与 microtask 顺序、Promise 的实现、闭包与 this、模块加载、能否写一个带并发限制的异步任务调度器。社招侧重生产问题与设计：接口偶发卡顿的排查、heap snapshot 分析、流式处理大文件、Nest 的模块与依赖注入设计、BFF 的聚合与降级、SSR 服务的性能。全栈岗位会同时追前端协作（接口契约、SSR、Monorepo），基础平台岗位会追 Node 底层（libuv、N-API、Worker Threads）与 Bun/Deno 的判断。

## 主题

### 事件循环与执行顺序
- 阶梯：为什么 Node 是单线程却能处理高并发 → libuv 的事件循环阶段（timers、poll、check、close）、microtask 与 process.nextTick 的优先级、线程池的作用 → 一个同步的 JSON.parse 大对象或正则回溯让所有请求都卡住的定位、定时器不准、setImmediate 与 setTimeout 顺序不一致的原因 → 什么任务该放 Worker Threads、什么该拆服务，事件循环延迟怎么监控
- 好题：一个接口偶发让整个服务卡 2 秒，CPU 打满但没有慢 SQL，你怎么在生产环境找到是哪段同步代码？找到之后有哪几种改法？
- 危险信号：只会背"宏任务微任务"；不知道 libuv 线程池默认 4 个线程且 fs/DNS/crypto 会用它；认为 async/await 能让 CPU 计算不阻塞
- 期望信号：会用 perf_hooks 的 monitorEventLoopDelay 或 --cpu-prof 抓阻塞；知道 UV_THREADPOOL_SIZE；CPU 密集用 Worker Threads 或独立服务；能准确说出 nextTick、Promise、setTimeout、setImmediate 的执行顺序及在 IO 回调里的差别

### Promise、async/await 与异步错误处理
- 阶梯：Promise 的状态与链式 → async/await 的编译结果、Promise.all/allSettled/race/any 的差别、并发限制怎么写 → unhandledRejection 导致进程退出（Node 15+）、忘记 await 导致错误丢失、try/catch 包不住回调里的异常的排查 → 错误分类（可重试/业务/编程错误）与全局兜底策略，什么时候该让进程崩溃重启
- 好题：写一个并发限制为 5 的异步任务执行器，要求任意任务失败不影响其他任务并汇总结果。写完后回答：如果某个任务返回的 Promise 永远不 resolve，你的执行器会怎样？怎么加超时？
- 危险信号：Promise.all 一个失败全部丢弃却不知道；async 函数里 forEach 配 await；process.on('unhandledRejection') 里直接吞掉
- 期望信号：allSettled 或逐个 catch；AbortController 与超时配合；unhandledRejection 记日志后按策略退出让进程管理器重启；提到 Error.cause 与自定义错误类

### 流与背压
- 阶梯：为什么要用流 → Readable/Writable/Transform、pipe 与 pipeline 的区别、highWaterMark、drain 事件 → 大文件下载内存暴涨、pipe 之后错误没被处理导致文件句柄泄漏、上游快下游慢导致缓冲区无限增长的排查 → 什么场景值得手写流、Web Streams 与 Node Streams 的融合、对象流的开销
- 好题：一个导出接口从数据库读百万行写成 CSV 返回给客户端，用 pipe 之后内存仍然涨到 2G，可能是什么原因？如果客户端中途断开，数据库游标会关闭吗？
- 危险信号：把整个文件读进 Buffer 再返回；用 pipe 而不知道它不传递错误；不知道 write 返回 false 的含义
- 期望信号：stream.pipeline 统一错误与清理；数据库查询用游标或流式 API；write 返回 false 时等 drain；res 的 close 事件触发上游销毁；提到 Readable.from 与 async iterator 消费流

### 内存泄漏与 heap 分析
- 阶梯：V8 的内存结构与 GC（新生代/老生代）→ 常见泄漏源（全局缓存无上限、闭包引用、事件监听器未移除、定时器未清理）→ 内存持续增长的定位流程：--heapsnapshot-signal、对比快照、看 retainer 路径 → 堆大小（--max-old-space-size）与容器内存的匹配，泄漏修不了时的重启策略
- 好题：服务内存每天涨 300MB 直到 OOM，你怎么在不重启的前提下拿到证据？heap snapshot 里看什么？如果发现是某个 Map 一直变大，怎么改？
- 危险信号：只会加 --max-old-space-size；没见过 heap snapshot；不知道 EventEmitter 的 MaxListeners 警告意味着什么
- 期望信号：对比两次快照的 delta；看 retained size 与 retainer 树；LRU 加上限与 TTL；WeakMap/WeakRef 的适用场景；知道 Buffer 在堆外与 ArrayBuffer 的统计位置

### 性能剖析与 CPU 热点
- 阶梯：怎么知道服务慢在哪 → --cpu-prof、clinic.js、0x 火焰图、async_hooks 的开销 → JSON 序列化、日志同步写、模板渲染、正则成为热点的定位与优化 → JIT 去优化（deopt）的常见原因，什么时候该换 Fastify、什么时候该上 Worker 或原生模块
- 好题：一个 BFF 聚合接口平均 300ms，下游都在 50ms 内，时间去哪了？你用什么工具证明？如果是 JSON.stringify 一个深层大对象呢？
- 危险信号：优化靠猜；不知道 console.log 在某些情况下是同步的；没做过 benchmark
- 期望信号：火焰图看自身时间与下游等待；串行 await 改并行；流式 JSON 或减少字段；pino 之类的异步日志；autocannon 压测对比；知道 hidden class 与 megamorphic 调用的影响

### NestJS 架构与依赖注入
- 阶梯：Nest 相比 Express 多了什么 → 模块、提供者、作用域（单例/请求/瞬态）、生命周期钩子、守卫/拦截器/管道/过滤器的执行顺序 → 请求作用域的提供者拖慢性能、循环依赖注入、全局异常过滤器没捕获到某类错误的排查 → Nest 的抽象层在小项目里是否过重，与 Fastify 适配器的收益，Monorepo 下的模块划分
- 好题：把一个提供者改成请求作用域后 QPS 掉了一半，为什么？如果只是要拿到当前请求的用户信息，有哪些不改作用域的做法？
- 危险信号：所有东西都塞进 AppModule；不知道 forwardRef 解决什么；不知道 Pipe 与 Guard 的执行顺序
- 期望信号：作用域冒泡导致依赖链全部变成请求级；用 AsyncLocalStorage 或 CLS 传递请求上下文；模块按领域划分并用 exports 控制可见性；自定义装饰器与 ValidationPipe 的 DTO 校验

### Express / Koa / Fastify 中间件机制
- 阶梯：中间件模型是什么 → Express 的线性 next、Koa 的洋葱模型与 async 中间件、Fastify 的 schema 与钩子 → 错误中间件不生效、异步错误没传到 next、中间件顺序导致鉴权被绕过的排查 → 框架选型的性能与生态差别，路由层与业务层怎么分
- 好题：Express 里一个 async 中间件抛了异常，错误处理中间件没收到，请求一直挂着，为什么？Express 5 改了什么？Koa 为什么没有这个问题？
- 危险信号：不知道 Express 4 不捕获 async 错误；错误中间件参数写成三个；不知道洋葱模型在响应阶段可以做事
- 期望信号：express-async-errors 或 Express 5 的 Promise 支持；Koa 的 await next() 后处理响应时长与错误；Fastify 的 JSON schema 序列化带来的性能；中间件顺序与安全（helmet、rate limit、body 大小限制）

### 集群、多进程与部署
- 阶梯：单进程怎么用多核 → cluster 模块的 master/worker 与端口共享、PM2 的模式、容器里一个进程还是多进程 → worker 崩溃后的重启风暴、粘性会话与 WebSocket 在多进程下的问题、进程间状态不一致的排查 → cluster 还是容器水平扩容，优雅退出与滚动发布怎么配合
- 好题：容器里跑 PM2 cluster 模式 4 个实例，Kubernetes 又起了 3 个 Pod，健康检查与优雅退出该在哪一层做？WebSocket 连接在滚动更新时怎么办？
- 危险信号：容器里还用 PM2 守护；不知道 cluster 的负载分发在 Linux 是轮询；SIGTERM 不处理
- 期望信号：容器内单进程 + K8s 扩容更简单；SIGTERM → server.close 停止接收 → 等待在途请求 → 关闭连接池；WebSocket 用 Redis adapter 或独立网关层；健康检查区分 liveness 与 readiness

### 模块系统与 TypeScript 工程化
- 阶梯：CommonJS 与 ESM 的区别 → 循环依赖的行为差异、双包发布、动态 import、require 缓存 → ESM 与 CJS 互操作报错、路径别名在编译后失效、类型与运行时不一致的排查 → tsconfig 的 strict 策略、构建工具（tsc/esbuild/swc/tsup）选择、Monorepo（pnpm workspace/turborepo）的依赖管理
- 好题：项目从 CommonJS 迁到 ESM 遇到了哪些问题？__dirname 没了怎么办？一个只发 CJS 的依赖怎么在 ESM 项目里用？
- 危险信号：分不清 import type 与 import；tsconfig 全部 any；不知道 exports 字段
- 期望信号：package.json 的 exports 与条件导出；import.meta.url 替代 __dirname；strict 与 noUncheckedIndexedAccess 的取舍；zod 做运行时校验与类型推导；pnpm 严格依赖与 phantom dependency

### 实时通信与长连接
- 阶梯：WebSocket 与 SSE 与长轮询怎么选 → ws/socket.io 的差别、心跳与重连、消息顺序与丢失 → 连接数上万后内存与文件描述符、广播风暴、多实例下消息路由的排查 → 自建长连接服务还是用托管推送，消息可靠性需要到什么程度
- 好题：一个协作编辑服务用 socket.io，单实例撑 2 万连接后内存 3G，你怎么分析每个连接占了什么？扩到多实例后房间内消息怎么同步？
- 危险信号：每个连接存大对象；不知道 socket.io 有自己的协议与 fallback；不处理断线重连的状态恢复
- 期望信号：连接上下文精简与 WeakRef；Redis pub/sub 或 adapter 做跨实例广播；心跳超时与半开连接清理；SSE 在单向推送场景更简单；提到 ulimit 与内核参数

### 安全与输入处理
- 阶梯：常见的 Node 安全问题 → 原型污染、正则 DoS、依赖供应链、body 大小与 JSON 深度限制 → 一个正则让 CPU 打满、用户提交的 __proto__ 改变了默认行为、依赖被投毒的排查与防御 → 安全措施对性能与开发效率的影响，依赖审计的流程
- 好题：用户提交的 JSON 里带 __proto__ 字段，经过一次深合并后所有对象多了一个属性，解释原因并给出防御。一个校验邮箱的正则让某些输入耗时几秒，怎么定位与修？
- 危险信号：不知道原型污染；正则随手写不考虑回溯；npm install 从不 audit
- 期望信号：Object.create(null) 或校验键名；用 safe-regex 或 RE2；helmet、rate limit、body 限制；lockfile 与 npm audit/socket.dev；最小权限运行

### 运行时选择与新特性
- 阶梯：Node 近几个 LTS 带来了什么 → 原生 fetch、test runner、--watch、permission model、单文件可执行 → 升级 Node 大版本时依赖不兼容、OpenSSL 变化导致的问题 → Bun/Deno 相比 Node 的定位与适用场景，什么时候值得换
- 好题：你会在什么场景考虑用 Bun 替代 Node？哪些风险会让你不换？Node 22 的哪些特性让你减少了第三方依赖？
- 危险信号：Node 版本停留在 14；不知道原生 fetch 与 test runner；盲目追新运行时
- 期望信号：原生 fetch、AbortSignal.timeout、structuredClone 的使用；Worker Threads 与 SharedArrayBuffer；理性评估 Bun 的兼容性与生态；LTS 生命周期与升级节奏

## 好题 / 坏题对比

- 坏：说说 Node 的事件循环有哪几个阶段。
- 好：某个接口被调用时整个服务卡 2 秒，CPU 打满但没有慢 SQL。说你会在生产环境用什么手段找到是哪段同步代码，找到之后（比如是一个大对象的 JSON.parse）有哪几种改法，各自的代价。

- 坏：流有什么用？pipe 和 pipeline 的区别？
- 好：导出接口从数据库读百万行写 CSV 返回给客户端，已经用了 pipe，内存还是涨到 2G。列出可能的原因、怎么验证，然后回答客户端中途断开时数据库游标怎么被释放。

- 坏：NestJS 的依赖注入是怎么实现的？
- 好：把一个 Service 改成请求作用域后 QPS 掉了一半，解释作用域冒泡的机制，然后说如果只是要在 Service 里拿到当前用户信息，有哪些不改作用域的做法。

## 项目结合钩子

- 简历出现 BFF / 接口聚合 → 追下游并行还是串行、超时与降级怎么做、聚合层的缓存策略、P99 与下游的差值
- 简历出现 NestJS → 追模块怎么划分、作用域用了哪些、拦截器与守卫里做了什么、循环依赖遇到过没有
- 简历出现 WebSocket / 实时 → 追连接数、心跳与重连、多实例怎么广播、断线状态恢复
- 简历出现"性能优化" → 追用什么工具（火焰图、heap snapshot）、热点是什么、前后数字、有没有压测
- 简历出现内存泄漏排查 → 追怎么发现、快照对比看到了什么、根因是缓存还是监听器还是闭包
- 简历出现 SSR / Next.js 服务端 → 追渲染耗时、缓存与流式渲染、Node 服务的资源占用、与 CDN 的配合
- 简历出现 TypeScript / Monorepo → 追 strict 程度、构建工具、包之间怎么共享类型、CJS/ESM 怎么处理
- 简历出现 Serverless / 边缘函数 → 追冷启动优化、连接池在无状态环境怎么处理、日志与追踪怎么做

## 出题原则

- 架构与方法论（缓存一致性、消息队列、限流降级）交给 backend 包，本包专注 Node 运行时、异步模型、框架机制与生产运维。
- 事件循环必考且必须落到排查：不接受背阶段顺序，要给一个"服务卡住"的场景让候选人说定位工具与改法。
- 异步错误处理是分水岭：任何候选人都要被追未捕获 rejection、流的错误传播、进程崩溃策略，答不严谨的标记为危险信号。
- 结合岗位类型出题：全栈岗位追接口契约与 SSR；平台岗位追 Worker、多进程与运行时细节；小团队追 TypeScript 工程化与部署简化。
