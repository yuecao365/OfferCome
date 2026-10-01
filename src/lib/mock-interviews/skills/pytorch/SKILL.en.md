---
name: pytorch
description: PyTorch interviews covering autograd, training loops, data pipelines, distributed training, AMP. Read when the JD names PyTorch.
keywords: [pytorch, torch, autograd, ddp, fsdp, distributed training, mixed precision, amp, dataloader, torch.compile, profiler, cuda, onnx, deep learning framework, training framework]
layer: detail
domains: [algorithm, ai-algorithm, ai-infra]
---

## What interviewers care about

PyTorch is the default framework for deep learning and large-model training, and almost every candidate who writes "deep learning", "model training" or "LLM fine-tuning" on a resume has to get through this. In real interviews PyTorch questions come in two tiers: one is "can you use it" (tensor operations, autograd, writing a training loop, DataLoader); the other is "can you make training fast and stable" (how to investigate low GPU utilization, how to save memory on an OOM, how to configure multi-GPU training, what to do when the loss goes NaN). What interviewers care about most is whether the candidate has actually hit the pitfalls: forgetting no_grad in eval, DDP losses out of sync across GPUs, DataLoader becoming the bottleneck, mixed-precision overflow. These are what separate "ran a tutorial" from "trained a model independently".

For campus hires, focus on basic mechanics: how the computation graph is built, what backward does, why in-place operations raise errors, the difference between train and eval modes, and hand-writing a complete training loop. For experienced hires, focus on engineering efficiency: performance profiling, distributed training (DDP/FSDP), memory optimization (checkpointing, mixed precision, optimizer-state sharding), the benefits and pitfalls of torch.compile, and model export and inference deployment. For the large-model track, additionally probe FSDP sharding strategy, sequence parallelism, and the memory budget for long-sequence training.

How to ask like an interviewer in this field:
- Start every question from an anomaly (NaN, OOM, hang, slowness, inconsistent results) and test the order of investigation and the underlying principles, not API spelling.
- Always ask for the memory budget and throughput numbers: when a candidate says they "optimized training", press for the concrete before and after values and how they were measured.
- Match scale to the candidate's project: do not ask FSDP sharding strategy of someone who ran ResNet on a single GPU; anyone who has trained a model of 7B or above must be pressed on distributed details.
- For new features such as torch.compile and FSDP2, ask only about pitfalls they have actually run into, not version differences.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows "trained X model" → probe how many GPUs, how long, what the GPU utilization was, and the biggest engineering problem they hit
- Resume shows DDP / FSDP / DeepSpeed → probe the sharding strategy, communication bottlenecks, the memory budget, and any hangs or inconsistencies they hit
- Resume shows "memory optimization / large batch" → probe which techniques were used, the speed cost, and how they verified results were unchanged
- Resume shows mixed precision → probe FP16 or BF16, whether NaN occurred, and which layers were kept in FP32
- Resume shows "training sped up X times" → probe the profiler data before and after, where the bottleneck was, and what was changed
- Resume shows model deployment / ONNX / TensorRT → probe operator problems during export, accuracy comparison, and latency data
- Resume shows custom operators / CUDA / Triton → probe why the built-in implementation was not used, how gradients were verified, and the gain in numbers

## Common failures and red flags

