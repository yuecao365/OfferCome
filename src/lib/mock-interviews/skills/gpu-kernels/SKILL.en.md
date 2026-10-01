---
name: gpu-kernels
description: GPU kernel deep dive - CUDA, memory access, roofline, FlashAttention, fusion, profilers, quantization, communication.
keywords: [cuda, kernel, operator, triton, flashattention, gpu architecture, shared memory, roofline, nsys, profiler, operator fusion, torch.compile, nccl, quantization kernel, fp8]
layer: detail
domains: [ai-infra]
---

## What interviewers care about

This is the lowest-level segment of ai-infra: how to write an operator, how to measure it, and how to know whether it is worth writing yourself. The interviewer wants the candidate to read a profiler timeline, use roofline to say whether a kernel is compute-bound or bandwidth-bound, explain what FlashAttention actually saves, and to have written at least one kernel with before/after numbers. Campus hiring tests the CUDA programming model and hand-writing a tiled softmax; experienced hiring tests measured optimization cases and in which shapes the optimization made things slower.

## Probing projects and internships

Where to start and what to press on when the resume contains the following kinds of experience. Keep going until the candidate can describe the mechanism, where the numbers came from, and one real failure or trade-off; if they can only name the framework and the conclusion and cannot describe their own part, record it as a red flag. For the general follow-up method see project-deep-dive.

- Resume mentions CUDA / Triton operators → press on which operator was replaced, whether the bottleneck was compute or bandwidth, what techniques were used, the profiler before/after comparison, and which shapes got slower
- Resume mentions FlashAttention / custom attention → press on how tiling and online softmax are implemented, how much memory and how much speed were saved, and how it compares with the official implementation
- Resume mentions operator fusion / torch.compile → press on what was fused, what overhead was eliminated, compile time, and fallback on failure
- Resume mentions quantization kernels → press on the data format, where dequantization happens, and measured accuracy and speed
- Resume mentions NCCL / communication optimization → press on communication volume, how overlap is done, and how dropped GPUs and timeouts are located
- Resume says "X times faster" → press on the baseline, the measurement conditions, and whether it is kernel time or end-to-end time

## Common failures and red flags

- CUDA execution model: cannot explain warps vs thread blocks; does not know what occupancy is
- Memory hierarchy and access: does not know coalesced access or bank conflicts; attributes every slowdown to "not enough compute"
- Roofline and bottleneck analysis: cannot compute the compute-to-bandwidth ratio; does not know why decode is bandwidth-bound
- FlashAttention: can only say "it's faster"; cannot say that what it saves is memory reads and writes, not computation
- Operator fusion and compilation: does not know what overhead fusion eliminates; does not know how to fall back when compilation fails
- Profilers: does not use nsys / torch profiler; for low GPU utilization can only say "increase the batch"
- Quantization kernels: does not know where dequantization happens or when it makes things slower
- Communication operators: does not know the difference between all-reduce and all-to-all; for a dropped GPU can only rerun

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid". Which topics to ask and how many is decided by this JD and this resume; it is not a quota.

### CUDA execution model
- Ladder: the grid / block / warp / thread hierarchy and scheduling → SMs, occupancy, how registers and shared memory limit concurrency → how to investigate a kernel with high occupancy but poor performance (memory access, branch divergence, synchronization) → which tasks suit the GPU and which are faster on the CPU
- Signs of a solid answer: can draw the execution hierarchy; knows how occupancy is computed and what limits it; has a case of poor performance caused by branch divergence or synchronization

### Memory hierarchy and access patterns
- Ladder: how much bandwidth and latency differ across registers, shared memory, L1/L2, and HBM → the effect of coalesced access, bank conflicts, and alignment on performance → how to rework a memory-bound kernel: tiling, reuse, vectorized loads → the effect of data layout (row-major, transposition, padding) on memory access
- Signs of a solid answer: can state the order of magnitude of bandwidth at each level; knows the cause of bank conflicts and how to avoid them; has before/after numbers from one memory-access optimization

### Roofline and bottleneck analysis
- Ladder: how to compute the three quantities of peak compute, peak bandwidth, and arithmetic intensity → which side of the roofline an operator falls on determines the optimization direction → where prefill and decode, large batch and small batch each fall → what more can be done after reaching the roofline (reduce bytes, change precision, fuse)
- Signs of a solid answer: can compute the arithmetic intensity of a GEMM or attention; can use roofline to explain why an optimization worked or did not

### FlashAttention and attention operators
- Ladder: where the memory and memory-access problems of standard attention lie → how tiling plus online softmax avoids writing the N×N matrix, and why the backward pass recomputes → how variable-length sequences, causal masks, and GQA affect the implementation, and why the decode-phase attention is written separately → how to measure the gap to the official implementation and in which shapes it loses to naive
- Signs of a solid answer: can explain the online softmax recurrence; knows the memory and compute trade-offs of forward and backward; has measured comparisons

### Operator fusion and compilation
- Ladder: what overhead fusion eliminates (kernel launch, intermediate result reads and writes) → how pointwise, reduction, and GEMM-epilogue fusion are each done → when torch.compile / Triton / hand-written CUDA each pay off; compile failure and fallback → the effect of fusion on numerical precision and debugging
- Signs of a solid answer: can state the change in memory traffic before and after fusion; knows the boundaries of compilation tools; has handled compile-failure fallback

### Profiling methodology
- Ladder: what to look at first: gaps in the timeline, kernel duration distribution, CPU and GPU waiting → what level nsys, torch profiler, and ncu each show → ranked common causes of low GPU utilization (data loading, CPU scheduling, launch overhead, synchronization) → what CUDA Graph eliminates and when it cannot be used
- Signs of a solid answer: can read a timeline and point out the gaps; has an experience of finding a root cause from a profiler; knows the limits of CUDA Graph

### Quantization kernels and numerical precision
- Ladder: the representable range and error of FP16 / BF16 / FP8 / INT8 / INT4 → at which step of the kernel weight dequantization happens, and why quantization speeds things up noticeably only at small batch → in which shapes a quantized kernel gets slower → how to run accuracy regression and how to handle outliers
- Signs of a solid answer: knows the trade-offs of each format; can explain how the dequantization position affects performance; has evaluation comparisons before and after quantization

### Communication operators and multi-GPU
- Ladder: where all-reduce, all-gather, all-to-all, and reduce-scatter are each used → how to estimate communication volume and how bandwidth (NVLink, IB) affects parallelism choices → how to overlap communication and computation → how NCCL timeouts, slow nodes, and dropped GPUs show up and are located
- Signs of a solid answer: can compute the communication volume of one tensor-parallel step; knows how overlap is implemented; has a process for locating one communication failure
