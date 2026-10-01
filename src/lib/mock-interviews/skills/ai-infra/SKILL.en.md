---
name: ai-infra
description: How to interview for LLM inference and training infra, covering KV cache, scheduling, parallelism, kernels, serving SLOs.
keywords: [ai infra, inference optimization, inference acceleration, llm inference, inference engine, vllm, sglang, tensorrt-llm, kv cache, paged attention, continuous batching, speculative decoding, quantization, fp8, cuda, triton, flashattention, tensor parallelism, moe, pd disaggregation, ttft, training framework, megatron, deepspeed, fsdp, llm systems]
layer: domain
---

## What interviewers care about

An AI Infra engineer (LLM inference optimization, inference engines, LLM systems, training frameworks and clusters) makes models run fast, run at all, and run reliably. On the inference side: memory (KV cache), scheduling (batching and preemption), parallelism (tensor / pipeline / expert), kernels (attention, quantization kernels), serving (routing, SLOs, multi-tenancy). On the training side: parallelism strategy, communication, checkpointing, and fault recovery on thousand-GPU clusters. The boundary with algorithm roles: algorithm roles ask "why is this model good"; Infra roles ask "how many tokens per second can this model produce on this set of GPUs, how many milliseconds to first token, where does the memory go, and how can it be saved further". Real interviews run three to four rounds: round one tests GPU architecture, concurrency, and memory fundamentals plus coding by hand (implementing an attention / softmax / tiled kernel in C++ / CUDA or Python); round two digs into the numbers and failures of the part of the inference or training system the candidate owned; round three gives a deployment scenario and asks for on-the-spot arithmetic (how many GPUs, what batch size, what throughput is reachable, where the bottleneck is); the hiring-manager round checks depth of understanding of and contributions to open-source engines (vLLM, SGLang, TensorRT-LLM).

Interviewers care most about four things. First, can the candidate do the arithmetic: the weights of a 7B / 70B model, how much memory the KV cache takes per token, how many concurrent requests one GPU can hold, why decode is bound by memory bandwidth rather than compute, and using a roofline to judge whether an operator is compute-bound or bandwidth-bound. Second, understanding of inference-engine mechanisms down to the implementation level: what fragmentation problem PagedAttention solves, at which level continuous batching inserts new requests, the hit conditions of prefix caching, the relationship between speculative decoding's acceptance rate and speedup. Third, real performance failures and the diagnosis process: TTFT spikes, throughput that will not climb, low GPU utilization, OOM, preemption storms, from symptom to profiler to root cause. Fourth, whether trade-offs land on SLOs and cost: how latency, throughput, memory, and accuracy are ranked under one concrete business.

Campus hiring emphasizes: the CUDA programming model (grid / block / warp, shared memory, coalesced access), the GPU memory hierarchy, the compute and memory complexity of attention, and being able to read a module of vLLM source and explain it. Experienced hiring emphasizes: scheduling and SLOs for production services, multi-model multi-tenancy, large-cluster problems like PD disaggregation and MoE parallelism, measured numbers from kernel-level optimization, failure rates and recovery times of training clusters, and contributions to or deep customization of open-source engines.

