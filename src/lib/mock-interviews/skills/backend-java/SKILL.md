---
name: backend-java
description: Java 后端出题：JVM 内存与 GC、并发与 JUC、Spring 生态、MyBatis/JPA、微服务组件、性能排查与线上故障。岗位或简历出现 Java/Spring/Spring Boot/Spring Cloud 后端时加载。
keywords: [java, spring, spring boot, spring cloud, jvm, gc, juc, mybatis, jpa, dubbo, netty, java后端, java开发, 微服务, 线程池]
layer: stack
parent: backend
---

## 岗位职责与考察重点

Java 后端是国内互联网公司体量最大的后端岗位，日常是在 Spring Boot / Spring Cloud 或 Dubbo 体系里写业务服务、接中间件、处理线上问题。真实面试里 Java 方向有一条非常稳定的主线：JVM 内存与 GC、并发（线程池、锁、JUC 工具）、Spring 原理（IoC、AOP、事务）、持久层（MyBatis/JPA 与连接池）、微服务组件（注册中心、网关、配置中心、RPC）。这些题被问烂了，所以面试官最在意的不是候选人能不能背出 CMS 和 G1 的区别，而是三件事：一是遇到 OOM、CPU 飙高、接口变慢、线程池打满时有没有真实排查过，用什么工具、看什么数据；二是对 Spring 这类"魔法"背后的机制是否真的理解，能否解释自己项目里某个注解为什么不生效；三是并发代码能不能写对，能不能指出一段代码里的竞态。

校招侧重基础：集合源码（HashMap、ConcurrentHashMap）、synchronized 与 ReentrantLock、JVM 内存区域与垃圾回收基本流程、Spring Bean 生命周期、手写线程安全的单例或生产者消费者。社招侧重排查与设计：线上 Full GC 频繁怎么定位、线程池参数怎么定、@Transactional 失效的场景、分布式锁的坑、微服务之间调用超时链路、JDK 17/21 的虚拟线程对现有模型的影响。一线大厂近年明显减少了纯八股，改为"给你一段代码/一个现象，说问题在哪"。

## 主题

### JVM 内存结构与 OOM 排查
- 阶梯：堆、栈、方法区/元空间、直接内存各放什么 → 对象分配与晋升、TLAB、逃逸分析与标量替换 → 各种 OOM（heap、metaspace、direct、unable to create native thread）各自的典型原因与排查手段 → 堆大小、容器内存限制、堆外内存之间怎么分配
- 好题：容器内存 4G、堆设了 3G 的服务每隔几天被 OOMKilled，但 GC 日志里堆并没有满，你怀疑什么？怎么验证？
- 危险信号：只知道 -Xmx；分不清 JVM OOM 与容器 OOMKilled；不知道 NIO/Netty 会用直接内存
- 期望信号：会用 jmap/jcmd 导 heap dump 并用 MAT 看支配树；知道 MaxDirectMemorySize、元空间、线程栈、JIT 代码缓存都占容器内存；容器环境下用百分比参数（MaxRAMPercentage）；能说出一次真实的内存泄漏定位（如 ThreadLocal 未清理、静态集合、连接未关）

### GC 选型与调优
- 阶梯：分代假设与常见收集器（Parallel、CMS、G1、ZGC）各自的目标 → G1 的 Region、Mixed GC、停顿目标怎么工作，ZGC 的并发与染色指针 → Young GC 频繁、Full GC 频繁、单次停顿过长各自怎么定位 → 吞吐优先还是延迟优先，什么规模该上 ZGC，调参与改代码哪个先做
- 好题：服务每小时一次 Full GC 停顿 3 秒，你看 GC 日志时关注哪几个数字？分别指向什么原因？调大堆是好办法吗？
- 危险信号：背收集器名字但没看过 GC 日志；把所有问题都归为"堆太小"；不知道 G1 大对象（Humongous）的问题
- 期望信号：会读 GC 日志中的回收前后各代大小、晋升失败、并发模式失败；知道 Full GC 常见触发（老年代满、元空间满、System.gc、晋升失败）；提到用 jstat/GC 日志分析工具看趋势；先看是否有内存泄漏或大对象分配再调参

