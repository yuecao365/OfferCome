---
name: ai-algorithm
description: How to interview for LLM algorithm roles, covering Transformer, pretraining, alignment, RL, fine-tuning, embeddings, eval.
keywords: [llm algorithm, llm research, pretraining, post-training, sft, rlhf, dpo, grpo, alignment, reinforcement learning, rl, reward model, lora, fine-tuning, transformer, embedding, multimodal, vlm, evaluation, benchmark]
layer: domain
---

## What interviewers care about

An LLM algorithm engineer (LLM algorithms, LLM research, post-training / alignment, multimodal algorithms) works on the model itself: building data, setting training objectives, running pretraining or post-training, doing alignment, building evals, analyzing failure samples. The difference from LLM application roles: an application role asks "how do you know it works well, and how do you debug when it breaks"; an algorithm role asks "why does this objective, this data, this algorithm make the model better, and how do you prove it was the cause". Real interviews run three to four rounds: round one tests Transformer and training fundamentals plus coding by hand (components like attention, cross-entropy, RoPE, DPO loss); round two digs into the project's data mixture, training curves, ablations, and evals; round three tests judgment about pretraining / post-training / RL routes and understanding of methods from the past year; the hiring-manager round checks direction fit.

Interviewers care most about three things. First, whether the fundamentals can be derived rather than recited: why scaled dot-product divides by the square root of d, how RoPE extrapolates, how DPO is derived from the RLHF objective, what GRPO relies on to estimate advantage without a critic. Second, whether the experiments are trustworthy: whether data leaked into the eval set, whether ablations were done, whether the gain is noise, whether the baselines are fair. Third, judgment about "why it works": why this data should be added, why this reward gets hacked, at what scale this method fails.

Campus candidates' projects are mostly reproductions, competitions, lab topics, or one segment of a pipeline at an internship; large-scale training experience is not expected, and the interviewer looks at derivation of fundamentals, honest assessment of experiments, and whether each design can be explained. Experienced candidates must account for scale (how many GPUs, tokens, steps), the data pipeline, the eval system, one real training incident (loss spike, reward hacking, eval contamination) and how it was handled at the time.

How to ask like an interviewer in this field:
- Press fundamentals down to formulas or mechanisms (derivation, complexity, direction of gradients); someone who only recites names is treated as not understanding; hand-coding centers on model components and losses.
- The core of project questions is experimental credibility: whether the eval set and training set overlap, whether baselines are fair, whether gains exceed noise, whether ablations exist; dig deep on any one the candidate cannot answer.
- Do not test paper-currency vocabulary ("what is the latest SOTA"); test the motivation, assumptions, and failure conditions of methods; when the candidate knows a method different from the question, substitute their method.
- Follow up every training decision with "how did you verify": data mixture, reward design, hyperparameters; for any change mentioned, immediately press on evaluation and controls.
- Ask questions matched to scale: a project fine-tuning 7B on a few GPUs is not asked about thousand-GPU parallelism or MoE load balancing; anyone who took part in pretraining must be pressed on the data pipeline, stability, and scaling judgment.
- In 2026 the post-training mainline has shifted from "SFT + RLHF with preference labels" to "SFT + RL with verifiable rewards (GRPO / DAPO and the like) + synthetic-data self-play": interviewers will press on whether the candidate knows why human preference labeling for RLHF is no longer the mainstream, on which tasks verifiable rewards do not hold, and what the cost of GRPO dropping the critic is. Someone who can only recite the three stages of RLHF is treated as out of date.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows SFT / instruction tuning → probe data volume and source, cleaning and deduplication process, how the mixture was set, why not prompting or RAG, eval comparison before and after fine-tuning, whether general capability dropped
- Resume shows RLHF / DPO / GRPO → probe where preference data came from, how the reward model or rules were built, whether reward hacking was observed, how the KL coefficient was tuned, where the gain over the SFT baseline comes from
- Resume shows pretraining / continued pretraining → probe data mixture and deduplication, tokenizer, learning rate and warmup, how loss spikes were handled, how many GPUs and tokens, how to decide when to stop
- Resume shows reasoning models / long chain-of-thought → probe how verifiable rewards were designed, answer extraction and grading, how length inflation was controlled, how it transfers to unverifiable tasks
- Resume shows LoRA / parameter-efficient fine-tuning → probe how rank and target layers were chosen, the memory accounting, how much worse than full-parameter tuning, whether there was regression after merging back into the weights
- Resume shows embeddings / retrieval models → probe how training pairs were constructed, how hard negatives were mined, the eval set (MTEB-style or self-built), how domain bias was handled
- Resume shows multimodal / VLM → probe how the vision encoder and connector were chosen, how image-text data was aligned and cleaned, the trade-off between resolution and token count, how hallucination was evaluated
- Resume shows "eval / benchmark improved by X" → probe whether the eval set was contaminated by training data, the few-shot setup, how many seeds were run, whether the gain exceeds variance
- Resume shows data synthesis / distillation → probe who the teacher model was, how synthetic data was filtered, whether the diversity and error rate of the synthetic data were ever verified
- Resume shows a paper reproduction or competition → probe the gap between reproduced results and the paper, attribution of the difference, the parts they changed themselves, whether they overfit the leaderboard