- Tensors and autograd: believes with no_grad only saves memory; cannot tell detach from requires_grad_(False); does not know retain_graph
- Modules and the training loop: forgets optimizer.zero_grad or gets the order wrong in a training loop; does not know BatchNorm uses moving averages in eval
- Data pipeline and DataLoader: only knows to raise num_workers; does not know about the random seed problem inside worker processes; reads a large file entirely into every worker's memory
- Mixed-precision training: does not know what GradScaler does; believes BF16 and FP16 differ only in precision and not in range
- Distributed training (DDP / FSDP): forgets set_epoch on DistributedSampler; treats DDP as automatically splitting the model; does not know every GPU must execute the same number of collective communications
- Memory optimization: only knows to reduce batch size; does not know optimizer state takes the biggest share; accumulates loss into a list and causes a leak
- Performance profiling and torch.compile: has never used the profiler; does not know CUDA executes asynchronously and timing requires synchronize; believes compile is a universal speedup
- Model saving, loading and reproducibility: saves only model.state_dict; does not know strict=False silently ignores missing keys
- Deployment export and inference: does not know the batch dimension must be made dynamic on export; does no numerical comparison before and after export
- Custom operators and CUDA interaction (advanced): does not know scaled_dot_product_attention already has a built-in fused implementation; starts by hand-writing CUDA
- Tensor operations, broadcasting and memory layout: cannot tell view from copy; does not know broadcasting implicitly expands into a large tensor; processes samples one at a time with a Python for loop
- Optimizers and learning-rate scheduling: only knows Adam's defaults; sees no problem applying weight decay to LayerNorm and bias; puts scheduler.step in the wrong place
- Framework implementation of parameter-efficient fine-tuning: believes freezing parameters means no activation memory; does not know the optimizer builds state only for parameters with requires_grad; saves the base weights again when saving the adapter

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for how deep a solid answer goes; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Tensors and autograd
- Ladder: requires_grad, grad_fn, what a leaf node is → how the dynamic computation graph is built and freed, and why the graph is destroyed by default after backward → diagnosing the "modified by an inplace operation" error, and gradients cut off by misusing detach and clone → when to use torch.no_grad and inference_mode, and whether a custom autograd.Function is necessary
- Signs of a solid answer: can describe graph nodes and the version counter; knows to locate problems with anomaly detection; understands that grad on a leaf tensor accumulates and needs zero_grad

### Modules and the training loop
- Ladder: parameter registration and state_dict in nn.Module → the relationship between forward and __call__, the hook mechanism, Parameter versus Buffer → diagnosing odd results in eval (forgot model.eval, BatchNorm statistics, Dropout) → why the order of gradient accumulation, gradient clipping and learning-rate scheduling in the training loop matters
- Signs of a solid answer: can write the correct order from memory (zero_grad → forward → loss → backward → clip → step → scheduler.step); understands that loss must be divided by the accumulation steps during gradient accumulation; uses hooks to capture intermediate-layer outputs for debugging

### Data pipeline and DataLoader
- Ladder: what Dataset and DataLoader each do → the roles of num_workers, pin_memory, prefetch and collate_fn → locating the data bottleneck when GPU utilization is only 30% or there is a stall at the start of every epoch → preprocessing on CPU or GPU, the trade-off between online augmentation and offline caching
- Signs of a solid answer: separates data time from compute time with the profiler or simple timing; persistent_workers, memory mapping, pre-decoding; worker_init_fn to handle randomness

### Mixed-precision training
- Ladder: why FP16/BF16 speeds things up → what autocast and GradScaler each solve, and why BF16 does not need a scaler → diagnosing a loss that goes NaN or degrades under mixed precision (overflow, operators unsuited to half precision, dynamic loss-scale adjustment) → choosing between FP16 and BF16, which layers are forced to stay in FP32
- Signs of a solid answer: understands FP16's small dynamic range needs loss scaling; keeps softmax, layernorm and loss computation in FP32; checks how the scaler's scale value changes

### Distributed training (DDP / FSDP)
- Ladder: why DataParallel is not recommended and how DDP works → overlap of gradient all-reduce with computation, the bucket mechanism, the role of DistributedSampler → diagnosing inconsistent losses across GPUs, one GPU hanging, NCCL timeouts → choosing between DDP and FSDP: how large a model should be sharded, the trade-off between sharding strategy and communication volume
- Signs of a solid answer: understands each GPU holds a full replica plus gradient sync; knows that conditional branches causing mismatched communication counts will hang; knows FSDP shards parameters, gradients and optimizer state, trading communication for memory