### 线程池设计与故障
- 阶梯：为什么用线程池、核心参数各是什么 → 任务提交流程（核心线程→队列→最大线程→拒绝）、为什么无界队列危险 → 线程池打满、任务堆积、线程泄漏、父子任务死锁的排查 → IO 密集与 CPU 密集怎么定参数、多个线程池的隔离与监控
- 好题：一个服务的线程池核心 10 最大 50 队列 1000，线上出现接口超时但线程池活跃线程只有 10，为什么？改哪个参数？改了会不会引入新问题？
- 危险信号：用 Executors.newFixedThreadPool 而不知道是无界队列；参数按"CPU 核数 + 1"背公式却不看任务类型；不知道 ThreadLocal 在线程池里会串
- 期望信号：解释队列先于最大线程；给线程池命名并暴露活跃数/队列长度指标；拒绝策略按业务选（丢弃、调用者执行、降级）；提到 CompletableFuture 默认用 ForkJoinPool 的坑；知道父任务等子任务且共用池会死锁

### 锁与并发工具
- 阶梯：synchronized 与 ReentrantLock 的区别 → 锁升级、AQS 的队列与 state、CAS 与 ABA → 死锁怎么用 jstack 定位、锁竞争导致吞吐下降怎么优化 → 锁粒度、读写锁、无锁结构、分段与 LongAdder 的适用边界
- 好题：一段用 synchronized 保护 HashMap 的代码在 32 核机器上吞吐比单线程还低，怎么解释？改成 ConcurrentHashMap 后哪些操作仍然不是原子的？
- 危险信号：认为 volatile 能保证原子性；不知道 ConcurrentHashMap 的 size 与复合操作不是原子；从没用 jstack 看过线程状态
- 期望信号：能画出 AQS 的等待队列；知道 compute/merge 这类原子复合操作；锁竞争用分段、缩小临界区、读写分离解决；能解释 happens-before 与内存可见性

### Java 内存模型与可见性
- 阶梯：volatile 解决什么问题 → JMM 的 happens-before 规则、指令重排、内存屏障 → 双重检查锁为什么需要 volatile、什么代码在 x86 上跑对了到 ARM 上出错 → 什么时候需要关心 JMM，final 与安全发布
- 好题：一个布尔标志位控制工作线程退出，线上偶发线程不退出，为什么？加 volatile 之后如果标志位换成一个计数器，还够吗？
- 危险信号：把 volatile 当轻量锁；不知道 JIT 会做重排与提升；说不出 happens-before 的任何一条规则
- 期望信号：区分原子性、可见性、有序性；知道 AtomicXxx 与 VarHandle；能解释安全发布与不可变对象的价值

### 虚拟线程与新版本 JDK
- 阶梯：JDK 21 虚拟线程解决什么问题 → 与平台线程的映射、载体线程、pinning（synchronized 内阻塞）→ 上了虚拟线程后线程池、ThreadLocal、数据库连接池怎么办 → 什么业务值得迁、迁移风险与收益
- 好题：把一个 IO 密集的 Spring Boot 服务切到虚拟线程后吞吐没提升反而偶发卡顿，你怀疑哪些原因？
- 危险信号：认为虚拟线程等于协程无脑更快；不知道 pinning；不知道数据库连接池仍是瓶颈
- 期望信号：知道 synchronized 块内阻塞会 pin 载体线程（JDK 24 前）；虚拟线程不该池化但下游资源仍需限流；ThreadLocal 在海量虚拟线程下的内存问题与 ScopedValue；提到 record、sealed、pattern matching 等语言特性的实际使用

### Spring IoC / AOP 原理与失效场景
- 阶梯：IoC 与 DI 解决什么问题 → Bean 生命周期、三级缓存解决循环依赖、代理生成（JDK 动态代理 vs CGLIB）→ @Transactional / @Async / @Cacheable 不生效的原因排查 → 什么逻辑该用 AOP、什么不该，代理带来的性能与可调试性代价
- 好题：同一个类里方法 A 调用带 @Transactional 的方法 B，事务没生效，为什么？列出至少三种修法并说各自的问题。构造器注入的循环依赖为什么三级缓存也解决不了？
- 危险信号：背出三级缓存但说不清每一级存什么；不知道自调用绕过代理；把 @Transactional 放在 private 方法上
- 期望信号：解释代理对象与目标对象的差别；知道事务传播行为与回滚规则（默认只回滚 RuntimeException）；能说出 BeanPostProcessor 的扩展点与自己用过的场景；提到 Spring Boot 自动装配的条件注解与排查方式（条件评估报告）

