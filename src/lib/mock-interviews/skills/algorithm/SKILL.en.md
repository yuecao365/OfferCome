---
name: algorithm
description: How to interview for algorithm and ML roles, covering ML basics, deep learning, features, A/B tests, deployment, monitoring.
keywords: [algorithm engineer, machine learning, mle, deep learning, recommendation, search ranking, ads, computer vision, nlp, risk control, feature engineering, model deployment, mlops, xgboost, ab testing, cv, feature platform, model monitoring]
layer: domain
---

## What interviewers care about

Algorithm and machine learning roles in China split into search / recommendation / ads (highest demand at ByteDance, Meituan, Alibaba, Kuaishou), CV, NLP, risk control and data mining, and ML platform and MLOps. The job is turning data and models into a system that reliably produces business value: building features, training and iterating models, evaluation and experiments, deploying online, monitoring effectiveness and continuously updating. Real interviews run three to four rounds: round one tests machine learning and deep learning fundamentals plus one hand-coded problem (a LeetCode medium or a model component such as cross-entropy or IoU); round two digs into the project and the model evolution in the business direction (recall / pre-ranking / ranking for recommendation, detection and segmentation for CV, pretraining and fine-tuning for NLP); round three tests experiment design, business understanding, and engineering productionization; the hiring-manager round checks direction fit. LLM-direction algorithm questions (pretraining, alignment, RL) are in the ai-algorithm pack.

Interviewers care most about three things. First, whether the fundamentals are solid: can loss functions, optimizers, regularization, and evaluation metrics be derived rather than recited. Second, whether the experiments are trustworthy: is there a control group, is there leakage, is the split correct, how to judge when offline and online metrics diverge. Third, the engineering loop: feature consistency, latency and throughput, monitoring and rollback, retraining; an algorithm engineer is not only the person who trains the model. The place where real work goes wrong most often is data (leakage, bias, drift, consistency) rather than the model, and interviewers will press there first.

Campus candidates' projects are mostly paper reproductions, competitions, lab topics, or one module from an internship; business results are not expected, and the interviewer looks at derivation of basic formulas, honest assessment of experimental results, and whether each hyperparameter and design can be explained. Experienced candidates must account for online metrics, the confidence of A/B experiments, performance and stability issues after the model went live, consistency between the feature platform and the training service, and why this solution rather than a simpler baseline. Since 2025 interviewers often press "why not just use an LLM for this task".

How to ask like an interviewer in this field:
- Fundamentals questions must be pressed down to formulas or mechanisms (derivations, complexity, statistics); someone who only recites conclusions is treated as not understanding; hand-coding centers on model components, with no pure brain teasers.
- The core of project questions is experimental credibility: always ask the four items of validation split, leakage, baseline, and confidence, and dig deep on any the candidate cannot answer.
- Prioritize data problems over model problems: leakage, bias, drift, and consistency are where real work goes wrong most often.
- For campus candidates look at fundamental derivation and honest assessment of experiments and do not demand online results; experienced candidates must account for online metrics, A/B conclusions, and deployment performance, and those without online experience are probed as offline projects.
- Questions must be matched to the candidate's direction and scale: the right answer differs between a million samples and ten billion, between offline batch processing and millisecond online serving; when the candidate's direction differs from the question's, substitute a task they are familiar with.
- Do not test currency of model and paper vocabulary; test the reasons for model selection and failure cases.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows a recommendation or ads model → probe recall sample construction, negative sampling, candidate volume at each stage, the correspondence between offline and online metrics, confidence of A/B experiments, the cold-start plan, handling of exposure bias
- Resume shows "AUC / accuracy improved by X" → probe the metric definition, how the validation set was split, whether there was leakage, what the baseline was, whether there was online A/B validation, the change in business metrics
- Resume shows feature engineering → probe where the three most effective features came from, how feature importance is computed, whether leakage checks were done, how features are fetched online, how online-offline consistency is ensured
- Resume shows model deployment → probe QPS, p99 latency, deployment method, what is monitored, whether a rollback ever happened
- Resume shows deep learning models → probe why this architecture was chosen, the hardest problem met in training and debugging, how much improvement over a simple baseline
- Resume shows a paper reproduction or competition ranking → probe the gap between reproduced results and the paper, which step the key gain came from, the contribution of ensembling, whether they overfit the leaderboard, which solutions are unusable in industry
- Resume shows "automatic retraining / MLOps platform" → probe trigger conditions, evaluation thresholds, failure cases
- Resume shows risk control / anti-fraud → probe the positive-sample ratio, label delay, explainability requirements, how adversarial change is handled
- Resume shows a specific CV or NLP task → probe loss function and post-processing details, failure-sample analysis, data augmentation
- Resume shows search relevance / ranking → probe where labels come from, the relationship between offline NDCG and online clicks, the division of labor between query understanding and recall

