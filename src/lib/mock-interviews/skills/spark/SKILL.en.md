---
name: spark
description: Interviewing on Spark shuffle and skew, memory tuning, Catalyst and stream processing. Read when the JD names Spark.
keywords: [spark, pyspark, spark sql, shuffle, data skew, aqe, structured streaming, hive, flink, kafka, yarn, big data, compute engine, executor, catalyst]
layer: detail
domains: [data-engineering]
---

## What interviewers care about

Spark is the default compute engine for big data development roles in China, and almost every interview for data development, data warehousing, or big data platforms tests it. In real interviews the core of a Spark question is always one of three things: why a job is slow (shuffle, skew, small files, parallelism), why it crashes (OOM, GC, lost executors), and why the result is wrong (deduplication, late data, non-idempotent writes). What interviewers care about most is whether the candidate can read the Spark UI and execution plans, can turn "tuning parameters" into "which step of execution this changed", and knows the side effects of each optimization. Plenty of candidates can recite "seven ways to fix data skew" but cannot say how to confirm skew or how to find the skewed key, and that is exactly the gap to separate out.

For campus hires, focus on the execution model: RDD versus DataFrame, narrow and wide dependencies and stage boundaries, the shuffle process, caching and persistence, semantics of common operators. For experienced hires, focus on production tuning and incidents: the memory model and OOM diagnosis, what AQE can and cannot do, Structured Streaming state and consistency, working with the Hive metastore and Kafka, and resource and cost governance. For platform roles, press on Spark on K8s, dynamic resource allocation, and multi-tenant isolation; for real-time roles, compare with Flink and press on the basis for choosing.

How to ask like an interviewer in this field:
- Start every question from a Spark UI or error symptom and test four steps: what to look at, how to confirm, what to change, and what the side effects are; do not test recall of parameter names.
- Prefer pressing on pitfalls the candidate actually hit over general knowledge: have them retell the diagnosis of one specific incident, and interrupt midway with "which metric were you looking at in that step".
- When a candidate says "I tuned a parameter", press on which step of the execution plan it changed; when they say "I used some method", press on how they confirmed it applied.
- Data scale determines the answer: a GB-scale job should not involve elaborate skew handling, while TB-scale and above must involve shuffle and resources; ask about scale before judging.
- There is no standard answer to Spark versus Flink selection questions; look at whether the candidate gives reasons from latency, state, team stack, and operational cost.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows "Spark tuning / X-times performance gain" → probe runtime before and after, the bottleneck seen in the Spark UI, which parameter or logic was changed, and the side effects
- Resume shows data skew handling → probe how it was discovered, what the skewed key was, what method was used, and how much the data inflated
- Resume shows Structured Streaming / real-time jobs → probe latency requirement, state size, watermark, and consistency after restart
- Resume shows Spark + Hive data warehouse → probe how data is written, small file governance, number of dynamic partitions, and read consistency for downstream consumers
- Resume shows PySpark → probe UDF performance problems, pandas UDF and Arrow, off-heap memory configuration
- Resume shows Spark + Kafka → probe offset management, consumer lag, backpressure
- Resume shows Spark on K8s / platform building → probe resource isolation, dynamic allocation, shuffle storage approach
- Resume also shows Flink → probe why Spark or Flink was chosen for this scenario and the specific metrics behind the choice
- Resume shows lakehouse tables (Iceberg / Hudi / Paimon) + Spark → probe write atomicity, small files and snapshot cleanup, how conflicts are handled when Spark and other engines write concurrently
- Resume shows "job stability governance / failure rate reduction" → probe the main failure types (OOM, shuffle failure, upstream dependency delay), their respective shares, and how each was handled

## Common failures and red flags

- Execution model and stage boundaries: cannot explain why stages split at a shuffle; only looks at total runtime and never at stage and task distributions
- Shuffle mechanics and cost: thinks reduceByKey and groupByKey are no different; does not know the default shuffle partition count of 200 and what it means
- Data skew detection and handling: recites seven methods but cannot say how to confirm the skewed key; answers "add a salt" for every scenario; does not know AQE skew join only handles sort merge join
- Memory model and OOM: fixes every memory problem by raising executor.memory; does not know memoryOverhead and off-heap memory; collects all data on the Driver
- Spark SQL and Catalyst optimization: never reads explain; treats hints as a routine tool; does not know UDFs block pushdown
- AQE and dynamic optimization: thinks AQE is a universal switch; does not know it depends on shuffle-stage statistics
- Caching, persistence and small files: thinks more cache is always better; does not know coalesce does not trigger a shuffle and so can cause skew
- Structured Streaming: does not know the relationship between watermark and state cleanup; thinks a checkpoint equals exactly-once; unclear on foreachBatch semantics
- Working with Hive / Kafka / Flink: does not know overwrite is non-atomic; cannot say when Kafka offsets are committed
- Resource configuration and cost: copies configs from templates; does not know the HDFS throughput problem of too many cores per executor
- Operator semantics and result correctness: does not know the difference between transformation and action; thinks collect after count will not recompute; uses current time or random numbers inside a UDF
- PySpark and UDF performance: writes all logic as UDFs; does not know the Python worker is a separate process that uses off-heap memory; has never heard of Arrow

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Execution model and stage boundaries
- Ladder: differences between RDD, DataFrame and Dataset and how to choose → how narrow and wide dependencies determine stage boundaries, the Job / Stage / Task hierarchy → how to read a Spark UI where one job has dozens of stages and many are skipped, which step in the DAG is the bottleneck → trade-off between DataFrame (Catalyst optimizes) and RDD (fine-grained control)
- Signs of a solid answer: can map explain output to stages in the UI; knows Exchange is the shuffle boundary; judges skew from the median and max task duration

