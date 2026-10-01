---
name: streaming-lakehouse
description: Deep dive on real-time and lakehouse covering open table formats, CDC, stream state and consistency, batch-stream unification, freshness, cost.
keywords: [lakehouse, iceberg, delta, hudi, table format, cdc, debezium, flink, stream processing, exactly once, unified batch and stream, data freshness, kafka, trino, storage format, parquet, cost optimization]
layer: detail
domains: [data-engineering]
---

## What interviewers care about

This pack is the deep dive for data engineering that leans toward real-time and lakehouse work. Interview focus in 2026: why table formats (Iceberg and the like) became the standard and what they solve (ACID, schema evolution, time travel, cross-engine access); how the CDC-to-lake pipeline guarantees consistency; what stream-processing state, watermarks, and exactly-once actually rest on; whether unified batch and stream is truly unified or just two codebases; how fresh the data must be in AI scenarios and at what cost. The interviewer presses on root-causing one data inconsistency or latency incident.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows Iceberg / Delta / Hudi → probe why it was chosen, whether schema evolution and time travel were ever used, how small files and compaction were handled, whether cross-engine reads and writes caused problems
- Resume shows CDC → probe the tool and pipeline, how the initial snapshot and the incremental stream are stitched together, how out-of-order and duplicate events are handled, how much latency there is
- Resume shows Flink / stream processing → probe state size, checkpoint interval, how the watermark was set, what exactly-once rests on, how backpressure was diagnosed
- Resume shows unified batch and stream → probe whether it is one codebase or two, how metric definitions were aligned, how data repair (backfill) was done
- Resume shows "real-time" → probe the end-to-end latency figure, who set the freshness SLA, what happens when it is breached
- Resume shows lakehouse cost → probe how much goes to storage versus compute, small files, how partitioning and sort order affect queries

## Common failures and red flags

- Real-time pipelines and stream processing: cannot explain watermarks and event time; says only "Flink supports it" for exactly-once; does not know how to look at backpressure
- Storage formats and lakehouse: does not know why columnar formats are fast; answers "it's just metadata" for table formats; has never handled the small-file problem
- Cost and performance optimization: only knows to add machines; does not know how partitioning and sort order affect scan volume
- Open table formats: cannot describe the structure of snapshots and the metadata layer; has never used schema evolution; sets compaction by gut feeling
- CDC pipelines: unclear on stitching the initial snapshot to the incremental stream; does not handle out-of-order or duplicate events; no latency numbers
- Stream state and consistency: does not know where state lives or how big it is; has never handled a checkpoint failure; unclear on end-to-end consistency
- Unified batch and stream: metric definitions differ between the two codebases; data repair is manual
- Data freshness and AI scenarios: does not know how fresh downstream consumers need data to be; no SLA or monitoring for freshness

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Real-time pipelines and stream processing
- Ladder: what real-time and offline each solve, how Lambda differs from Kappa → what Flink's checkpoint, state, and watermark each do → real-time metrics not matching offline ones, late data, out-of-order events, state bloat, and how to handle each → the cost of end-to-end exactly-once, and in which scenarios at-least-once plus idempotency is enough
- Signs of a solid answer: can list the sources of difference (late data, deduplication semantics, when dimension tables update, time zones); understands state TTL; knows an idempotent or transactional write at the downstream sink is the key to end-to-end consistency

### Storage formats and lakehouse
- Ladder: why Parquet/ORC suit analytics → how columnar storage, compression, and predicate pushdown work → which Hive table pain points lakehouse tables (Iceberg/Hudi/Paimon) solve (ACID, schema evolution, small files, time travel) → the benefits, cost, and risk of migrating from Hive to a lakehouse
- Signs of a solid answer: understands how snapshots, metadata files, and small-file governance relate; knows how schema evolution affects downstream consumers; knows how well the format fits streaming upsert scenarios

### Cost and performance optimization
- Ladder: where a data platform's cost goes (storage, compute, idle scheduling) → what hot/cold tiering, lifecycle rules, compression, and job consolidation each save → how to attribute a 40% month-over-month cluster bill increase to specific jobs and owners → how to reconcile cost cutting with SLAs and development efficiency
- Signs of a solid answer: attributes cost by job and table; identifies tables nobody reads and duplicated computation; lifecycle policies; quantifies the savings and tracks them

### Open table formats
- Ladder: why a table format is needed on top of object storage → the structure of snapshots, metadata files, and manifests; how ACID, schema evolution, partition evolution, and time travel are each implemented → how to handle small files and compaction, concurrent-write conflicts, and cross-engine read/write consistency → differences among Iceberg / Delta / Hudi and how to choose; what a catalog service does
- Signs of a solid answer: can draw the snapshot and metadata hierarchy; has a compaction strategy with numbers; knows how concurrent-write conflicts are resolved

### CDC pipelines
- Ladder: what CDC solves and why it beats scheduled full loads → log parsing (binlog / WAL), stitching the initial snapshot to the incremental stream, how schema changes propagate → how out-of-order, duplicate, and delete events are handled downstream; how latency is measured → ways of writing to the lake (append, upsert, merge on read versus copy on write) and their costs
- Signs of a solid answer: has a scheme for stitching the initial snapshot to the incremental stream; handles out-of-order and duplicate events; knows the two ways to implement upsert into a lake and their trade-offs

### Stream state and consistency
- Ladder: what event time, processing time, and watermark each are, and what to do with late data → where state lives, how big it is, how a checkpoint differs from a savepoint → what exactly-once actually rests on (checkpoint plus a two-phase-commit sink), and which sinks cannot do it → how to diagnose backpressure (operator-level metrics); state bloat and TTL
- Signs of a solid answer: can name the components of end-to-end consistency; has a case of diagnosing checkpoint failure or backpressure; knows state TTL

### Unified batch and stream
- Ladder: why batch and stream end up with inconsistent metric definitions → how far one logic with two execution modes (the same SQL running batch and stream) can go → how data repair (backfill) works in a streaming setup; the Lambda versus Kappa trade-off → the real cost of unified batch and stream; which scenarios justify it
- Signs of a solid answer: knows where definition mismatches come from; has a data repair plan; can state the trade-offs of unifying versus not unifying

### Data freshness and AI scenarios
- Ladder: how fresh each downstream consumer (dashboards, features, agents, retrieval indexes) needs data to be → how freshness is defined and measured (end-to-end latency, watermark lag) → how to alert and degrade when the freshness SLA is breached; how cost rises with freshness → new requirements that vector indexes and feature platforms place on the data pipeline
- Signs of a solid answer: has freshness numbers and an SLA; knows the cost curve; can state the specific requirements AI downstream consumers place on the pipeline
