---
name: data-spark
description: Spark 特有出题：Shuffle 与数据倾斜、内存调优、Structured Streaming、Hive/Kafka 协作。简历或岗位出现 Spark 时加载；数仓建模题在 parent 包 data-engineering 里。
keywords: [spark, pyspark, spark sql, shuffle, 数据倾斜, aqe, structured streaming, hive, flink, kafka, yarn, 大数据, 计算引擎, executor, catalyst]
layer: stack
parent: data-engineering
---

## 岗位职责与考察重点

Spark 是国内大数据开发岗的默认计算引擎，几乎所有数据开发、数仓、大数据平台的面试都会考。真实面试里 Spark 题的核心永远是三件事：任务为什么慢（Shuffle、倾斜、小文件、并行度）、为什么挂（OOM、GC、Executor 丢失）、结果为什么不对（去重、迟到数据、非幂等写入）。面试官最在意的是候选人能不能读懂 Spark UI 和执行计划、能不能把"调参"落实到"改变了执行的哪一步"，以及是否知道每种优化手段的副作用。会背"数据倾斜七种解法"但说不出怎么确认倾斜、怎么找到倾斜 key 的人很多，这正是要区分的。

校招侧重执行模型：RDD 与 DataFrame 的区别、宽窄依赖与 Stage 划分、Shuffle 过程、缓存与持久化、常见算子语义；社招侧重线上调优与事故：内存模型与 OOM 排查、AQE 的能力与边界、Structured Streaming 的状态与一致性、与 Hive 元数据和 Kafka 的协作、以及资源与成本治理。平台方向会追 Spark on K8s、动态资源分配与多租户隔离；实时方向会对比 Flink 并追选型依据。

## 主题

### 执行模型与 Stage 划分
- 阶梯：RDD、DataFrame、Dataset 的区别与选择 → 宽窄依赖如何决定 Stage 边界，Job、Stage、Task 的层级 → Spark UI 里一个 Job 有几十个 Stage 且大量被 skipped 怎么解读，DAG 里哪一步是瓶颈 → 用 DataFrame 让 Catalyst 优化 vs 用 RDD 精细控制的取舍
- 好题：一个 SQL 任务 Spark UI 显示 Stage 12 占了 80% 时间，你怎么从 UI 反推出它对应 SQL 的哪一段？看哪些指标决定下一步优化方向？
- 危险信号：说不清 Stage 为什么在 Shuffle 处切分；只会看总耗时不会看 Stage 与 Task 分布
- 期望信号：能对应 explain 输出与 UI 的 Stage；知道 Exchange 就是 Shuffle 边界；看 Task 耗时的中位数与最大值判断倾斜

### Shuffle 原理与开销
- 阶梯：哪些算子触发 Shuffle → Shuffle write / read 的过程、排序与溢写、Shuffle 文件数量 → Shuffle 阶段大量磁盘溢写、fetch 失败、External Shuffle Service 挂掉怎么排查 → 减少 Shuffle（广播、预分区、map 端预聚合）与增加并行度的权衡
- 好题：任务在 Shuffle read 阶段频繁 FetchFailed 导致 Stage 重试，可能的原因有哪些？调大重试次数是治标还是治本？
- 危险信号：认为 reduceByKey 和 groupByKey 没区别；不知道 Shuffle 分区数默认 200 及其含义
- 期望信号：区分 Shuffle write 溢写与 read 拉取问题；理解 map 端合并减少数据量；知道 Executor 丢失会导致 Shuffle 文件丢失

### 数据倾斜定位与处理
- 阶梯：倾斜的表现是什么 → 为什么少数 Task 跑很久（key 分布不均、null key、热点 join key）→ 怎么定位倾斜 key（采样统计、UI 里的 Task 数据量）、大表 join 大表的倾斜怎么办 → 加盐拆分、广播、AQE 自动处理各自适用范围与副作用（膨胀、随机性、二次聚合）
- 好题：两张大表 join，其中一张 5% 的 key 占了 60% 的数据，广播不了，你会怎么处理？加盐后对侧表膨胀多少倍、怎么控制？AQE 的 skew join 能不能直接解决？
- 危险信号：背出七种方法但说不出怎么确认倾斜 key；对所有场景都说"加盐"；不知道 AQE skew join 只处理 sort merge join
- 期望信号：先用 UI 确认 Task 数据量差异；采样找 top key；null 值单独处理；理解 AQE 拆分倾斜分区的原理与限制

