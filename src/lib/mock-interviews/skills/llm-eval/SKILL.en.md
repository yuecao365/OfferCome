---
name: llm-eval
description: Deep dive on LLM and agent evaluation, covering golden sets, judge calibration, trajectory metrics, regression gates, and red teaming.
keywords: [eval, evaluation, llm-as-judge, benchmark, regression, trajectory evaluation, trace, red team, decontamination, contamination, golden set, ci gate]
layer: detail
domains: [ai-agent, ai-algorithm, test-qa]
---

## What interviewers care about

Evaluation is a hard gate in 2026 interviews for Agent and LLM roles: a project without an evaluation loop is treated as a demo. Interviewers do not ask "which framework did you use"; they ask where the eval set came from, how ground truth was decided, how the judge was calibrated, what the noise floor is, how failures feed back into the next version, and how the gate gets into CI. Agent tasks add another layer: the same outcome may take 3 steps or 30, so success rate alone is not enough and the trajectory has to be examined.

## Probing projects and internships

When the resume shows experience like the items below, this says where to start and what to press on. An answer is solid once the candidate can state the mechanism, where their numbers came from, and one real failure or tradeoff; if they can only give framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume says eval set / benchmark → probe the source, size, how ground truth was decided, whether it overlaps with training or prompt examples, and how it is maintained
- Resume says LLM-as-judge → probe which model the judge is, how well it agrees with human labels, and how position and length bias are controlled
- Resume says "success rate / accuracy improved by X%" → probe how many runs, what the noise floor is, the sample size, and whether there was a control
- Resume says regression / gate → probe the gate metrics and thresholds, what bad changes it has blocked, and how many false blocks
- Resume says agent evaluation → probe which trajectory-level metrics exist, how the eval environment is built, and how the simulated counterpart is made
- Resume says red team / safety evaluation → probe where the attack set came from, which injection paths it covers, and the block rate and false-block rate

## Common failures and red flags

- Eval set construction and ground truth: has never had an eval set; ground truth is just "I think it's right"; the eval set overlaps with prompt examples
- LLM-as-judge calibration: the judge is the very model being evaluated and agreement was never checked; does not know position bias and length preference
- Trajectory-level metrics: has only a single success-rate number; does not know step count, invalid tool-call rate, or budget-hit rate
- Noise and statistics: never ran the baseline twice to see the noise; treats one flipped session as a conclusion
- Regression gate: no regression run after changes; the gate is only a human looking
- Decontamination: the score went up and they did not check for contamination; does not know n-gram overlap and time-based splits
- Failure feedback: after fixing a failure there is no matching regression case; the same class of failure keeps recurring
- Red team and safety evaluation: only tests normal inputs; treats "the system prompt says don't" as a defense

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Evaluation: trajectories, eval sets, and judges
- Ladder: how to prove this change made things better; why success rate alone is not enough (the same outcome may take 3 steps or 30) → how to build the offline eval set (online feedback + metamorphic cases with constructed ground truth + simulated counterparts), how big is big enough, how to avoid overlap with training or prompt examples → trajectory-level metrics: step count, invalid tool-call rate, budget-hit rate, per-step cache hit, per-segment cost; LLM-as-judge biases (position, length, self-preference) and calibration → how to set the noise floor (the difference between two runs of the same config); whom to trust when offline and online metrics diverge; how failure modes get recorded (into a failure list, add perturbations, run the perturbations first after a fix, then fold into a skill or rule)
- Signs of a solid answer: the eval set covers typical, edge, and adversarial cases; the judge is checked for agreement against human labels; there is a noise floor; can name three or more trajectory metrics; a failure list → perturbation → fix → smoke-test loop; knows to generate adversarial samples with a model from a different family to reduce shared blind spots

### Eval set construction and ground truth
- Ladder: where the eval set comes from: online feedback, hand construction, model generation with human review, metamorphic relations to construct ground truth → what share typical, edge, and adversarial cases each take; how big is big enough → how to check overlap with training data, prompt examples, and few-shot examples → how the eval set is maintained as the product iterates, who owns it, what to do when it goes stale
- Signs of a solid answer: the three categories have stated proportions; overlap is checked; the eval set has a version and an owner

### LLM-as-judge bias and calibration
- Ladder: why use a model as the judge and which tasks it cannot be used for → how position bias, length preference, self-preference, and format preference each show up → consistency check against human labels (how many samples, which metric), what to do when they disagree → what each of these solves: having the judge answer only yes/no questions, using a model from a different family, pairwise comparison
- Signs of a solid answer: judge calibration has numbers; knows that using a different-family model reduces shared blind spots; judge output is structured and auditable

### Trajectory-level metrics
- Ladder: why success rate is not enough → what step count, invalid tool-call rate, budget-hit rate, per-step cache hit, per-segment cost, and backtrack count each measure → how to judge a trajectory that "got it right but took a detour"; how to explain process and outcome metrics diverging → how trajectory metrics enter the dashboard and the gate
- Signs of a solid answer: can name three or more trajectory metrics and what each is for; has a case where process and outcome diverged

### Noise floor and statistics
- Ladder: what the difference between two runs of the same config is, and why measure it first → what sample size, confidence intervals, and paired comparison (same seed, same persona) each solve → how much one flipped session moves the metric; what change counts as a conclusion → tradeoff between eval cost and statistical power
- Signs of a solid answer: has a noise-floor number; comparisons are paired; knows what to say and not say when n is too small

### Offline, online, and regression gates
- Ladder: what question each of offline eval, shadow traffic, canary, and sampled online human review answers → how gate metrics and thresholds are set; how to make it runnable in CI → how to attribute it when offline improves but online does not → the cost of gate false blocks and misses, who can override the gate
- Signs of a solid answer: has a case where the gate blocked a bad change; offline and online metrics have a known relationship; the gate has an owner

### Decontamination and leakage
- Ladder: how eval-set contamination happens (crawled into training data, examples put in the prompt, feedback data fed back into training) → what n-gram overlap, perplexity, time-based splits, and paraphrase detection can each detect → what to check first when a score goes up → tradeoff between private eval sets and public benchmarks
- Signs of a solid answer: checks for contamination before training; has a private eval set; can describe a case where contamination caused a misjudgment

### Failure feedback and perturbation sets
- Ladder: how failures get into the list, how they are classified, how they become regression cases → constructing perturbations for each failure class (rephrasing, injection, over-long input, off-topic answers) → the order of running perturbations after a fix and then the full set → how the failure list in turn changes prompts, rules, or skills
- Signs of a solid answer: the failure list maps to perturbations; a fix → perturbation → smoke-test loop; recurrence rate of the same class of failure is going down

### Red team and safety evaluation
- Ladder: where the attack set comes from: public injection sets, self-made, model-generated → how to test direct injection, indirect injection (documents, tool returns), unauthorized tool calls, and sensitive-information leakage → how to balance block rate and false-block rate → how safety evaluation enters the gate and how often it is updated
- Signs of a solid answer: the attack set covers indirect injection; has both a block rate and a false-block rate; safety evaluation has regression
