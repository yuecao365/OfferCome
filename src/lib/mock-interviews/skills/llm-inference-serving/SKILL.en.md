---
name: llm-inference-serving
description: Deep dive on inference serving, covering speculative decoding, quantization, distributed serving, MoE, prefix caching, and capacity.
keywords: [inference serving, speculative decoding, quantization, fp8, int4, tensor parallelism, pd disaggregation, disaggregation, moe inference, expert parallel, prefix caching, constrained decoding, guided decoding, long-context inference]
layer: detail
domains: [ai-infra, ai-agent]
---

## What interviewers care about

This pack goes deeper on the inference portion of ai-infra: which mechanisms to touch to lift a model's throughput and latency another notch. Interviewers want the candidate to do the math (acceptance rate, parallel communication volume, KV transfer bandwidth, accuracy gap after quantization) and to explain failures (TTFT getting worse after PD disaggregation, uneven MoE experts, a class of requests collapsing after quantization). Application-side roles read it to know where their agent's per-turn time-to-first-token and cache hits come from.

## Probing projects and internships

When the resume shows experience like the items below, this says where to start and what to press on. An answer is solid once the candidate can state the mechanism, where their numbers came from, and one real failure or tradeoff; if they can only give framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume says speculative decoding → probe how drafts are produced, the acceptance rate, on what distributions the speedup disappears, and the conflict with batching
- Resume says quantization → probe the method and what was quantized, accuracy regression, where the kernels came from, and measured throughput
- Resume says multi-GPU / multi-node inference → probe the parallelism scheme, communication share, whether PD disaggregation was done, and behavior when a GPU drops
- Resume says MoE inference → probe expert parallelism and all-to-all, load imbalance, and how experts are laid out in GPU memory
- Resume says prefix caching / multi-turn → probe the hit rate, eviction policy, and which request patterns get low hits
- Resume says structured output / constrained decoding → probe how it is implemented, the impact on throughput, and conflicts with sampling

## Common failures and red flags

- Speculative decoding: only says "a small model guesses"; cannot say that acceptance rate determines the speedup; does not know the benefit vanishes at large batch
- Quantization and kernel optimization: knows quantization only as "smaller and faster"; does no accuracy regression; writes kernels without looking at a profiler
- Distributed inference and parallelism: cannot say where tensor parallelism communicates; does not know what PD disaggregation solves or what it costs
- Long context and GPU memory: only answers "add more memory"; does not know the tradeoff between offload and KV compression
- PD disaggregation and KV transfer: does not know how KV moves between instances or how much bandwidth it needs; does not know at what scale splitting pays off
- MoE serving: only answers "pick experts"; does not discuss all-to-all and load imbalance; does not know how experts are placed in GPU memory
- Prefix caching and multi-turn: only answers "cache the prefix"; cannot state the hit condition; does not know why the system prompt goes first
- Constrained decoding and sampling: does not know how structured output is implemented on the inference side; does not know its effect on throughput
- Capacity planning: cannot work backward from an SLO to a GPU count; has no plan for elasticity across peaks and troughs

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Speculative decoding
- Ladder: why the decode phase has room for "wasted compute" → how a draft model / n-gram / self-drafting (Medusa, EAGLE style) each produce candidates, and how verification completes in a single forward pass → the speedup is set by acceptance rate and draft length, on what distributions acceptance is low; why the benefit disappears at large batch → the memory and compute cost of verification, the conflict with continuous batching, which workloads are worth enabling it for
- Signs of a solid answer: can write the relationship between speedup and acceptance rate; knows the guarantee that the output distribution is unchanged comes from rejection sampling; has measured acceptance rates and benefit curves at different batch sizes

### Quantization and kernel optimization
- Ladder: where the difficulty of weight quantization and activation quantization differs (outliers) → what GPTQ / AWQ / SmoothQuant / FP8 each solve, the benefit of KV cache quantization → how accuracy is regression-tested after quantization (eval set, tasks, long tail), why a mismatched kernel makes it slower instead → what FlashAttention saves (tiling + online softmax reduce memory reads and writes), the limits of operator fusion gains, when to write your own kernel
- Signs of a solid answer: distinguishes PTQ from QAT; has before-and-after quantization eval comparisons; can explain FlashAttention's tiling idea; has written or read a kernel and can describe the before-and-after changes in the profiler

