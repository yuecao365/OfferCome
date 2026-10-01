---
name: llm-post-training
description: Deep dive on LLM post-training, covering RL and reward design, reasoning-model training, PEFT, data synthesis, and alignment tax.
keywords: [post-training, rlhf, dpo, grpo, dapo, rlvr, reward model, reasoning model, reasoning, lora, qlora, sft data, synthetic data, distillation, alignment tax]
layer: detail
domains: [ai-algorithm]
---

## What interviewers care about

This pack goes deeper on the post-training portion of ai-algorithm: how a model gets stronger and more controllable after SFT. The 2026 interview focus is RL with verifiable rewards (GRPO, DAPO, and the various vendor variants), the training details of reasoning models, how rewards get hacked, and how synthetic data avoids steering the model off course. Interviewers will ask the candidate to derive DPO, write out the clipping and KL terms in the GRPO objective, and work out the memory budget for LoRA, and will press on a real training incident: reward hacking, length inflation, entropy collapse, eval contamination.

## Probing projects and internships

When the resume shows experience like the items below, this says where to start and what to press on. An answer is solid once the candidate can state the mechanism, where their numbers came from, and one real failure or tradeoff; if they can only give framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume says RLHF / DPO / GRPO → probe where the preferences or rewards came from, whether reward hacking was observed, how the KL and clipping coefficients were tuned, and where the gain over the SFT baseline came from
- Resume says reasoning models / long chain-of-thought → probe how the verifiable reward was designed and graded, how length inflation was controlled, and how it transfers to unverifiable tasks
- Resume says LoRA / QLoRA → probe rank and target layers, the memory budget, comparison with full-parameter training, and any regression after merging
- Resume says data synthesis / distillation → probe the teacher model, filtering rules, how diversity and error rate were measured, and whether the benefit of the synthetic data was ever verified
- Resume says reward model → probe the training data, agreement with human judgment, and how over-optimization was detected
- Resume says "eval improved by X points" → probe the contamination check, number of seeds, variance, and alignment tax (how much general capability dropped)

## Common failures and red flags

- RL and reward design: cannot state the difference between GRPO and PPO; does not know rewards can be hacked; treats "longer chain of thought" as stronger capability
- Reward models and graders: the grader only does string matching; the reward model was never compared with human judgment; does not know about over-optimization
- Reasoning-model training: can only say "use R1's method"; cannot say what cold-start SFT does; looks at length and entropy separately instead of together
- Parameter-efficient fine-tuning: knows LoRA only by name; cannot compute the memory; does no regression after merging weights
- Data synthesis and distillation: trains on synthetic data without filtering; does not know distribution collapse; answers distillation as only "have a big model generate answers"
- Data mixture and curriculum: mixture ratios are guessed; does not know general data guards against forgetting; has never run an ablation
- Alignment tax and regression: looks only at the target-task score; does not know general capability and safety can drop at the same time
- Online versus offline: cannot tell how on-policy and off-policy differ in their demands on data freshness; sees no problem with DPO data coming from a different model

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### RL for LLMs: reward design and reasoning models
- Ladder: why reasoning ability is improved with RL rather than SFT → what GRPO removes relative to PPO, how the advantage is estimated, the cost of group sampling → how to design and grade verifiable rewards (math, code), format rewards and length control, what to do for unverifiable tasks (reward models, pairwise discrimination) → diagnosing and handling training instability, entropy collapse, reward hacking, and length inflation; the tradeoff between inference-time compute and training-time compute
- Signs of a solid answer: can state the clipping and KL terms in the GRPO objective; the grader has anti-hacking design (answer extraction, multi-solution checks); habitually reads entropy, length, and reward curves together; can discuss when distilling reasoning data fits versus direct RL

### Parameter-efficient fine-tuning and the memory budget
- Ladder: how full-parameter fine-tuning differs from LoRA and similar methods → LoRA's low-rank assumption, rank and alpha, which layers to attach to; where QLoRA saves → how much memory fine-tuning 7B / 70B needs, and how much goes to gradients, optimizer state, and activations → when full-parameter is needed and when LoRA suffices; merging weights and multi-adapter serving
- Signs of a solid answer: can compute parameter count and memory (weights, gradients, Adam state, activations); knows returns diminish as rank grows; runs regression evals after merging; mentions the tradeoff between gradient checkpointing and ZeRO

### Data synthesis, distillation, and decontamination
- Ladder: why synthesize data → the pipeline of generating with a teacher model, filtering, and controlling diversity; rejection sampling and self-improvement → how to detect the error rate and distribution collapse of synthetic data; how eval contamination is found (n-gram overlap, perplexity, time-based splits) → tradeoff between distillation (soft labels, reasoning chains) and direct training; copyright and licensing boundaries of synthetic data
- Signs of a solid answer: synthetic data has a sampled error rate and diversity metrics; decontaminates the eval set before training; can describe a case where synthetic data degraded the model

### Reward model and grader design
- Ladder: where rewards come from for verifiable tasks (math, code, format) versus unverifiable ones (writing, dialogue) → how rule-based graders resist hacking (answer extraction, multi-solution checks, unit tests); how the reward model is trained and aligned with human judgment → how reward over-optimization shows up (score rises while outputs get worse) and is detected (held-out reward model, human spot checks) → how to set the weights of a mixed reward (correctness + format + length penalty)
- Signs of a solid answer: the grader has anti-hacking design; reward-model agreement with humans has numbers; can describe one case of over-optimization and how it was handled

### Training details of reasoning models
- Ladder: why pure RL can elicit long chains of thought; what cold-start SFT does → how to read the reward, length, and entropy curves together; how to handle entropy collapse, length inflation, and format breakdown → when distilling reasoning data into a small model fits versus direct RL → tradeoff between inference-time compute (longer thinking) and training-time compute; how to control thinking length per task
- Signs of a solid answer: habitually reads the three curves together; can state the basis for choosing distillation versus RL; knows concrete ways to control length

### Data mixture and training curriculum
- Ladder: where the SFT-stage and RL-stage data each come from and how the ratios are set → how the mixture ratio of general, domain, and safety data affects forgetting and the target task → when a curriculum (easy to hard, short to long) helps → how to run a mixture ablation and what it costs
- Signs of a solid answer: mixture ratios are backed by ablations; knows mixing in general data guards against forgetting; can give a before-and-after comparison for one mixture change

### Alignment tax and post-training regression
- Ladder: what alignment tax is: the target task goes up while general capability or safety goes down → which evals to regress at every post-training step (general, safety, target, format) → when a score drops, how to attribute it to data, algorithm, or hyperparameters → balancing regression cost against iteration speed
- Signs of a solid answer: regression evals at every step; can describe one attributed score drop; knows which capabilities are most easily sacrificed

### Online versus offline alignment
- Ladder: how on-policy RL and off-policy preference optimization differ in their demands on data → what happens when DPO data comes from a different model; the relationship between iterative DPO and online sampling → when DPO is enough and when online RL is required → the system overhead and throughput of rollout versus training
- Signs of a solid answer: can state the concrete consequences of on-policy versus off-policy; has a basis for choosing between DPO and online RL; knows rollout is the largest cost
