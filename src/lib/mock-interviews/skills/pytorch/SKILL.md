---
name: pytorch
description: PyTorch 怎么面：自动求导、训练循环、数据管道、分布式训练、混合精度。JD 点名 PyTorch 时读。
keywords: [pytorch, torch, autograd, ddp, fsdp, 分布式训练, 混合精度, amp, dataloader, torch.compile, profiler, cuda, onnx, 深度学习框架, 训练框架]
layer: detail
domains: [algorithm, ai-algorithm, ai-infra]
---

## 面试官在意什么

PyTorch 是深度学习与大模型训练的默认框架，凡是简历上写"深度学习""模型训练""大模型微调"的候选人几乎都要过这一关。真实面试里 PyTorch 题分两档：一档是"会不会用"——张量操作、autograd、写训练循环、DataLoader；另一档是"能不能把训练跑快跑稳"——GPU 利用率低怎么查、显存 OOM 怎么省、多卡训练怎么配、loss 出 NaN 怎么办。面试官最在意的是候选人是否真正踩过坑：eval 忘了 no_grad、DDP 各卡 loss 不同步、DataLoader 成为瓶颈、混合精度溢出——这些都是能把"跟着教程跑过"和"独立训练过模型"区分开的点。

校招侧重基础机制：计算图怎么建、backward 做了什么、in-place 操作为什么会报错、train/eval 模式区别、手写一个完整训练循环；社招侧重工程效率：性能剖析、分布式训练（DDP/FSDP）、显存优化（checkpointing、混合精度、优化器状态分片）、torch.compile 的收益与坑、模型导出与推理部署。大模型方向额外追 FSDP 分片策略、序列并行、长序列训练的显存账。

怎么问才像这个方向的面试官：
- 所有题都从一个异常现象切入（NaN、OOM、hang、慢、结果不一致），考排查顺序与原理，不考 API 拼写。
- 必须问显存账和吞吐数字：候选人说"优化了训练"，追优化前后的具体数值和测量方法。
- 规模要与候选人项目匹配：单卡跑 ResNet 的候选人不问 FSDP 分片策略，训过 7B 以上模型的必须追分布式细节。
- torch.compile、FSDP2 等新特性只考"用过的坑"，不考版本差异。

## 项目 / 实习怎么深挖

简历上出现下面这类经历时从哪里切、追什么。追到候选人能说出机制、数字的来源与一次真实的故障或取舍才算实；只有框架名与结论、说不出自己那一段的，记为危险信号。通用的追问方法见 project-deep-dive。

- 简历出现"训练 X 模型" → 追多少卡、多久、GPU 利用率多少、遇到的最大工程问题
- 简历出现 DDP / FSDP / DeepSpeed → 追分片策略、通信瓶颈、显存账、出过什么 hang 或不一致
- 简历出现"显存优化 / 大 batch" → 追用了什么手段、速度代价、怎么验证效果不变
- 简历出现混合精度 → 追 FP16 还是 BF16、有没有 NaN、哪些层保留 FP32
- 简历出现"训练加速 X 倍" → 追优化前后 profiler 数据、瓶颈在哪、改了什么
- 简历出现模型部署 / ONNX / TensorRT → 追导出遇到的算子问题、精度对比、延迟数据
- 简历出现自定义算子 / CUDA / Triton → 追为什么不用内置实现、梯度怎么验证、收益数字

## 常见失守与危险信号

