---
name: data-engineering
description: How to interview data engineers, covering warehouse modeling, batch and streaming pipelines, scheduling, data quality, lakehouse.
keywords: [data development, data warehouse, big data development, etl, data engineer, hive, spark, flink, dimensional modeling, real-time data warehouse, lakehouse, iceberg, paimon, dolphinscheduler, data quality]
layer: domain
---

## What interviewers care about

Data developers and data warehouse engineers turn business data into trustworthy, usable, sustainably delivered data assets: they build layered models, write batch and real-time jobs, maintain scheduling dependencies, guarantee data quality and SLAs, and control storage and compute cost. In real interviews the most common questions are modeling judgment (how should this table be designed, who owns the metric definition), pipeline incidents (how to investigate data that is late, wrong, or duplicated), and performance and cost (what to do when a job will not finish or cluster spend goes up). Interviewers care most about three things. First, whether the candidate has really been accountable for data accuracy: have they had incidents, backfilled data, traced metric definitions back. Second, whether modeling lands on the business rather than reciting Kimball's four steps. Third, their grasp of the whole pipeline: from event tracking collection to reports, how a failure at each stage shows up.

For new-grad hiring, the emphasis is SQL skill (window functions, multi-table joins, dedup and retention calculations), the basic concepts of warehouse layering and dimensional modeling, and Hive/Spark execution principles. For experienced hires, the emphasis is real-time warehouse and lakehouse selection, data quality systems, job governance and cost optimization, and cross-team metric alignment. Top-tier companies have clearly put more weight recently on "data as an asset" and cost reduction, while foreign companies focus more on engineering discipline in pipelines (testing, versioning, idempotency).

How to ask questions like an interviewer in this field:
- Hang every question on "data accuracy" or "pipeline incidents": do not ask "what is a slowly-changing (zipper) table", ask "would you use a zipper table in this scenario, and if not, how would you trace history".
- Always tie to the candidate's data scale: the best solution at GB-per-day differs completely from the best at PB scale, so establish scale before judging whether a solution is right.
- Do not test component versions or parameter names; test execution principles and troubleshooting order. When a candidate says "tune the parameters", press on which step of execution that changes.
- Give modeling questions a concrete business scenario (orders, logs, users) and conflicting requirements, and have the candidate set the grain and state the tradeoffs on the spot.
- The 2026 architectural mainline in data engineering is the unified batch-and-stream lakehouse: open table formats (Iceberg and the like) have become the cross-engine storage standard, real-time pipelines write directly to the lake via CDC and stream processing engines, and AI use cases have introduced new SLAs for data freshness. Interviewers will press on how the candidate unifies batch and stream, what table formats solve, and how freshness is measured.

## Probing projects and internships

When the resume shows experience like the following, this is where to start and what to press on. An answer is solid only when the candidate can state the mechanism, where the numbers came from, and one real failure or tradeoff. If they offer only framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume says "built a data warehouse" → press on how many layers, how the grain was set, the reuse rate of the common layer, and how many downstream consumers use the tables they built themselves
- Resume mentions a real-time warehouse / Flink → press on state size, checkpoint interval and duration, how late data is handled, and what incidents occurred
- Resume mentions a "data quality system" → press on the number of rules, block rate, false-alarm rate, and the most recent issue it caught
- Resume says "performance improved X-fold" → press on the job duration before and after, how the bottleneck was located, what was changed, and how large the data was
- Resume mentions Iceberg / Hudi / Paimon → press on why they migrated, the pain points before migration, and how small files and metadata are governed
- Resume mentions a scheduling platform (Airflow / DolphinScheduler) → press on job scale, dependency design, rerun and backfill mechanisms, and SLA attainment rate
- Resume mentions "data governance / metrics system" → press on a concrete metric-definition conflict, how they drove unification, and the change management process
- Resume mentions CDC / Debezium / Canal → press on how deletes and schema changes are handled, what the latency is, and how resume-from-checkpoint works

## Common failures and red flags