How to ask like an interviewer in this field:
- Every question needs numbers: whenever the candidate mentions an optimization, press on TTFT / TPOT / throughput / memory before and after and the measurement conditions (model, GPU, batch, sequence length); an optimization with no numbers does not count as an accomplishment.
- From symptom to mechanism: do not ask "what is PagedAttention"; ask "memory is 20% free yet you get OOM or rejected new requests, how do you investigate", and let the candidate walk to paging and fragmentation on their own.
- Test trade-offs, not vocabulary currency: do not ask "what did the latest engine version add"; ask "is this feature worth turning on in your scenario, and what does it cost".
- Ask questions matched to the candidate's scale: a project running 7B on a single GPU is not asked about PD disaggregation and expert parallelism; anyone who has run multi-node inference or thousand-GPU training must be pressed on communication, failures, and cost accounting.
- Hand-coding centers on kernels and system components (tiled softmax, a KV cache allocator, one step of the scheduler), with no pure algorithm problems.
- In 2026 the architectural mainline for inference serving is disaggregation: prefill and decode split onto different GPU pools (PD disaggregation) connected by a KV transfer library, MoE attention and expert layers are parallelized separately, and long prefixes are shared through a radix tree. Interviewers will press on what each disaggregation buys, where the costs are, and at what scale it is worth it.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows a vLLM / SGLang / TensorRT-LLM deployment → probe model and GPU type, QPS, P50 / P99 of TTFT and TPOT, concurrency, memory usage, which features were turned on (prefix caching, chunked prefill, speculative decoding) and how much each brought, how quality regression was done
- Resume shows "inference sped up X times" → probe what the baseline was (bare HF transformers is not a fair baseline), measurement conditions, batch and sequence length, whether the speedup is in prefill or decode, whether accuracy dropped
- Resume shows quantization → probe the method (GPTQ / AWQ / FP8 / SmoothQuant), whether weights, activations, or the KV cache were quantized, which eval set was used for accuracy regression, whether the kernel was off-the-shelf or self-written, the measured throughput change
- Resume shows CUDA / Triton kernels → probe which operator was replaced, whether the bottleneck was compute or bandwidth, what techniques were used (tiling, shared memory, fusion, coalesced access), the before-and-after in the profiler, at which shapes it got slower instead
- Resume shows KV cache optimization → probe page granularity, fragmentation rate, prefix hit rate, eviction policy, where long context is offloaded under long contexts, the impact on latency
- Resume shows speculative decoding → probe how the draft model was chosen, the acceptance rate, under what request distributions the speedup disappears, how the conflict with batching is handled
- Resume shows multi-GPU / multi-node inference → probe the parallelism method and split dimension, communication share, whether PD disaggregation was done, how load imbalance is handled, how a GPU dropout showed up
- Resume shows MoE inference → probe routing and all-to-all overhead of expert parallelism, expert load imbalance, how experts are placed in memory, how much lower throughput is compared with a dense model
- Resume shows a training framework / thousand-GPU training → probe the parallelism strategy (DP / TP / PP / SP / ZeRO level), MFU, communication share, checkpoint interval and recovery time, how slow nodes and GPU dropouts were diagnosed
- Resume shows an inference serving platform → probe the scheduling policy (FIFO / priority / fair), how preemption is done, how multiple models share a GPU, how SLOs are set and kept, how cost is computed per thousand tokens

## Common failures and red flags

- The two inference phases and performance bottlenecks: cannot say where prefill and decode are each bound; attributes every latency problem to "the model is too big"; does not know what a roofline is
- KV cache management: can only say "cache K and V"; cannot compute KV usage per token; does not know why fragmentation arises or how PagedAttention's block table works; answers prefix caching only as "cache the prefix" and cannot state hit conditions and invalidation
- Batching and scheduling: cannot tell static batch, dynamic batch, and continuous batching apart; does not know chunked prefill solves prefill preempting decode; scheduling is only FIFO; does not know how KV is handled after preemption (recompute vs swap out)
- Quantization and kernels: quantization is only "smaller and faster"; cannot tell the difficulties of weight quantization from activation quantization; does no accuracy regression; writes kernels without looking at the profiler; does not know FlashAttention saves memory reads and writes, not computation
- Serving architecture and metrics: reports only average latency; cannot tell TTFT, TPOT, and ITL apart; has no SLO; does not know queueing time and inference time must be looked at separately; cannot target fairness in multi-tenancy
- Profiling and GPU architecture: for low GPU utilization only says "increase batch"; does not use nsys / torch profiler; does not know the difference between SM occupancy and memory bandwidth utilization; cannot explain shared memory and bank conflicts
- Multi-model, multi-tenancy and cost: does not know how to compute cost per thousand tokens; models sharing a GPU have no isolation; cost optimization only thinks of switching to a smaller model
- Training infrastructure and clusters: recites parallelism strategy names only; cannot say what each of the three ZeRO stages partitions; does not know MFU; checkpoint policy is a guess; for a GPU dropout only says "re-run"
- Source-level understanding of open-source engines: has only used the API; cannot say what vLLM's scheduler, block manager, and model runner each do; has never read or modified any source

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### The two inference phases and performance bottlenecks
- Ladder: what two segments a generation request has and what each does → why prefill is compute-bound and decode is memory-bandwidth-bound, and how a roofline judges this → how the bottleneck changes for 7B on one GPU at batch 1 versus batch 64, and what affects TTFT and TPOT respectively → what different choices in scheduling, parallelism, and quantization a latency-oriented versus a throughput-oriented deployment makes
- Signs of a solid answer: can compute memory for weights and KV, how many bytes decode reads per token, and the compute-to-bandwidth ratio; knows that increasing batch first raises throughput and then hits the compute wall; can use a roofline to explain why an optimization worked or did not