### Memory optimization
- Ladder: who is using the memory (parameters, gradients, optimizer state, activations) → how to estimate each part, and why Adam takes twice the parameters → diagnosing OOM: are activations too large, batch too large, memory fragmented, or leaked (a tensor referenced by a list) → activation checkpointing, optimizer-state sharding, and the speed cost of CPU offload
- Signs of a solid answer: can compute parameters + gradients + optimizer ≈ 16 bytes per parameter; the relationship of activations to sequence length and batch; checkpointing trades about 30% extra compute for memory

### Performance profiling and torch.compile
- Ladder: how do you know where training is slow → torch.profiler for kernels, CPU overhead and sync points, and why .item() and print slow things down → how to find the cause when the GPU is often idle but data is not the bottleneck (too many small kernels, CPU launch overhead, synchronization) → where torch.compile's benefit ends: graph breaks, recompilation, dynamic-shape pitfalls
- Signs of a solid answer: spots sync points; uses CUDA graphs or compile to cut launch overhead; knows dynamic shapes and Python branches trigger recompilation; compiles submodules first

### Model saving, loading and reproducibility
- Ladder: the difference between saving state_dict and saving the whole model → optimizer, scheduler, scaler and random state must be saved together to resume training → diagnosing bad results after loading (mismatched keys, the DDP module. prefix, device mapping) → the cost of full reproducibility (deterministic operators are slow), and what level of reproducibility is enough
- Signs of a solid answer: the full contents of a checkpoint; map_location; DataLoader random state and epoch position

### Deployment export and inference
- Ladder: how a trained model is made available online → ONNX export, the differences between TorchScript and torch.export, dynamic axes → what to do when accuracy differs after export or an operator is unsupported → the benefit and maintenance cost of running PyTorch directly versus converting to TensorRT
- Signs of a solid answer: layer-by-layer output comparison; checks eval mode and tracing control-flow problems; regression tests after quantization

### Custom operators and CUDA interaction (advanced)
- Ladder: when a custom operator is needed → torch.autograd.Function and C++/CUDA extensions, where Triton fits → what to do when a custom operator is incompatible with compile / AMP / DDP → the benefit and maintenance cost of hand-written operators, and using an existing fused implementation first
- Signs of a solid answer: prefers built-in fused operators; a custom operator needs a backward and a gradient check (gradcheck)

### Tensor operations, broadcasting and memory layout
- Ladder: the difference between view and reshape, squeeze and unsqueeze → broadcasting rules, what contiguous and stride mean, and why view errors after transpose → diagnosing a seemingly simple indexing operation that doubles memory, or gather/scatter misuse that makes gradients wrong → where the benefit of turning explicit loops into vectorized code ends, the trade-off between readability and performance
- Signs of a solid answer: understands stride and contiguous; knows expand does not copy while repeat does; replaces loops with einsum or batched matrix multiplication; can estimate the shapes and memory of intermediate tensors

### Optimizers and learning-rate scheduling
- Ladder: the differences among SGD, Adam and AdamW, and why weight decay must be decoupled in AdamW → the roles of learning-rate warmup and cosine decay, parameter groups (different learning rates per layer, no decay on bias and norm) → how to locate divergence early in training, stagnation late in training, and a learning-rate jump after resuming training → the limits of linear learning-rate scaling with large batches, the effect of optimizer state on memory
- Signs of a solid answer: layer-wise learning rates and decay groups; warmup eases early instability; understands the effect of Adam's second moment on memory and on resuming training; compares multiple runs with fixed seeds

### Framework implementation of parameter-efficient fine-tuning
- Ladder: how to freeze parameters, and how requires_grad relates to the optimizer's parameter list → how LoRA is implemented at the framework level (replacing or wrapping Linear, side-path matrices, merging weights) → diagnosing memory that barely dropped after freezing most parameters, an adapter that gives wrong results after saving and loading, and errors when used with gradient checkpointing → saving only the adapter versus merging it back into the base, and serving design for switching among multiple adapters
- Signs of a solid answer: can work out that activations and the frozen parameters themselves still take memory; understands the pitfall that checkpointing requires inputs to have gradients; merged weights give zero inference overhead; knows the benefit of QLoRA quantizing the base