### Distributed inference and parallelism
- Ladder: what to split when one GPU cannot hold it: what tensor, pipeline, and expert parallelism each split and at which step they communicate → why tensor parallelism generally does not cross machines, pipeline bubbles, overlapping communication with compute → MoE routing, all-to-all overhead, uneven expert load and capacity factor; what PD disaggregation (prefill and decode on separate instances) solves, how KV is transferred, what it costs → multi-node failures: how a dropped GPU, a slow node, and an NCCL timeout show up and are located
- Signs of a solid answer: can state each parallelism's communication volume and the layers it suits; knows PD disaggregation's effect on TTFT and TPOT separately; has concrete load-balancing measures for MoE; has a timeline of a multi-node incident

### Long context and GPU memory
- Ladder: how memory and latency each grow with length for long context (attention compute versus KV storage) → what blockwise attention, sequence parallelism, and KV swap-out each solve → how long prefill takes at 128k context and how to keep the first token from waiting too long (chunked prefill, cached prefix) → the accuracy cost of KV compression and sliding windows, which workloads can accept it
- Signs of a solid answer: can compute KV and activation memory at long sequence length; knows how prefill time relates to sequence length; has measured latency and tradeoffs at long context

### PD disaggregation and KV transfer
- Ladder: why put prefill and decode on different instances: the two phases have different bottlenecks and interfere with each other → how KV is transferred from the prefill instance to the decode instance (RDMA, transfer libraries), how much bandwidth is needed, how much of the time is transfer latency → how to troubleshoot TTFT or TPOT getting worse after disaggregation; how to set the ratio between the two pools → at what scale and request distribution splitting pays off; comparison with single-instance chunked prefill
- Signs of a solid answer: can compute KV transfer volume and bandwidth requirements; knows the pool ratio is tuned by load; has a measured or reasoned comparison of splitting versus not splitting

### Serving MoE models
- Ladder: why MoE is cheap to run but hard to serve → expert-parallel routing, all-to-all communication, capacity factor and token dropping → how uneven expert load shows up and is handled; the motivation for parallelizing attention and expert layers separately → how experts are placed in GPU memory (all resident, sharded, offloaded); throughput comparison of MoE and dense models at equal compute
- Signs of a solid answer: can say where the all-to-all overhead comes from; has concrete load-balancing measures; knows what separate parallelism for attention and experts solves

### Prefix caching and multi-turn conversation
- Ladder: the hit condition for prefix caching (token-by-token identical prefix) and how it is invalidated → the difference between radix-tree management and block-level sharing; isolation under multi-tenancy → why putting the system prompt, few-shot examples, and tool definitions first matters; how to design an agent's multi-turn context so it hits the cache → how to measure hit rate, eviction policy, the actual benefit to TTFT
- Signs of a solid answer: has hit-rate numbers and ways to raise them; knows which request patterns get low hits; can say what the application side must do to cooperate

### Constrained decoding and sampling strategy
- Ladder: how structured output (JSON, schema, grammar) is implemented on the inference side (masking, state machines, compiled constraints) → the effect of constrained decoding on throughput and latency, the conflict with speculative decoding → what temperature, top-p, and repetition penalty each change and their effect on structured output → the division of labor between server-side constraints and application-side repair
- Signs of a solid answer: knows how constrained decoding works and what it costs; can say how sampling parameters affect format stability; has a judgment on the split between server side and application side

### Capacity planning and elasticity
- Ladder: working backward from an SLO (TTFT, TPOT, concurrency) to the number of GPUs needed → how request distribution (input length, output length, concurrency) affects capacity; how to scale across peaks and troughs → under overload, where admission control, degradation (switch to a smaller model, truncate context), and rate limiting sit → cost model: how cost per thousand tokens changes with utilization
- Signs of a solid answer: can walk through one capacity estimate; has a peak-and-trough elasticity plan; knows utilization is the denominator of cost