### 内存模型与 OOM
- 阶梯：Executor 内存分成哪几部分 → 统一内存管理中执行与存储内存怎么互相借用，堆外内存的用途 → Container killed by YARN、Driver OOM（collect、大广播）、Executor OOM（大分区、缓存过多）分别怎么定位 → 加内存、调并行度、改逻辑的优先级
- 好题：任务报 "Container killed by YARN for exceeding memory limits"，但 executor.memory 已经很大，为什么还会超？你会调哪些参数、为什么？
- 危险信号：所有内存问题都靠加 executor.memory；不知道 memoryOverhead 与堆外内存；Driver 上 collect 全量数据
- 期望信号：区分堆内堆外；知道 Python UDF、Netty 缓冲占用堆外；大分区拆分并行度而不是加内存

### Spark SQL 与 Catalyst 优化
- 阶梯：SQL 到物理计划的过程 → 谓词下推、列裁剪、常量折叠、join 策略选择的依据 → 分区裁剪没生效、广播 join 没触发、统计信息缺失导致计划差怎么排查 → CBO 收集统计信息的成本、hint 强制策略的风险
- 好题：一个带分区过滤的查询扫了全表，你会怎么确认分区裁剪没生效、常见的写法原因有哪些？
- 危险信号：不看 explain；把 hint 当常规手段；不知道 UDF 会阻断下推
- 期望信号：能读 explain 中的 PartitionFilters 与 PushedFilters；知道函数包裹分区列、类型隐式转换会破坏裁剪；理解 broadcast 阈值与统计信息的关系

### AQE 与动态优化
- 阶梯：AQE 解决什么问题 → 运行时合并小分区、动态切换 join 策略、倾斜分区拆分的机制 → 开了 AQE 后分区数变化导致输出小文件变多或变少、性能不升反降怎么分析 → AQE 的边界：什么优化它做不了，什么时候要关掉
- 好题：升级到开启 AQE 后某任务反而变慢了，可能的原因有哪些？你怎么验证是 AQE 导致的？
- 危险信号：认为 AQE 是万能开关；不知道它依赖 Shuffle 阶段统计信息
- 期望信号：理解 AQE 在 Stage 边界重新规划；合并分区的目标大小参数；对流式和无 Shuffle 任务无效

### 缓存、持久化与小文件
- 阶梯：cache 与 persist 的区别与级别 → 何时缓存有收益、缓存导致内存压力与重算的关系 → 输出小文件过多拖垮 HDFS / 元数据、读取时 Task 过多怎么治理 → repartition 与 coalesce 的取舍，写前合并的成本
- 好题：一个每天写 Hive 分区表的任务产生几万个小文件，下游查询变慢，你会在哪一步合并、用什么手段、怎么避免合并本身引入倾斜？
- 危险信号：认为 cache 越多越好；不知道 coalesce 不触发 Shuffle 因此可能造成倾斜
- 期望信号：按数据量估算目标分区数；写前 repartition 按分区键 + 随机数；结合 AQE 合并；理解 lineage 太长时 checkpoint 的作用

### Structured Streaming
- 阶梯：微批与连续处理的区别 → checkpoint、offset 管理、watermark、状态存储做什么 → 状态无限膨胀、迟到数据被丢、重启后重复输出怎么排查 → 端到端 exactly-once 依赖什么（可重放 source、幂等或事务 sink），与 Flink 的选型依据
- 好题：一个基于事件时间的窗口聚合流任务运行一周后状态越来越大最终 OOM，你怀疑什么？watermark 设多大合适、怎么权衡准确性与状态大小？
- 危险信号：不知道 watermark 与状态清理的关系；认为 checkpoint 就等于 exactly-once；不清楚 foreachBatch 的语义
- 期望信号：watermark 控制状态 TTL；sink 幂等或按 batchId 去重；理解微批延迟下限；能说出 Flink 在低延迟与复杂状态场景的优势

### 与 Hive / Kafka / Flink 协作
- 阶梯：Spark 读写 Hive 表的方式与元数据依赖 → 动态分区写入、bucket 表、Hive 与 Spark SQL 语法与函数差异 → 覆盖写导致下游读到空数据、Kafka 消费 offset 丢失或重复、Spark 与 Flink 写同一张湖仓表冲突怎么处理 → 批流一体时引擎分工的原则
- 好题：Spark 用 insert overwrite 覆盖分区期间下游 Presto 查询读到了空结果，为什么？怎么设计写入让下游读不到中间状态？
- 危险信号：不知道 overwrite 非原子；Kafka offset 提交时机说不清
- 期望信号：写临时分区再重命名或用湖仓表的原子提交；Kafka offset 存在 checkpoint 而非自动提交；批流分工按延迟需求与状态复杂度

### 资源配置与成本
- 阶梯：executor 数量、核数、内存怎么定 → 动态资源分配、并行度与资源的匹配 → 集群排队严重、任务抢占、某任务长期占着资源不释放怎么治理 → 提高单任务速度与整体集群吞吐的冲突，Spark on YARN 与 on K8s 的差异
- 好题：给一个每天处理 2TB 数据的 SQL 任务定 executor 配置，说出你的估算依据；上线后发现资源利用率只有 40%，你会调什么？
- 危险信号：配置靠抄模板；不知道每个 executor 核数过多的 HDFS 吞吐问题
- 期望信号：从数据量与分区数反推并行度；开启动态分配并配置合理上下限；看 UI 的 Task 时间分布判断资源浪费