- 张量与自动求导：认为 with no_grad 只是省显存；分不清 detach 与 requires_grad_(False)；不知道 retain_graph
- 模块与训练循环：写训练循环忘记 optimizer.zero_grad 或顺序错；不知道 BatchNorm 在 eval 用的是移动平均
- 数据管道与 DataLoader：只会调大 num_workers；不知道 worker 进程里随机种子问题；把大文件全读进每个 worker 内存
- 混合精度训练：不知道 GradScaler 的作用；认为 BF16 和 FP16 只是精度不同没有范围差异
- 分布式训练（DDP / FSDP）：忘了 DistributedSampler 的 set_epoch；把 DDP 当成自动把模型切开；不知道各卡必须执行相同的集合通信次数
- 显存优化：只会减 batch size；不知道优化器状态占大头；把 loss 累加进 list 导致泄漏
- 性能剖析与 torch.compile：没用过 profiler；不知道 CUDA 是异步执行、计时要 synchronize；认为 compile 是万能加速
- 模型保存、加载与可复现：只存 model.state_dict；不知道 strict=False 会静默忽略缺失 key
- 部署导出与推理：不知道导出时 batch 维度要设动态；不做导出前后的数值对比
- 自定义算子与 CUDA 交互（进阶）：不知道 scaled_dot_product_attention 已内置融合实现；一上来就手写 CUDA
- 张量操作、广播与内存布局：分不清 view 与 copy；不知道广播会隐式扩展出大张量；用 Python for 循环逐样本处理
- 优化器与学习率调度：只知道 Adam 默认参数；weight decay 应用在 LayerNorm 和 bias 上不觉得有问题；scheduler.step 放错位置
- 参数高效微调的框架实现：认为冻结参数就不占激活显存；不知道优化器只对 requires_grad 的参数建状态；adapter 保存时把基座权重也存了一遍

## 常考主题清单

只列名字、阶梯与答实的标志，作"问到哪一层算实"的参考；问哪些、问几道由这份 JD 与这份简历定，不是配额。

### 张量与自动求导
- 阶梯：requires_grad、grad_fn、叶子节点是什么 → 动态计算图怎么构建与释放，backward 后为什么图默认被销毁 → in-place 操作导致 "modified by an inplace operation" 报错、detach 与 clone 用错导致梯度断掉怎么排查 → 什么时候该用 torch.no_grad、inference_mode，自定义 autograd.Function 的必要性
- 答实的标志：能说出计算图节点与版本计数器；知道 anomaly detection 定位；理解 leaf tensor 的 grad 累加需要 zero_grad

### 模块与训练循环
- 阶梯：nn.Module 的参数注册与 state_dict → forward 与 __call__ 的关系、hook 机制、Parameter 与 Buffer 差异 → 模型 eval 效果异常（忘了 model.eval、BatchNorm 统计量、Dropout）怎么排查 → 训练循环里梯度累积、梯度裁剪、学习率调度的顺序为什么重要
- 答实的标志：能默写正确顺序（zero_grad → forward → loss → backward → clip → step → scheduler.step）；理解梯度累积时 loss 要除以累积步数；用 hook 抓中间层输出调试

### 数据管道与 DataLoader
- 阶梯：Dataset 与 DataLoader 各做什么 → num_workers、pin_memory、prefetch、collate_fn 的作用 → GPU 利用率只有 30%、每个 epoch 开头卡顿怎么定位数据瓶颈 → 预处理放 CPU 还是 GPU，在线增强与离线缓存的取舍
- 答实的标志：用 profiler 或简单计时区分数据与计算时间；persistent_workers、内存映射、预解码；worker_init_fn 处理随机性

### 混合精度训练
- 阶梯：为什么 FP16/BF16 能加速 → autocast 与 GradScaler 分别解决什么，BF16 为什么不需要 scaler → 混合精度下 loss 变 NaN 或效果下降怎么排查（溢出、某些算子不适合半精度、loss scale 动态调整）→ FP16 vs BF16 的选择，哪些层强制保留 FP32
- 答实的标志：理解 FP16 动态范围小需要 loss scaling；softmax、layernorm、loss 计算保留 FP32；检查 scaler 的 scale 值变化

### 分布式训练（DDP / FSDP）
- 阶梯：DataParallel 为什么不推荐、DDP 怎么工作 → 梯度 all-reduce 与计算的重叠、bucket 机制、DistributedSampler 的作用 → 多卡 loss 不一致、某张卡 hang 住、NCCL 超时怎么排查 → DDP 与 FSDP 的选择：模型多大该分片、分片策略与通信量的权衡
- 答实的标志：理解每张卡完整副本 + 梯度同步；条件分支导致通信次数不一致会 hang；知道 FSDP 把参数、梯度、优化器状态分片，通信换显存