- Warehouse layering and modeling in practice: can only recite layer names; cannot say which layer the tables they owned sit in or who is upstream and downstream; thinks "more wide tables is better"
- Dimensional modeling and fact table design: cannot state the grain clearly; piles every field into one table; does not know how to write a historical query against a zipper table
- Batch pipelines and SQL optimization: immediately says "add executors"; does not look at the execution plan; does not know skew shows up as a few tasks running very long
- Scheduling and job governance: does not know whether jobs are idempotent; backfills by manually changing the date and rerunning; has no concept of baselines or SLAs
- Data quality and observability: has a "finished running" check but no "ran correctly" check; when something goes wrong, eyeballs tables one by one starting from upstream
- Metric definitions and data asset management: thinks metric definitions are the business's job and unrelated to the warehouse; changes a definition without a change record
- Data collection and event tracking: assumes that if data arrived it is correct; does not know how an update appears in the binlog
- Live SQL questions and execution principles: can only group by and not use window functions; does not notice row counts doubling after a join; runs count(distinct) on a big table without knowing it will skew

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed here, as a reference for "how deep counts as grounded". Which topics to ask and how many is decided by this JD and this resume, not by a quota.

### Warehouse layering and modeling in practice
- Ladder: what problem each of ODS/DWD/DWS/ADS solves → why layering reduces duplicated computation and isolates change, and the cost of too many layers → how to govern business users querying ODS directly and bypassing the warehouse, or DWS tables growing explosively → wide tables versus star schemas, conformed dimensions, and the tradeoff against "each business line builds its own"
- Signs of a solid answer: can judge a table's value from lineage and access logs; understands the common-layer reuse rate metric; knows layering exists to unify metric definitions, not for its own sake

### Dimensional modeling and fact table design
- Ladder: the difference between fact and dimension tables, and how the grain is set → where transaction fact tables, periodic snapshots, and accumulating snapshots each apply → how to investigate duplicates in a fact table and inconsistent metric definitions when order status changes frequently → the storage and query cost of slowly changing dimensions (SCD2 / zipper tables), and when to just store snapshots
- Signs of a solid answer: sets the grain before the fields; uses an accumulating snapshot for multi-stage processes; understands degenerate dimensions and surrogate keys; knows SCD2's effect on downstream joins

### Batch pipelines and SQL optimization
- Ladder: the execution flow of a Hive/Spark SQL statement → the effect of partitioning, bucketing, and small files on performance → how to locate why a job grew from 30 minutes to 3 hours (data skew, Cartesian product, broken partition pruning) → the priority among adding resources, changing the SQL, and changing the model
- Signs of a solid answer: looks first at the execution plan and the stage duration distribution; checks whether partition pruning and predicate pushdown take effect; locates and splits skewed keys; small-file compaction strategy

### Scheduling and job governance
- Ladder: why a scheduling system rather than crontab → how DAG dependencies, reruns, backfills, and idempotency are each guaranteed → how to handle upstream delay causing cascading downstream failures and reruns causing duplicate writes → designing SLA tiers and baseline alerts, and setting resource queue priorities
- Signs of a solid answer: job writes overwrite by partition to guarantee idempotency; baseline alerts on the core pipeline; dependency checks use partition readiness rather than fixed times

### Data quality and observability
- Ladder: which dimensions data quality covers (completeness, accuracy, consistency, timeliness, uniqueness) → where in the pipeline to place rule checks, block or alert → how to quickly tell whether a metric dropping 30% is a data problem or a business problem → the cost of full validation versus sampling and tiered validation
- Signs of a solid answer: investigates layer by layer from source volatility, partition record counts, and primary key uniqueness; lineage helps locate the problem; blocking rules configured on core tables

### Metric definitions and data asset management
- Ladder: why the same "active users" gives different numbers in different departments → metric definitions (atomic metrics, derived metrics, modifiers) and unifying the definition → whether to backfill history after a definition change and how to notify downstream → a metrics platform versus relying on documentation conventions, in return on investment
- Signs of a solid answer: distinguishes atomic from derived metrics; definition changes carry a version and effective date; lineage can find every affected downstream consumer

### Data collection and event tracking
- Ladder: where logs, binlog (CDC), and API pulls each apply → how CDC handles ordering, deletes, and schema changes → how to detect and backfill lost or duplicate tracking events → the relationship between investment in collection-side governance (tracking specs, pre-release validation) and downstream cleaning cost
- Signs of a solid answer: tracking validation and gray-release comparison; CDC handles deletes and primary key changes; the collection side carries a version number

### Live SQL questions and execution principles
- Ladder: how to write dedup, topN, consecutive-login, and retention questions → window functions, row-count amplification in multi-table joins, the semantics of null in comparison and aggregation → what to do when the same SQL gives different results in Hive and Spark or count(distinct) will not finish → the maintainability versus performance tradeoff of splitting a complex SQL into multi-step intermediate tables
- Signs of a solid answer: confirms the definition before writing; uses row_number and date differences to build consecutive groups; uses two-stage aggregation or approximate algorithms for high-cardinality dedup; reconciles totals against the result
