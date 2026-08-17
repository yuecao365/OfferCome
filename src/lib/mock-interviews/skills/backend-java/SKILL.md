---
name: backend-java
description: Java 后端栈特有出题：JVM、并发包、Spring 机制、MySQL/Redis 在 Java 生态的考法。简历或岗位出现 Java/Spring 时加载；架构类通用题在 parent 包 backend 里。
keywords: [java, spring, springboot, jvm, mybatis, juc, netty]
layer: stack
parent: backend
---

## 出题原则

- 八股必须挂场景：不问"垃圾回收有哪些算法"，问"这个症状是什么 GC 问题、怎么定位"。
- 大厂 Java 面近年重排查与原理串联，轻 API 背诵；题目要能被"背过但不懂"的人答错。

## 高频主题与深度阶梯（入门 → 原理 → 场景排查 → 权衡）

- JVM 内存与 GC：对象在堆里怎么分配 → 分代假设与 G1 Region → 频繁 Full GC / OOM 排查路径（先看什么日志、dump 怎么读）→ 吞吐 vs 停顿的收集器选型
- 并发：synchronized 与 ReentrantLock 差异 → AQS 等待队列原理 → 线程池参数线上怎么定、队列打满会怎样 → ThreadLocal 泄漏场景
- Spring：Bean 生命周期 → 三级缓存解决什么、解决不了什么 → @Transactional 失效的五种场景 → AOP 代理选择的代价
- MySQL（Java 视角）：InnoDB 索引结构 → 一条 IN 查询突然不走索引的排查 → 死锁日志怎么读 → 事务隔离级别与业务对映
- Redis（Java 视角）：数据结构选型 → 分布式锁的正确姿势与续期 → 大 key/热 key 定位 → Lettuce/Jedis 连接模型差异

## 好题 / 坏题对比

- 坏：说说 HashMap 的底层原理。
- 好：HashMap 在并发 put 时可能出什么问题？JDK8 之后为什么还是不建议并发用？换 ConcurrentHashMap 后 size() 为什么不准？
- 坏：Spring 的 IoC 和 AOP 是什么？
- 好：一个 @Transactional 方法内部调用同类的另一个 @Transactional 方法，事务行为是什么？为什么？怎么改？
- 坏：Redis 有哪些数据结构？
- 好：用 Redis 实现"点赞去重 + 统计总数"，你选什么结构？千万级用户时内存怎么算？

## 项目结合钩子

- 项目用了 Spring Boot → 问启动慢/循环依赖/配置隔离等真实遇到的问题。
- 简历写"调优" → 必追：调了什么参数、依据什么指标、前后对比数字。

## 期望信号提示

- 好回答：机制 + 边界条件 + 排查工具名（arthas/jstat/EXPLAIN）能串起来。
- 危险信号：只背结论不知道适用版本、把面经原文复述、说不出任何一次真实排查。