## Common failures and red flags

- ML fundamentals and model selection: answers overfitting with only "add regularization"; cannot say where the difference between GBDT and random forest comes from; chooses deep learning unconditionally; does not know how categorical features are handled differently across models
- Evaluation metrics and business goals: can only recite AUC as "area under the ROC"; does not know the difference between global AUC and within-user AUC; does not know AUC can mislead under class imbalance; treats offline metrics as the final goal
- Deep learning training and debugging: answers BN only as "normalization" and cannot say which statistics are used at inference; answers NaN only with "lower the learning rate"; tuning is only trying learning rates; has never looked at gradient norms
- Feature engineering, leakage and train-serve consistency: does not know what feature leakage through time travel is; has no alarm at "AUC too high"; applies target encoding on the full data; wrote two separate sets of feature logic for training and online; has no feature distribution monitoring
- Experiment design and A/B testing: does not know the relationship between significance and sample size; splits experiment traffic arbitrarily; does not know the purpose of an A/A experiment
- Model deployment and inference optimization: answers deployment only as "wrap it in Flask"; quantization is only "smaller and faster"; does not know low GPU utilization is usually a data-loading or batch problem; thinks latency problems are all "the model is too big"
- Online monitoring, drift and MLOps: monitors only service availability, not effectiveness; treats retraining as a cure-all; model files are named by hand and put on a shared drive; does not record training-data snapshots
- Data quality and labeling: randomly splits time-series data; has never checked for duplicate data; does not measure labeling inconsistency
- CV and NLP specifics: can only report model names; cannot say how the NMS threshold matters; does not know the difference between beam search and greedy
- Business productionization and the LLM boundary: picks a model as soon as given a problem; has no baseline; cannot say the scenarios where a model fails; uses an LLM unconditionally, or rejects LLMs entirely without being able to say why
- Explainability and compliance constraints: treats feature importance as an individual-level explanation; does not know the difference between SHAP and global importance; does not consider proxy variables for sensitive features

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### ML fundamentals and model selection
- Ladder: judging and handling overfitting and underfitting → bias-variance decomposition, how regularization works, where tree models and linear models each fit, why GBDT is strong on tabular data, why tree models do not need normalization → attributing good training performance but poor online performance (distribution shift, leakage, label noise); whether a stalled result is a data problem or a model problem → the trade-off among explainability, training cost, and effectiveness, and when to use a simple model
- Signs of a solid answer: can distinguish leakage, time travel, and distribution drift; knows the prior that regularization corresponds to; can explain why tree models are insensitive to feature scale; has the habit of a baseline model

### Evaluation metrics and business goals
- Ladder: the definitions and uses of precision, recall, AUC, F1, NDCG, and calibration → the ranking meaning of AUC, choosing metrics under class imbalance, the difference between GAUC and AUC → why offline metrics improve but online metrics do not move (selection bias, proxy-metric drift) → aligning metrics with business goals, how multiple objectives are balanced
- Signs of a solid answer: can explain the probabilistic meaning of AUC; distinguishes ranking metrics from classification metrics; understands that offline samples only cover items that were exposed; uses replay or uplift to narrow the offline-online gap; can propose proxy metrics closer to the business

### Deep learning training and debugging
- Ladder: causes of and remedies for vanishing and exploding gradients → the computation of BatchNorm and LayerNorm, how training and inference differ, what Dropout does, the relationship between learning rate and batch size → the order of investigation for loss not decreasing, validation oscillation, and NaN → the trade-off between training stability and convergence speed, the risks of mixed precision, tuning budget versus payoff
- Signs of a solid answer: checks data first (outliers, label errors) and then lr, warmup, precision overflow; has checklists for gradient clipping, mixed-precision overflow, and data anomalies; can explain why BN fails when the batch is small; validates the pipeline by overfitting a small dataset