### KV cache management
- Ladder: what the KV cache stores and how much per token per layer → why contiguous allocation fragments, and what PagedAttention's block table and on-demand allocation solve → the hit conditions and eviction policy of prefix caching (RadixAttention and the like), and the sharing benefit for multi-turn conversations and system prompts → what to do when KV does not fit under long context: swap out to CPU, quantize KV, and the accuracy cost of windowing and compression
- Signs of a solid answer: can compute KV usage and derive the maximum concurrency per GPU; knows the trade-off of block size between fragmentation and kernel efficiency; can say how prefix hit rate is measured and which request patterns hit low; has an OOM or rejected-request investigation story

### Batching and scheduling
- Ladder: the differences among static batch, dynamic batch, and continuous batching, and at which level a new request is inserted → chunked prefill solves prefill preempting decode; what the scheduler decides at each step (who runs, who waits, who is preempted) → how KV is handled after preemption (recompute vs swap out), how priority and fairness are done, how queueing time is controlled → SLO-oriented admission control and degradation: whom to reject when overloaded, at which layer to put rate limiting
- Signs of a solid answer: can draw one scheduler step; knows what max_num_seqs and max_num_batched_tokens each limit; distinguishes queueing latency from inference latency; has a case of a preemption storm or a long-tail request dragging down a batch

### Serving architecture and metrics
- Ladder: what layers an inference service has (gateway, routing, scheduling, workers, GPU instances) → what TTFT, TPOT, ITL, and throughput each measure, and why reporting only the average is meaningless → how multiple models and tenants share a GPU with isolation, how priority is expressed, how SLOs are set and kept → how to design streaming, timeouts, retries, and observability (per-request queueing / prefill / decode timing breakdown)
- Signs of a solid answer: has P50 / P99 with measurement conditions; distinguishes queueing from inference; instruments each request in segments; can say which three dashboards to check first when an SLO is broken

### Profiling and GPU architecture
- Ladder: the GPU execution model (SM, warp, thread block) and memory hierarchy (registers, shared memory, L2, HBM) → the effect of coalesced access, bank conflicts, and occupancy on kernel performance → how to locate low GPU utilization: data loading, CPU-side scheduling, kernel launch overhead, synchronization waits, and what to look at with nsys / torch profiler → what overhead each of CUDA Graph, operator fusion, and compilation (torch.compile / Triton) removes
- Signs of a solid answer: can read a profiler timeline and point out the gaps; knows high SM occupancy does not mean compute is saturated; has a story of finding a root cause from the profiler

### Multi-model, multi-tenancy and cost
- Ladder: how cost per thousand tokens is computed (GPU hours, utilization, throughput) → multiple models sharing a GPU: how memory is split, switching cost, serving with multiple LoRA adapters → the cost break-even point between a self-built cluster and calling an API, how peak-valley elasticity is done → how the trade-off among cost, latency, and quality lands in routing policy (try the small model first, pools split by priority)
- Signs of a solid answer: has a cost model and actual numbers; knows utilization is the denominator of cost; multi-tenancy has isolation and fairness mechanisms

### Training infrastructure and clusters
- Ladder: what bottleneck data parallelism, tensor parallelism, pipeline parallelism, sequence parallelism, and the three ZeRO stages each solve, and how communication volume is estimated → how MFU is computed, why MFU at thousand-GPU scale is often around 40%, how communication and computation overlap → locating and handling slow nodes, GPU dropouts, NCCL timeouts, and loss spikes, and the trade-off between checkpoint interval and recovery time → the effect of mixed precision, gradient checkpointing, and activation recomputation on memory and speed; weight-format conversion between training and inference frameworks
- Signs of a solid answer: can give the parallelism configuration for a model of a given size and the reasons; knows the effect of checkpoint writes on training and asynchronous writing; has a timeline of a cluster failure and the follow-up improvements

### Source-level understanding of open-source inference engines
- Ladder: the request lifecycle of vLLM / SGLang: which components it passes through from receipt to streamed return → what scheduler, block manager, model runner, and worker each do, and how one scheduling step decides the batch → what places need changing to add a feature (a new sampling strategy, a new quantization format, a new scheduling policy) and how to test it → design differences between engines (paging vs radix tree, Python scheduling overhead, multi-process model) and the scenarios each suits
- Signs of a solid answer: can draw the component flow of one request; has read or modified at least one place in the source and can describe how it was tested; can state measured differences between two engines on the same scenario and the reasons