### Spring Boot 与生态实践
- 阶梯：自动装配怎么工作 → Starter 的机制、配置优先级、Actuator 暴露了什么 → 启动慢、Bean 冲突、配置被覆盖的排查 → Spring Boot 3 / Spring 6 的变化（Jakarta、AOT、GraalVM native）值不值得迁
- 好题：应用启动要 90 秒，你怎么定位哪一步慢？如果是某个 Bean 初始化时同步拉远程配置，怎么改？
- 危险信号：不知道 spring.factories / AutoConfiguration.imports；配置来源顺序说不清；从没看过启动日志
- 期望信号：会用 Actuator 的 startup 端点或 ApplicationStartup 看启动耗时；懒加载与异步初始化；理解 @ConditionalOnMissingBean 与用户覆盖默认配置的机制

### 持久层：MyBatis / JPA 与连接池
- 阶梯：MyBatis 与 JPA 怎么选 → MyBatis 的一二级缓存、动态 SQL、批量插入，JPA 的 N+1、懒加载与 open-in-view → 连接池（HikariCP）耗尽、慢 SQL 拖垮连接池、事务内做 RPC 的排查 → 连接池大小怎么定、读写分离在哪一层做、ORM 与手写 SQL 的边界
- 好题：接口偶发超时，日志显示获取数据库连接等待 30 秒，连接池大小 20，数据库 QPS 并不高，怀疑什么？怎么证明是"事务里做了远程调用"这类问题？
- 危险信号：连接池设成几百认为越大越好；不知道 MyBatis 一级缓存在 Spring 事务下的行为；JPA 项目全靠 findAll 后内存过滤
- 期望信号：连接池大小与数据库核心数、事务时长的关系；用连接池的 leak detection 或慢事务监控；大事务拆小、事务里不做 IO；批量操作用 rewriteBatchedStatements 或手写 batch；知道 JPA 的脏检查与 flush 时机

### 微服务组件：注册发现、配置、网关、RPC
- 阶梯：Spring Cloud 与 Dubbo 各自的定位 → 注册中心（Nacos/Eureka/ZK）的一致性模型、心跳与摘除、配置热更新原理 → 服务下线流量仍打进来、配置推送不生效、网关成为瓶颈的排查 → 服务网格 vs SDK 模式、跨语言与统一治理的取舍
- 好题：发布时老实例已经关了但注册中心还没摘除，导致几秒内大量报错，你有哪些办法做到优雅下线？每种办法在哪一层生效？
- 危险信号：只会配置 starter 不知道原理；不知道注册中心的 AP/CP 差别；没处理过优雅停机
- 期望信号：先摘注册再停容器、等待在途请求、客户端缓存刷新周期；Dubbo/gRPC 的序列化、负载均衡、重试语义；网关的限流鉴权与路由热更新；配置中心的灰度与回滚

### 分布式锁与缓存实践（Java 视角）
- 阶梯：为什么 synchronized 在集群里没用 → Redis 分布式锁（SET NX PX、Redisson 看门狗）与 ZK 锁的差别 → 锁过期业务没执行完、主从切换锁丢失、锁误删的处理 → 什么场景其实不需要分布式锁（幂等、乐观锁、队列串行化）
- 好题：用 Redis 锁保护库存扣减，某次 GC 停顿 8 秒导致锁过期后两个实例同时执行，怎么防？RedLock 值得用吗？
- 危险信号：del 锁不校验持有者；不知道看门狗续期；认为 RedLock 是银弹
- 期望信号：唯一值 + Lua 释放；fencing token 或数据库版本号做最终保护；能说出何时改用数据库乐观锁；Spring Cache 注解与 Redis 结合的过期、穿透处理