### Feature engineering, leakage and train-serve consistency
- Ladder: feature types and how they are processed (discrete, continuous, sequence, cross), how embeddings are built and shared → offline AUC is 0.95 but online is poor: how to investigate whether it is leakage (time travel, label leakage, target encoding not done out-of-fold) → why online and offline features become inconsistent; the design of a feature platform (online store, offline store, point-in-time correctness); how to locate a feature that is 30% null online after launch → the trade-off among feature count, real-time freshness and serving latency, and storage cost
- Signs of a solid answer: splits by time and checks feature timestamps; suspects leakage first when a single feature's importance is abnormally high; uses the same feature-definition code offline and online; point-in-time join; compares training-set and online-sample distributions before launch

### Experiment design and A/B testing
- Ladder: basic principles of A/B experiments, layering and bucketing → computing sample size, significance, confidence interval, and minimum detectable effect → handling non-significant results, an unbalanced A/A test, novelty effects, and network effects → layered design when multiple experiments interfere with each other, trade-off between short-term and long-term metrics
- Signs of a solid answer: can estimate sample size; knows variance-reduction methods; can recognize Simpson's paradox and uneven bucketing; has a clear standard for the decision to roll out fully

### Model deployment and inference optimization
- Ladder: the export path from training framework to inference service (ONNX, TorchScript, TensorRT) → the principles and accuracy cost of quantization, distillation, and pruning, batching and dynamic batch → how to locate a spike in online p99 latency (model, feature lookup, serialization, network), low GPU utilization, and too much accuracy lost after quantization → the four-way trade-off among latency, throughput, cost, and accuracy, choosing between CPU and GPU deployment
- Signs of a solid answer: can state the difference between PTQ and QAT; finds bottlenecks with segmented instrumentation; configures dynamic batching and concurrency; does accuracy regression before and after quantization; feature caching and precomputation

### Online monitoring, drift and MLOps
- Ladder: what to monitor after a model goes live → the difference between data drift and concept drift, detection methods such as PSI / KL; how data version, code version, model version, and parameters are linked for reproducibility → effectiveness slowly declining with no alert, how to monitor under label delay; how to investigate when a two-month-old model's results cannot be reproduced → retraining frequency, trigger conditions and risks of automatic retraining; the tension between process standardization and iteration speed
- Signs of a solid answer: monitors three layers: feature distribution, prediction distribution, and actual effectiveness; has a champion-challenger or shadow mode; experiment tracking (parameters, metrics, data hash); model registry and approval; runs evaluation regression in CI; retraining has a rollback plan

### Data quality and labeling
- Ladder: how datasets are split and why to split by time or user → the effect and handling of label noise, sampling and weighting for class imbalance → how to investigate data leakage, how to measure labeling inconsistency → the trade-off between data scale and labeling cost, when active learning and weak supervision are worth it
- Signs of a solid answer: can state which split fits which business scenario; knows labeling-agreement metrics; has awareness of data version management

### CV and NLP specifics
- Ladder: model evolution on classic tasks (detection, segmentation, pretrained language models) → details of loss functions and post-processing (IoU, NMS, CTC, beam search) → attributing concrete problems such as missed small objects, poor domain transfer, and repetitive generation → the trade-off among accuracy, speed, and labeling cost, when to replace a specialized model with a large pretrained one
- Signs of a solid answer: can explain the role of losses and post-processing; has plans for domain transfer and data augmentation; knows the cost boundary of replacing with a large model

### Business productionization and the LLM boundary
- Ladder: how a business problem is turned into a machine learning problem; aligning the objective function with the business goal, how to build a baseline → why not just use an LLM for this task; the advantages of traditional models in latency, cost, and controllability → how to handle effectiveness decay after launch and stakeholders who do not trust the results; the risks of using an LLM to generate features or labels (noise, distribution shift) → when not to use a model, the trade-off between rules and models; in which scenarios an LLM is worth introducing and how to evaluate the benefit
- Signs of a solid answer: can define the label and the prediction window; builds a rule or simple-model baseline first; compares an LLM and a traditional model on latency, cost, accuracy, and maintainability; spot-checks agreement for LLM labeling; has a small-model distillation idea

### Explainability and compliance constraints
- Ladder: why risk control, healthcare, and finance scenarios require explainable models → what feature importance, SHAP, and monotonicity constraints each solve → when a model rejects a user and the business requires giving reasons, or regulators require proof of non-discrimination, what to do → the cost of explainability to model accuracy and iteration speed, in which scenarios to use a scorecard rather than GBDT
- Signs of a solid answer: distinguishes global from local explanation; adds monotonicity constraints on key features; checks for proxy features of sensitive attributes; explanation results align with business rules