### 算子语义与结果正确性
- 阶梯：map/flatMap、reduceByKey/groupByKey、join 各类型的语义 → 惰性求值与 action 触发重算，累加器在重试下为什么会多加 → 同一任务两次跑出的结果不一致（非确定性 UDF、随机数、重算、外部状态）怎么定位 → 用 cache 保证一致性与它带来的内存成本
- 好题：一个任务每天跑出的去重用户数偶尔比昨天少几十，重跑又正常，你怀疑什么？怎么设计任务让结果可复现、可对账？
- 危险信号：不知道 Transformation 与 Action 的区别；认为 count 之后再 collect 不会重算；在 UDF 里用当前时间或随机数
- 期望信号：理解 lineage 重算与 Task 重试对副作用的影响；去重口径与 null 处理明确；输出带对账指标

### PySpark 与 UDF 性能
- 阶梯：PySpark 与 Scala Spark 的执行差异 → Python UDF 的序列化开销、pandas UDF 与 Arrow 为什么快 → PySpark 任务比同样逻辑的 SQL 慢十倍、Executor 堆外内存被 Python 进程吃光怎么排查 → 能用内置函数就不用 UDF，Python 灵活性与性能的取舍
- 好题：一个 PySpark 任务用了几个 Python UDF 做字符串处理，比纯 SQL 版本慢十倍且经常堆外 OOM，你会怎么改？改完怎么验证语义没变？
- 危险信号：所有逻辑都写 UDF；不知道 Python worker 是独立进程占堆外内存；没听过 Arrow
- 期望信号：优先用内置函数与 SQL 表达式；必须用 UDF 时改为 pandas UDF 并调 Arrow batch 大小；给 Python worker 配置内存上限

## 好题 / 坏题对比

- 坏：Spark 数据倾斜有哪些解决方法？
- 好：两张大表 join，一张表 5% 的 key 占 60% 数据、广播不了，你怎么确认倾斜 key、怎么处理、加盐后对侧表膨胀怎么控制？AQE 的 skew join 在这里能不能替代手工处理？

- 坏：Spark 内存模型是怎样的？
- 好：任务报 Container killed by YARN 但 executor.memory 已经很大，为什么还会超？如果是 PySpark 任务，你会先查什么？

- 坏：Structured Streaming 怎么保证 exactly-once？
- 好：流任务重启后 Kafka 数据被重复写入下游 MySQL 一次，checkpoint 明明开了，问题出在哪一段？怎么改 sink 才能真正端到端一次？

## 项目结合钩子

- 简历出现"Spark 调优 / 性能提升 X 倍" → 追优化前后耗时、Spark UI 上看到的瓶颈、改了哪个参数或逻辑、副作用
- 简历出现数据倾斜处理 → 追怎么发现的、倾斜 key 是什么、用了什么方法、膨胀了多少
- 简历出现 Structured Streaming / 实时任务 → 追延迟要求、状态大小、watermark、重启后一致性
- 简历出现 Spark + Hive 数仓 → 追写入方式、小文件治理、动态分区数量、下游读取一致性
- 简历出现 PySpark → 追 UDF 性能问题、pandas UDF 与 Arrow、堆外内存配置
- 简历出现 Spark + Kafka → 追 offset 管理、消费延迟、反压
- 简历出现 Spark on K8s / 平台建设 → 追资源隔离、动态分配、Shuffle 存储方案
- 简历同时出现 Flink → 追为什么这个场景选 Spark 或 Flink、选型依据的具体指标
- 简历出现湖仓表（Iceberg / Hudi / Paimon）+ Spark → 追写入的原子性、小文件与快照清理、Spark 与其他引擎并发写的冲突处理
- 简历出现"任务稳定性治理 / 失败率下降" → 追失败的主要类型（OOM、Shuffle 失败、依赖延迟）各占多少、分别怎么治的

## 出题原则

- 每道题从 Spark UI 或报错现象切入，考"看什么、怎么确认、改什么、副作用是什么"四步，不考参数名默写。
- 优先追候选人自己踩过的坑而不是通用知识：让他复述一次具体事故的排查过程，中途打断问"那一步你看的是哪个指标"。
- 候选人说"调了参数"必须追它改变了执行计划的哪一步；说"用了某方法"必须追怎么确认适用。
- 数据规模决定答案：GB 级任务不该谈复杂的倾斜处理，TB 级以上必须谈 Shuffle 与资源；先问清规模再评判。
- Spark 与 Flink 选型题不设标准答案，看候选人是否从延迟、状态、团队栈、运维成本给出依据。