### 性能排查工具与方法
- 阶梯：CPU 高怎么查、内存高怎么查 → jstack/jmap/jstat/jcmd、Arthas、async-profiler 各看什么 → 接口 P99 高但平均正常、偶发抖动、特定机器慢的定位思路 → 排查工具的线上安全性（dump 停顿、采样开销），什么该常态化监控
- 好题：一台机器 CPU 100%，你在两分钟内怎么定位到具体代码行？如果是 GC 线程占的 CPU 呢？如果是业务线程但每次抓到的栈都不一样呢？
- 危险信号：只会重启；不知道 top -H 配合 jstack 找线程；没用过 Arthas 或 profiler
- 期望信号：top -H → 线程 ID 转十六进制 → jstack 匹配；Arthas 的 thread/trace/watch；async-profiler 火焰图；知道 heap dump 会 STW 要挑机器与时机；结合 GC 日志与监控看趋势

### 集合与基础源码
- 阶梯：HashMap 的结构与扩容 → 红黑树转换阈值、并发下的问题、ConcurrentHashMap 的分段与 CAS → 集合导致的性能与内存问题（大 Map 扩容抖动、fail-fast、内存放大）→ 什么时候需要关心这些，什么时候该用专用结构
- 好题：一个每秒插入百万条的去重场景，用 HashSet 内存爆了，你有哪些替代？各自的精度与内存代价？
- 危险信号：能背 HashMap 源码但说不出自己项目里哪里用错了集合；不知道 ArrayList 遍历删除的坑
- 期望信号：解释扩容与哈希冲突；预设容量；布隆过滤器、位图、外部去重；知道 String、包装类型的内存占用

## 好题 / 坏题对比

- 坏：说说 JVM 的内存区域和垃圾回收算法。
- 好：容器限制 4G、堆设 3G 的服务每隔几天被 OOMKilled，但 GC 日志显示堆从没满过。你怀疑内存去哪了？用什么命令验证？最后怎么定参数？

- 坏：Spring 的事务传播行为有哪几种？
- 好：这段代码里同一个类的 a() 调用了带 @Transactional 的 b()，b 里抛了异常但数据没回滚。指出原因，给三种修法，并说每种修法在什么情况下又会出问题。

- 坏：线程池的七个参数是什么？
- 好：线程池核心 10、最大 50、队列 1000，线上接口超时但监控显示活跃线程一直是 10。解释为什么，说你会改哪个参数，以及改完之后可能引入的新问题。

## 项目结合钩子

- 简历出现 JVM 调优 → 追调之前的 GC 指标、改了什么参数、调完的对比数据、有没有先排除内存泄漏；说不出 GC 日志内容的要标记
- 简历出现线程池 / 并发优化 → 追参数怎么定、监控了什么、有没有出过任务堆积或死锁
- 简历出现 Spring Cloud / Dubbo → 追注册中心是哪个、优雅下线怎么做、超时重试在哪一层配、服务间调用出过什么问题
- 简历出现 MyBatis / JPA → 追连接池大小与依据、慢 SQL 怎么发现、事务范围多大、有没有 N+1
- 简历出现 Redis 分布式锁 → 追锁过期怎么处理、释放怎么保证是自己的、主从切换考虑过没有
- 简历出现 Netty / 自研 RPC → 追线程模型、编解码与粘包、直接内存管理、空闲检测与重连
- 简历出现 JDK 17/21 升级 → 追迁移遇到的问题（模块化、反射限制、Jakarta 包名）、虚拟线程是否用了、收益是什么
- 简历出现"接口性能优化" → 追用什么工具定位（Arthas、profiler、trace）、瓶颈是什么、优化前后的 P99

## 出题原则

- 架构与方法论（缓存一致性、消息队列、限流降级）交给 backend 包，本包专注 Java 生态的实现细节与排查手段。
- 八股必须落到现象：任何原理题都要配一个"线上会怎么表现""你怎么验证"的追问，能背不能用的要标记。
- 代码级追问：并发、事务、集合相关主题优先给一段代码或一个现象让候选人找问题，而不是让他复述概念。
- 按 JDK 版本与项目规模出题：还在 JDK 8 的项目不追虚拟线程；小项目不追 ZGC 与容器内存分配，但必须会读 GC 日志与线程栈。
