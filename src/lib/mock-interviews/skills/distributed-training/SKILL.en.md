---
name: distributed-training
description: Distributed training deep dive on parallelism, ZeRO/FSDP, comm overlap, MFU, checkpoints, failures, RL training systems.
keywords: [distributed training, megatron, deepspeed, zero, fsdp, tensor parallelism, pipeline parallelism, sequence parallelism, mfu, checkpoint, mixed precision, training stability, loss spikes, rl training systems, rollout]
layer: detail
domains: [ai-infra, ai-algorithm]
---

## What interviewers care about

This pack is a systems deep dive on the training side: getting a model to train across dozens to thousands of GPUs, training stably, and keeping the hardware busy. Interviewers compute MFU, communication share, and checkpoint recovery time, and press on the timelines of real failures such as slow nodes, dropped GPUs, and loss spikes. 2026 adds one more area: systems for RL post-training (separating rollout from training, syncing weights between the inference engine and the training framework) have become routine for large-model teams.

## Probing projects and internships

When the resume shows experience like the following, this is where to start and what to press on. An answer is solid only when the candidate can state the mechanism, where the numbers came from, and one real failure or tradeoff. If they offer only framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume mentions thousand-GPU training / Megatron / DeepSpeed → press on the parallelism configuration and its rationale, MFU, communication share, checkpoint interval and recovery time
- Resume mentions FSDP / ZeRO → press on which stage was used, how much memory it saved, and how much extra communication it added
- Resume mentions training incidents → press on how loss spikes, dropped GPUs, and NCCL timeouts were detected and handled, and what was changed afterward
- Resume mentions mixed precision → press on BF16 versus FP16, how overflow is handled, and which layers keep higher precision
- Resume mentions an RL training system → press on how rollout runs, how weights sync to the inference engine, and where the throughput bottleneck is
- Resume says "training sped up X%" → press on the baseline, the measurement conditions, and whether it is throughput or convergence speed

## Common failures and red flags

- Choosing a parallelism strategy: can only recite names; cannot state each parallelism's communication volume and where it fits; copies configurations
- ZeRO and FSDP: cannot say what each of the three stages shards; does not know the cost of trading communication for memory
- Communication and overlap: does not know the communication share; has never done overlap
- MFU and performance analysis: does not know MFU; cannot find the training bottleneck from a profiler
- Checkpoints and failure recovery: interval is a guess; synchronous writes block training; can only rerun after a dropped GPU
- Mixed precision and numerical stability: answers loss spikes only with "lower the learning rate"; does not know overflow and gradient clipping
- Data pipeline and IO: does not know whether training is waiting on data; unclear on how shuffle and packing affect training
- RL training systems: does not know rollout is the main cost; syncs weights by restarting

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed here, as a reference for "how deep counts as grounded". Which topics to ask and how many is decided by this JD and this resume, not by a quota.

### Training stability and parallelism basics
- Ladder: the troubleshooting order when loss does not decrease or goes NaN → mixed-precision (BF16 / FP16) overflow, gradient clipping, the relationship between learning rate and batch size → what bottleneck data, tensor, pipeline, and sequence parallelism each solve; the three stages of ZeRO → failures in thousand-GPU training (slow nodes, dropped GPUs, communication) and checkpoint strategy
- Signs of a solid answer: has a troubleshooting checklist (check data first, then lr, then precision); can state each parallelism's communication volume and where it fits; knows the tradeoff between checkpoint frequency and recovery time

### Choosing a parallelism strategy
- Ladder: what data, tensor, pipeline, sequence, and expert parallelism each split and where communication happens → why tensor parallelism generally does not cross nodes, and how to reduce pipeline bubbles → how to set the parallelism degrees for a given model size and GPU count; how to balance memory, communication, and bubbles → the extra demands MoE and long-sequence training place on parallelism
- Signs of a solid answer: can give a parallelism configuration for a model of some size and the reasoning; can compute communication volume; knows the failure conditions of each parallelism

### ZeRO and FSDP
- Ladder: how much memory each of the optimizer state, gradient, and parameter sharding stages saves and how much communication each adds → when FSDP shards and regathers; combining with tensor parallelism → how to tell communication from regathering when memory is enough but speed is slow → at what scale ZeRO is enough and when model parallelism becomes necessary
- Signs of a solid answer: can compute the memory saved at each of the three stages; knows the cost of trading communication for memory; has experience or a reasoned walk-through of combined use

### Overlapping communication and computation
- Ladder: how much of a training step is communication and why it becomes the bottleneck → how gradient bucketing, async all-reduce, and pipeline parallelism's 1F1B each achieve overlap → how to investigate when it is still slow after overlap (bandwidth, topology, slow nodes) → how network topology (NVLink, IB, cross-node) affects the choice of parallelism
- Signs of a solid answer: has a communication-share number; knows how overlap is implemented; can state how topology affects configuration

### MFU and training performance analysis
- Ladder: how MFU is computed and why thousand-GPU training often sits around 40% → where the time in a training step goes, computation, communication, data, or synchronization → the order for locating a training bottleneck from a profiler → common ways to raise MFU and the cost of each (activation recomputation, fusion, larger batch)
- Signs of a solid answer: can compute MFU; has been through one training performance analysis; knows the cost of each method

### Checkpoints and failure recovery
- Ladder: what a checkpoint stores, how often to save, and why synchronous writes block training → what async, sharded, and incremental writes each solve → how dropped GPUs, slow nodes, and NCCL timeouts show up and how to detect and replace them automatically → how to balance recovery time against lost training progress; elastic training
- Signs of a solid answer: has a rationale for the checkpoint strategy; has an approach for async writes; has the timeline of one failure and the follow-up improvements

### Data pipeline and IO
- Ladder: why training waits on data → whether tokenization, packing, and shuffling happen offline or online; parallelism and prefetching in data loading → how data order affects training; how data is aligned when resuming from a checkpoint → storage bandwidth, formats (sharded, columnar), and cost
- Signs of a solid answer: knows how to measure data wait; has an approach for data alignment on resume; has a case of handling an IO bottleneck

### RL training systems
- Ladder: why RL post-training systems differ from pretraining, namely online generation (rollout) → rollout uses an inference engine and training uses a training framework, so how weights sync and how often → how rollout and training run in parallel, where the throughput bottleneck is, and how long responses are handled → where reward computation (graders, reward models) lives and how it scales
- Signs of a solid answer: knows rollout is the main cost; weight sync has an approach and a frequency; can state the throughput bottleneck and how it is handled