## Common failures and red flags

- Transformer and attention: cannot say why we divide by the square root of d; answers multi-head with only "multiple perspectives"; does not know attention is quadratic in complexity; can only say "cache" for KV cache
- Pretraining: data, objectives and scaling: equates pretraining with "feeding lots of data"; does not know the effect of deduplication and data mixture; has not heard of scaling laws or can only recite conclusions; cannot name common causes of loss spikes
- Post-training: SFT and data engineering: treats fine-tuning as a way to "teach the model knowledge"; cannot say where the training data comes from or how its quality is controlled; does not know the memory accounting of full-parameter fine-tuning versus LoRA; mixes the eval set with the training set
- Preference alignment: RLHF, DPO and variants: only recites names; cannot say what DPO saves relative to PPO and what it costs; does not know the role of the KL constraint; equates alignment with "more polite"
- RL for LLM: rewards and reasoning models: cannot say how GRPO differs from PPO; does not know rewards can be hacked; has not considered length bias and format rewards; treats "longer chain of thought" as stronger capability
- Long context and positional encoding: only answers "use RoPE"; cannot say why extrapolation collapses or what interpolation and YaRN solve; does not know the limits of long-context evals (needle in a haystack)
- Evaluation and benchmarks: evaluates by "looks fine"; reports only a single overall score; does not know how few-shot setup and prompt template affect scores; uses the model under evaluation as the judge without validating it
- Multimodal models: treats a VLM as "attach a vision encoder"; cannot say the trade-off between image token count and resolution; has no plan for evaluating hallucination
- Inference efficiency and model compression: only knows "vLLM is fast"; did no quality regression after quantization; cannot say how the prefill and decode phases differ; explains speculative decoding only as "a small model guesses"

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Transformer and attention
- Ladder: the computation and complexity of self-attention → why divide by the square root of d, the role of multiple heads, positional encodings (absolute, relative, RoPE), Pre-Norm versus Post-Norm → memory and speed problems on long sequences, what the KV cache does, what GQA / MQA save → why decoder-only became the mainstream, the motivation and costs of MoE (load balancing, communication)
- Signs of a solid answer: can derive the relationship between softmax saturation and scaling; knows the idea of FlashAttention (tiling plus online softmax); can explain the relative-position property of RoPE; can compute KV cache memory usage

### Pretraining: data, objectives and scaling
- Ladder: why the pretraining objective (next-token prediction) can learn general capability → the data pipeline: crawling, deduplication, quality filtering, mixture, tokenizer training → how to handle loss spikes, divergence, sensitivity to data order; how to decide whether to add data or add parameters → how scaling laws are used and where they fail (data exhaustion, domain data, inference-time compute); continued pretraining and catastrophic forgetting
- Signs of a solid answer: knows deduplication and quality filtering affect downstream more than model details; can state the relationship among warmup, learning-rate decay, and batch size; has a checklist for handling loss spikes (roll back a checkpoint, skip the batch, lower lr); can discuss Chinchilla-style trade-offs

