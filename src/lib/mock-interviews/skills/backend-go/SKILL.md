---
name: backend-go
description: Go 后端栈特有出题：GMP 调度、GC、channel 语义、Go 微服务与云原生生态的考法。简历或岗位出现 Go/Golang/K8s 时加载；架构类通用题在 parent 包 backend 里。
keywords: [go, golang, gmp, goroutine, channel, k8s, kubernetes, grpc, gin]
layer: stack
parent: backend
---

## 出题原则

- Go 面重语言机制的"为什么这样设计"与并发正确性，题目要能暴露"会用但不懂语义"。
- 云原生生态（K8s/gRPC）只在简历出现时追问，且问排查经历不问概念。

## 高频主题与深度阶梯（入门 → 原理 → 场景排查 → 权衡）

- 并发模型：goroutine 与线程差异 → GMP 里 P 的作用、抢占如何实现 → goroutine 泄漏怎么定位（pprof 看什么）→ channel vs mutex 的选择依据
- channel：无缓冲/有缓冲语义 → close 的广播语义与二次 close → select 饥饿与超时控制 → 用 channel 实现限速/扇入扇出的取舍
- 内存与 GC：逃逸分析判断 → 三色标记与写屏障 → GC 频繁触发的排查（GOGC、对象池）→ sync.Pool 适用边界
- 工程实践：error 处理惯例与 wrap → context 取消传播 → interface 的隐式实现代价 → 泛型引入前后的 API 设计
- 服务治理：gRPC 流式与超时 → 服务发现方式 → K8s 探针配置错误的后果 → 优雅退出怎么做全

## 好题 / 坏题对比

- 坏：说说 goroutine 和线程的区别。
- 好：一个服务 goroutine 数量持续上涨不回落，你的排查步骤？最常见的三种泄漏模式是什么？
- 坏：channel 有什么用？
- 好：向一个已 close 的 channel 发送/接收分别会发生什么？为什么这么设计？
- 坏：介绍一下 Go 的 GC。
- 好：压测时 P99 毛刺和 GC 周期吻合，你会先调什么、怎么验证？

## 项目结合钩子

- 项目用了 Go 写服务 → 追并发原语选择、超时与取消是怎么传的。
- 简历提到 K8s 部署 → 追一次真实的 CrashLoopBackOff 或探针误杀排查。

## 期望信号提示

- 好回答：语义 + 设计动机 + pprof/trace 等工具串成排查故事。
- 危险信号：把 goroutine 当免费资源、channel 万能论、说不出任何泄漏场景。