### Shuffle mechanics and cost
- Ladder: which operators trigger a shuffle → the shuffle write / read process, sorting and spilling, number of shuffle files → heavy disk spill in the shuffle stage, fetch failures, an External Shuffle Service crash, and how to investigate → trade-off between reducing shuffle (broadcast, pre-partitioning, map-side pre-aggregation) and raising parallelism
- Signs of a solid answer: distinguishes shuffle-write spill from shuffle-read fetch problems; understands that map-side combining reduces data volume; knows that losing an Executor loses its shuffle files

### Data skew detection and handling
- Ladder: what skew looks like → why a few tasks run for so long (uneven key distribution, null keys, hot join keys) → how to locate the skewed key (sampling statistics, task data volume in the UI), what to do about skew in a big-table-to-big-table join → where salting, broadcast, and automatic AQE handling each apply and their side effects (inflation, randomness, secondary aggregation)
- Signs of a solid answer: first confirms the task data volume gap in the UI; samples to find the top keys; handles null values separately; understands how AQE splits skewed partitions and its limits

### Memory model and OOM
- Ladder: which parts Executor memory divides into → how execution and storage memory borrow from each other under unified memory management, what off-heap memory is used for → how to locate "Container killed by YARN", Driver OOM (collect, large broadcast), and Executor OOM (large partitions, too much caching) → priority among adding memory, tuning parallelism, and changing the logic
- Signs of a solid answer: separates on-heap from off-heap; knows Python UDFs and Netty buffers use off-heap memory; splits large partitions by raising parallelism rather than adding memory

### Spark SQL and Catalyst optimization
- Ladder: the process from SQL to physical plan → predicate pushdown, column pruning, constant folding, what drives join strategy selection → partition pruning not taking effect, broadcast join not triggering, missing statistics producing a poor plan, and how to investigate → cost of CBO statistics collection, risks of forcing a strategy with hints
- Signs of a solid answer: can read PartitionFilters and PushedFilters in explain; knows wrapping a partition column in a function or implicit type conversion breaks pruning; understands how the broadcast threshold relates to statistics

### AQE and dynamic optimization
- Ladder: what problem AQE solves → mechanisms for merging small partitions at runtime, switching join strategy dynamically, and splitting skewed partitions → after enabling AQE the partition count changes, output small files go up or down, or performance gets worse instead of better, and how to analyze it → AQE's boundaries: what it cannot optimize and when to turn it off
- Signs of a solid answer: understands AQE re-plans at stage boundaries; knows the target-size parameter for partition merging; knows it has no effect on streaming and shuffle-free jobs

### Caching, persistence and small files
- Ladder: difference between cache and persist and the storage levels → when caching pays off, how caching relates to memory pressure and recomputation → too many output small files drag down HDFS / metadata and create too many tasks on read, and how to govern it → trade-off between repartition and coalesce, cost of merging before write
- Signs of a solid answer: estimates the target partition count from data volume; repartitions before write by partition key plus a random number; combines with AQE merging; understands what checkpointing does when lineage gets too long

### Structured Streaming
- Ladder: difference between micro-batch and continuous processing → what checkpoint, offset management, watermark, and the state store do → state growing without bound, late data being dropped, duplicate output after restart, and how to investigate → what end-to-end exactly-once depends on (a replayable source, an idempotent or transactional sink) and the basis for choosing versus Flink
- Signs of a solid answer: watermark controls state TTL; sink is idempotent or deduplicates by batchId; understands the lower bound of micro-batch latency; can say where Flink is stronger (low latency, complex state)

### Working with Hive / Kafka / Flink
- Ladder: how Spark reads and writes Hive tables and its metastore dependency → dynamic-partition writes, bucketed tables, syntax and function differences between Hive and Spark SQL → an overwrite leaves downstream reading empty data, Kafka consumer offsets lost or duplicated, Spark and Flink conflicting when writing the same lakehouse table, and how to handle each → principles for dividing work between engines in unified batch and stream
- Signs of a solid answer: writes to a temporary partition and then renames, or uses the lakehouse table's atomic commit; stores Kafka offsets in the checkpoint rather than auto-committing; divides batch and stream by latency need and state complexity

### Resource configuration and cost
- Ladder: how to decide executor count, cores, and memory → dynamic resource allocation, matching parallelism to resources → severe cluster queueing, preemption, a job holding resources for a long time without releasing them, and how to govern it → conflict between speeding up a single job and overall cluster throughput, differences between Spark on YARN and on K8s
- Signs of a solid answer: works backward from data volume and partition count to parallelism; enables dynamic allocation with sensible upper and lower bounds; reads the task time distribution in the UI to spot wasted resources

### Operator semantics and result correctness
- Ladder: semantics of map/flatMap, reduceByKey/groupByKey, and each join type → lazy evaluation and actions triggering recomputation, why accumulators over-count under retries → the same job producing different results across two runs (non-deterministic UDFs, random numbers, recomputation, external state) and how to locate the cause → using cache to guarantee consistency and its memory cost
- Signs of a solid answer: understands how lineage recomputation and task retries affect side effects; deduplication semantics and null handling are explicit; outputs carry reconciliation metrics

### PySpark and UDF performance
- Ladder: execution differences between PySpark and Scala Spark → serialization overhead of Python UDFs, why pandas UDFs and Arrow are fast → a PySpark job ten times slower than the same logic in SQL, Executor off-heap memory eaten up by Python processes, and how to investigate → use built-in functions instead of UDFs whenever possible, trade-off between Python flexibility and performance
- Signs of a solid answer: prefers built-in functions and SQL expressions; when a UDF is unavoidable, switches to a pandas UDF and tunes the Arrow batch size; sets a memory cap for Python workers
