---
name: gpu-kernels
description: GPU 算子深挖：CUDA、访存、roofline、FlashAttention、融合、profiler、量化、通信。
keywords: [cuda, kernel, 算子, triton, flashattention, gpu 架构, 共享内存, roofline, nsys, profiler, 算子融合, torch.compile, nccl, 量化内核, fp8]
layer: detail
domains: [ai-infra]
---

## 面试官在意什么

这本是 ai-infra 里最底层的一段：算子怎么写、怎么量、怎么知道该不该自己写。面试官要候选人能读 profiler 的时间线、用 roofline 说清一个 kernel 是算力密集还是带宽密集、讲出 FlashAttention 省的是什么、写过至少一个 kernel 并有前后数字。校招考 CUDA 编程模型与手撕分块 softmax，社招考实测优化案例与什么 shape 下反而变慢。

## 项目 / 实习怎么深挖

简历上出现下面这类经历时从哪里切、追什么。追到候选人能说出机制、数字的来源与一次真实的故障或取舍才算实；只有框架名与结论、说不出自己那一段的，记为危险信号。通用的追问方法见 project-deep-dive。

- 简历出现 CUDA / Triton 算子 → 追替代了哪个算子、瓶颈是算力还是带宽、用了什么手段、profiler 前后对比、哪些 shape 反而变慢
- 简历出现 FlashAttention / 自定义 attention → 追分块与在线 softmax 怎么实现、显存与速度各省多少、和官方实现比
- 简历出现算子融合 / torch.compile → 追融合了什么、消除了什么开销、编译时间与失败回退
- 简历出现量化内核 → 追数据格式、反量化放在哪、精度与速度的实测
- 简历出现 NCCL / 通信优化 → 追通信量、重叠怎么做、掉卡与超时怎么定位
- 简历出现"性能提升 X 倍" → 追基线、测量条件、是 kernel 时间还是端到端时间

## 常见失守与危险信号

- CUDA 执行模型：说不清 warp 与线程块；不知道 occupancy 是什么
- 内存层次与访存：不知道合并访存与 bank conflict；把所有慢归结为"算力不够"
- roofline 与瓶颈判断：不会算算力与带宽比；不知道 decode 为什么带宽密集
- FlashAttention：只会说"更快"；说不出省的是显存读写不是计算
- 算子融合与编译：不知道融合消除的是什么开销；编译失败不知道怎么回退
- profiler：不用 nsys / torch profiler；GPU 利用率低只会"加 batch"
- 量化内核：不知道反量化放在哪、什么时候反而变慢
- 通信算子：不知道 all-reduce 与 all-to-all 的差别；掉卡只会重跑

## 常考主题清单

只列名字、阶梯与答实的标志，作"问到哪一层算实"的参考；问哪些、问几道由这份 JD 与这份简历定，不是配额。

### CUDA 执行模型
- 阶梯：grid / block / warp / 线程的层次与调度 → SM、occupancy、寄存器与共享内存对并发的限制 → 一个 kernel 占用率高但性能差怎么查（访存、分支发散、同步）→ 什么任务适合 GPU、什么任务放 CPU 更快
- 答实的标志：能画出执行层次；知道 occupancy 的计算与限制因素；有分支发散或同步导致性能差的案例

### 内存层次与访存模式
- 阶梯：寄存器、共享内存、L1/L2、HBM 的带宽与延迟差多少 → 合并访存、bank conflict、对齐对性能的影响 → 一个访存密集 kernel 怎么改：分块、复用、向量化加载 → 数据布局（行主序、转置、padding）对访存的影响
- 答实的标志：能说出各层带宽量级；知道 bank conflict 的成因与避免；有一次访存优化的前后数字

### roofline 与瓶颈判断
- 阶梯：算力峰值、带宽峰值、算术强度三个量怎么算 → 一个算子落在 roofline 哪一侧决定优化方向 → prefill 与 decode、大 batch 与小 batch 各落在哪 → 达到 roofline 后还能怎么优化（减少字节数、改精度、融合）
- 答实的标志：能算一个 GEMM 或 attention 的算术强度；能用 roofline 解释一次优化有效或无效

### FlashAttention 与注意力算子
- 阶梯：标准 attention 的显存与访存问题在哪 → 分块 + 在线 softmax 怎么避免写出 N×N 矩阵；反向为什么要重算 → 变长序列、因果掩码、GQA 对实现的影响；decode 阶段的 attention 为什么另写 → 和官方实现的差距怎么量、什么 shape 下不如 naive
- 答实的标志：能讲清在线 softmax 的递推；知道正向反向的显存与计算取舍；有实测对比

### 算子融合与编译
- 阶梯：融合消除什么开销（kernel launch、中间结果读写）→ 逐点算子、归约、GEMM 尾部融合各怎么做 → torch.compile / Triton / 手写 CUDA 各在什么情况下值得；编译失败与回退 → 融合对数值精度与调试的影响
- 答实的标志：能说出融合前后的访存量变化；知道编译工具的边界；有编译失败回退的处理

### 性能剖析方法
- 阶梯：先看什么：时间线里的空洞、kernel 时长分布、CPU 与 GPU 的等待 → nsys、torch profiler、ncu 各看什么层次 → GPU 利用率低的常见原因排序（数据加载、CPU 调度、launch 开销、同步）→ CUDA Graph 消除什么、什么时候不能用
- 答实的标志：能读时间线并指出空洞；有一次从 profiler 找到根因的经历；知道 CUDA Graph 的限制

### 量化内核与数值精度
- 阶梯：FP16 / BF16 / FP8 / INT8 / INT4 的表示范围与误差 → 权重量化的反量化放在 kernel 哪一步、为什么小 batch 下量化才明显加速 → 量化 kernel 在什么 shape 下反而变慢 → 精度回归怎么做、离群值怎么处理
- 答实的标志：知道各格式的取舍；能说出反量化位置对性能的影响；量化前后有评测对比

### 通信算子与多卡
- 阶梯：all-reduce、all-gather、all-to-all、reduce-scatter 各用在哪 → 通信量怎么估、带宽（NVLink、IB）怎么影响并行选择 → 通信与计算重叠怎么做 → NCCL 超时、慢节点、掉卡怎么表现与定位
- 答实的标志：能算一次张量并行的通信量；知道重叠的实现方式；有一次通信故障的定位过程