### 显存优化
- 阶梯：显存被谁占了（参数、梯度、优化器状态、激活）→ 各部分怎么估算，Adam 为什么占参数的两倍 → OOM 排查：是激活太大、batch 太大、显存碎片还是泄漏（tensor 被 list 引用）→ activation checkpointing、优化器状态分片、CPU offload 的速度代价
- 答实的标志：能算参数 + 梯度 + 优化器 ≈ 16 字节/参数；激活与序列长度、batch 的关系；checkpointing 用约 30% 计算换显存

### 性能剖析与 torch.compile
- 阶梯：怎么知道训练慢在哪 → torch.profiler 看 kernel、CPU 开销、同步点，为什么 .item() 和 print 会拖慢 → GPU 空闲多但数据不是瓶颈时怎么找（小 kernel 过多、CPU launch 开销、同步）→ torch.compile 的收益边界：graph break、重编译、动态 shape 的坑
- 答实的标志：识别同步点；用 CUDA graphs 或 compile 减少 launch 开销；知道动态 shape 与 Python 分支会触发重编译；先 compile 子模块

### 模型保存、加载与可复现
- 阶梯：state_dict 与整个模型保存的区别 → 优化器、scheduler、scaler、随机状态要一起存才能续训 → 加载后效果不对（key 不匹配、DDP 的 module. 前缀、设备映射）怎么排查 → 完全可复现的代价（确定性算子慢），什么程度的可复现够用
- 答实的标志：完整 checkpoint 内容；map_location；DataLoader 的随机状态与 epoch 位置

### 部署导出与推理
- 阶梯：训练模型怎么给线上用 → ONNX 导出、TorchScript / torch.export 的差异，动态轴 → 导出后精度不一致或某算子不支持怎么处理 → 直接用 PyTorch 推理 vs 转 TensorRT 的收益与维护成本
- 答实的标志：逐层输出对比；检查 eval 模式与 tracing 的控制流问题；量化后回归测试

### 自定义算子与 CUDA 交互（进阶）
- 阶梯：什么时候需要自定义算子 → torch.autograd.Function 与 C++/CUDA 扩展、Triton 的定位 → 自定义算子在 compile / AMP / DDP 下不兼容怎么办 → 手写算子的收益与维护成本，先用 fused 现成实现
- 答实的标志：优先用内置融合算子；自定义算子要写反向并做梯度检查（gradcheck）

### 张量操作、广播与内存布局
- 阶梯：view 与 reshape、squeeze 与 unsqueeze 的区别 → 广播规则、contiguous 与 stride 的含义，transpose 后为什么 view 会报错 → 一个看似简单的索引操作把显存翻倍、或 gather/scatter 用错导致梯度不对怎么排查 → 显式循环改成向量化的收益边界，可读性与性能的取舍
- 答实的标志：理解 stride 与 contiguous；知道 expand 不复制而 repeat 复制；用 einsum 或批量矩阵乘替代循环；对中间张量的形状与显存有估算

### 优化器与学习率调度
- 阶梯：SGD、Adam、AdamW 的差异，weight decay 为什么在 AdamW 里要解耦 → 学习率 warmup 与 cosine 衰减的作用，参数分组（不同层不同学习率、bias 与 norm 不做 decay）→ 训练前期发散、后期停滞、恢复训练后学习率跳变各怎么定位 → 大 batch 下学习率线性缩放的适用边界，优化器状态对显存的影响
- 答实的标志：分层学习率与 decay 分组；warmup 缓解早期不稳定；理解 Adam 二阶动量对显存与恢复训练的影响；用固定种子多次运行比较

### 参数高效微调的框架实现
- 阶梯：冻结参数怎么做，requires_grad 与优化器参数列表的关系 → LoRA 在框架层面是怎么实现的（替换或包裹 Linear、旁路矩阵、合并权重）→ 冻结大部分参数后显存没降多少、adapter 保存后加载效果不对、和 gradient checkpointing 一起用报错怎么排查 → 只存 adapter 与合并回基座的取舍，多个 adapter 切换的服务设计
- 答实的标志：能算出激活与冻结参数本身仍占显存；理解 checkpointing 要求输入有梯度的坑；合并权重后推理零开销；知道 QLoRA 把基座量化后的收益