### Post-training: SFT and data engineering
- Ladder: what problems call for fine-tuning rather than RAG or prompting → the source, cleaning, deduplication, and mixture of SFT data; instruction diversity versus response quality, which matters more → how to detect and mitigate a fine-tuned model "getting dumber" (general capability loss), overfitting, and eval-set contamination → data cost, maintenance cost, and the sunk cost when the base model is upgraded; the limits of synthetic data
- Signs of a solid answer: fine-tuning is biased toward learning format, style, and behavior, with knowledge coming from retrieval; the eval set is independent of the training set and overlap was checked; mentions mixing in general data to resist forgetting; can say how to verify a piece of data is worth adding before adding it

### Preference alignment: RLHF, DPO and variants
- Ladder: why alignment is still needed after SFT → what the three stages of RLHF (SFT, reward model, PPO) each do, and the role of the KL constraint → how DPO is derived from the RLHF objective, what it saves, what it costs (offline data, over-optimization); which assumption variants like IPO / KTO / ORPO change → how preference data is constructed and quality-checked; the alignment tax; the trade-off between online and offline alignment
- Signs of a solid answer: can write the DPO loss and explain the implicit reward; knows reward hacking and length bias; preference data has consistency checks; can say when DPO is enough and when online RL is necessary

### Long context and positional encoding
- Ladder: why the model collapses beyond its training length → what RoPE's rotation and relative position are, and what position interpolation and NTK-aware / YaRN each change → the data and memory problems of long-context training; the "lost in the middle" phenomenon → the limits of long-context evals (needle in a haystack versus real tasks); the boundary between long context and RAG
- Signs of a solid answer: can explain extrapolation failure from a frequency perspective; knows the difference between perturbing the base frequency and interpolation; has a long-document eval plan that goes beyond needle in a haystack

### Evaluation and benchmarks
- Ladder: how to prove this model got better → what general benchmarks (knowledge, reasoning, code, math) each test, and how few-shot setup and prompt template affect scores → whether a rise in score is capability or contamination or overfitting the leaderboard; how many seeds were run, how large the variance → bias and calibration of LLM-as-judge; how to build and maintain a business-oriented custom eval set
- Signs of a solid answer: reports scores with setup and variance; has contamination checks; checks judge agreement against humans; the eval set covers typical, edge, and adversarial cases

### Multimodal models
- Ladder: what the three parts of a VLM (vision encoder, connector, language model) each do → the trade-offs of image token count, resolution, and dynamic tiling; where image-text alignment data comes from → how to evaluate and mitigate hallucination (describing things not in the image); the special nature of OCR and document understanding → the difference between native multimodal and stitched-together designs; the cost of extending to video and audio
- Signs of a solid answer: can state the stage split between training the connector and training the whole model; has a multimodal hallucination eval plan; knows how resolution affects token count and latency

### Inference efficiency and model compression
- Ladder: why LLM inference is bound by memory bandwidth and how prefill and decode differ → what KV cache, continuous batching, and PagedAttention solve; the principles and accuracy cost of quantization (INT8 / INT4 / FP8), distillation, and pruning → how to regression-test quality after quantization, where the speedup of speculative decoding comes from and when it does not speed things up → how inference cost feeds back into algorithm decisions (model size, MoE, long chain-of-thought)
- Signs of a solid answer: distinguishes TTFT from TPOT; has eval comparisons before and after quantization; can explain the relationship between speculative decoding's acceptance rate and speedup; knows that system-level inference optimization (scheduling, KV cache, parallelism, kernels) is in the ai-infra pack, and what the algorithm side should leave room for (model size, MoE, quantization friendliness)
