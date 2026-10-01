---
name: recsys-search-ads
description: Search, recommendation and ads deep dive covering recall, ranking, re-ranking, bias, cold start, calibration.
keywords: [recommender system, recsys, search algorithms, ads algorithms, recall, two-tower, ranking, multi-objective, mmoe, re-ranking, sample construction, negative sampling, exposure bias, cold start, relevance, ctr, cvr, calibration, generative recommendation]
layer: detail
domains: [algorithm]
---

## What interviewers care about

Search, recommendation and ads is the direction with the greatest demand for algorithm roles in China, and its interviews have their own vocabulary: candidate volumes across recall, pre-ranking, ranking and re-ranking, sample construction for two-tower models, how to fuse multiple objectives, how to correct exposure bias, how to handle cold start, and what to do when offline AUC goes up but online metrics do not. 2026 adds another layer: generative recommendation (using large models or sequence generation to replace part of ranking), and in which scenarios LLM-made features and labels really help. Interviewers press for the numbers at every layer of the pipeline and for the attribution of one case where online metrics did not improve.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows recommendation / ads models → probe recall sample construction, negative sampling, candidate volume and latency budget at each layer, how offline and online metrics correspond, and AB-test confidence
- Resume shows two-tower / vector recall → probe how sample pairs are built, in-batch negative sampling, popularity correction, and index update frequency
- Resume shows multi-objective → probe how objectives are traded off, how the fusion formula was decided, and how it is tuned online
- Resume shows search relevance / ranking → probe where the labels come from, the relationship between offline NDCG and online clicks, and the division of labor between query understanding and recall
- Resume shows CTR / CVR prediction → probe how calibration is done, how delayed feedback is handled, and how bidding and prediction bias affect each other
- Resume shows cold start / exploration → probe how new users and new items are each handled, how much exploration traffic there is, and how the effect is measured
- Resume shows generative recommendation / LLMs for search and recommendation → probe which layer was replaced, the latency and cost, and the measured comparison against traditional models

## Common failures and red flags

- Recommendation pipeline: cannot state the candidate volume and latency budget of each layer; answers negative samples only with "sample randomly"; does not know the bias in exposed-but-unclicked samples
- Search and ads ranking: answers relevance only with "use BERT"; does not know the division of labor between query understanding and recall; talks only about CTR in ads and not bidding and calibration
- Sample construction and imbalance: downsamples negatives straight to 1:1 with no calibration; does not know about delayed feedback
- Recall and vector retrieval: can only say "use a two-tower"; does not know index types or update cost; has no popularity correction
- Ranking and multi-objective: fuses objectives by guesswork; does not know what MMoE / PLE solve; for sequence modeling can only recite names
- Re-ranking and diversity: does not know re-ranking exists; achieves diversity by hard rule-based scattering
- Cold start and exploration: answers only "use rules"; exploration traffic is not quantified
- Generative recommendation and LLMs: uses an LLM unconditionally; or rejects it entirely without being able to say why; has no latency and cost accounting

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for how deep a solid answer goes; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Sample construction and imbalance
- Ladder: how positive and negative samples are defined → what sampling, weighting and focal loss each solve → how to fix probabilities that are off after negative sampling → how to handle label noise and delayed feedback (conversions happen days after the click)
- Signs of a solid answer: evaluates with PR-AUC or KS; has the probability correction formula after sampling; handles delayed labels with an observation window or dedicated modeling

### Recommendation pipeline
- Ladder: what problem recall, pre-ranking, ranking and re-ranking each solve, and the candidate volume and latency budget of each layer → the structure and sample construction of a two-tower model, in-batch negative sampling and popularity correction, the motivation for feature-crossing models (DeepFM, DIN, MMoE), sequence modeling → how to handle a new model that is good offline and poor online, recall and ranking objectives that disagree, sample selection bias, and exposure bias → trade-offs among multi-objective fusion, cold start, and exploration versus exploitation
- Signs of a solid answer: can state the objective and constraints of each layer; knows in-batch negative sampling and popularity correction; can explain the objective gap between recall and ranking; the multi-objective fusion formula and online tuning are grounded in evidence

### Search and ads ranking
- Ladder: how the search pipeline (query understanding, recall, relevance, ranking) differs from recommendation → where relevance labels come from, the relationship between offline NDCG and online clicks; eCPM ranking in ads and the role of CTR / CVR prediction and calibration → how to handle long-tail queries, cold start for new ads, and bidding and prediction bias affecting each other → the three-way trade-off among relevance, monetization and user experience
- Signs of a solid answer: can state the division of labor between relevance and clicks; knows why calibration is a hard requirement in ads; has concrete plans for the long tail and cold start

### Recall and vector retrieval
- Ladder: what each recall channel solves (collaborative, content, vector, rules) → the structure of a two-tower model, sample construction, in-batch negative sampling and popularity correction, temperature → update frequency and latency of vector indexes (HNSW / IVF), how to handle recall and ranking objectives that disagree → number of recall channels and fusion, how recall quality is measured (offline recall rate, online contribution)
- Signs of a solid answer: can state the objective and volume of each recall channel; knows the bias of in-batch negative sampling and its correction; has a recall evaluation plan

### Ranking and multi-objective modeling
- Ladder: why the ranking objectives (click, conversion, dwell time, engagement) should be modeled together → what feature-crossing models (DeepFM, DIN, sequence modeling) and multi-task structures (MMoE, PLE) each solve → seesaw between objectives, how the fusion formula is decided and tuned online → model complexity and latency budget; the benefit and cost of real-time features
- Signs of a solid answer: knows the motivation and failure modes of multi-task structures; the fusion formula has a basis and an online tuning method; has latency budget numbers

### Re-ranking and diversity
- Ladder: what re-ranking solves that ranking cannot (diversity, business rules, whole-page effect) → how scattering, MMR and list-wise modeling each work → how to trade off diversity against efficiency metrics and how to measure it → the latency and complexity limits of re-ranking
- Signs of a solid answer: knows where re-ranking sits and what it targets; has diversity metrics; can state the trade-off between rule-based and model-based re-ranking

### Cold start and exploration
- Ladder: what information new users and new items each lack → what content features, cross-domain transfer, exploration traffic and bandits each solve → how much exploration traffic, how to measure the long-term benefit of exploration → the trade-off between cold start and overall efficiency
- Signs of a solid answer: has a concrete plan for new-item cold start; exploration is quantified; knows the cost of exploration

### Generative recommendation and LLMs in search and recommendation
- Ladder: which layer generative recommendation replaces (recall, ranking, or the whole thing) → in which scenarios sequence generation, semantic IDs, and LLM-made features or labels each help → what to do about latency and cost; the gap between offline and online results → when a large model should not be used; spot-checking and bias in LLM labeling
- Signs of a solid answer: has a clear judgment on the layer replaced; has a latency and cost account; has run consistency spot checks on LLM labels
