---
name: system-design
description: Interviewing on system design covering requirements, capacity estimation, technology choice, sharding, consistency, fault tolerance.
keywords: [system design, architecture design, high concurrency, capacity estimation, distributed systems, consistency, caching, message queue, rate limiting, fault tolerance, architecture, backend, infrastructure, full stack]
layer: base
---

## What interviewers care about

At top Chinese internet companies, system design questions usually appear in the second or third round. The format is a business scenario (short links, flash sales, feed, IM, like counters, order timeout closing, distributed IDs), and the candidate designs from scratch and takes continuous follow-ups. The system design round at multinationals puts more emphasis on the candidate driving the process: clarify requirements, estimate scale, draw a high-level design, go deep on one or two components, discuss trade-offs and failure modes. What the interviewer really evaluates is not how complete the architecture diagram is, but whether the candidate can explain why each component exists, and whether they can adjust the design when pressed with "what if X changes" rather than fall apart.

For campus candidates, the complexity drops noticeably: the questions are single-point decisions such as "why a cache, why a queue, how do you prevent overselling", and whether the candidate can turn "high concurrency" into concrete numbers through estimation. For experienced candidates, the full range of trade-off ability is required: choices at the CAP level, deciding the shard key, handling cross-service consistency, canary release and rollback, cost.

Interviewers care about three things above all. First, clarify before designing: a candidate who jumps to an architecture diagram without asking about scale, read/write ratio, or consistency requirements will almost certainly score low. Second, a feel for numbers: can they translate "ten million users" into QPS, storage, and bandwidth, and from that judge whether sharding or caching is needed. Third, failure modes: what happens to the system when each component dies, and whether data can be lost, duplicated, or inconsistent; has the candidate thought about it.

How to ask like an interviewer in this field:
- A system design question must start with requirements clarification. If the candidate starts designing without asking about scale, do not interrupt at first; afterward, test whether the design is over- or under-built with "what if traffic is one tenth / ten times what you assumed".
- For every component, press on "what happens if we remove it" and "what happens if it goes down", testing the reason for its existence and its failure modes, not the completeness of the diagram.
- For campus candidates, reduce the question to single-point decisions and estimation, and look at number sense and causal reasoning; for experienced candidates, it must involve cross-service consistency, sharding, failure recovery, and cost trade-offs.
- Do not test middleware names, versions, or config options; test the reasons for choosing and the alternatives. When a candidate used middleware they are unfamiliar with, let them discuss using an alternative they know.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows "high concurrency", "flash sale", "rush purchase" → probe the traffic numbers intercepted at each layer, the oversell prevention method, and the idempotency design.
- Resume shows Redis caching → probe the failure window of the consistency strategy, hot key handling, and hit rate.
- Resume shows message queues → probe delivery semantics, consumer idempotency, backlog handling and monitoring.
- Resume shows database and table sharding → probe the basis for choosing the shard key, the cross-shard query approach, and the steps of scale-out migration.
- Resume shows microservices → probe the basis for drawing service boundaries, the cross-service consistency approach, and timeout and circuit-breaker configuration.
- Resume shows "high availability" or "99.9%" → probe where the single points are, the data window on primary-replica failover, and real outage experience.
- Resume shows a self-built middleware or framework → probe why an existing one was not used, the failure modes of the design, and who has used it.

## Common failures and red flags

- Requirements clarification and scoping: draws a diagram without asking any questions; treats every requirement as mandatory; cannot state the difference between functional and non-functional requirements.
- Capacity estimation: cannot convert daily active users to QPS; does not feed the estimate back into design decisions; makes order-of-magnitude errors without noticing (for example, computes that one machine needs 10 TB of memory and still does not change the design).
- Storage choice: picks MySQL for every scenario or MongoDB for every scenario; cannot relate access patterns to storage structure; gives "NoSQL is fast" as a reason.
- Caching strategy: only recites the names of "the three avalanches"; the only consistency strategy is "delete the cache first, then update the database" without being able to describe the race; has no idea about hot keys.
- Data sharding and scalability: casually picks the primary key ID as shard key; answers cross-shard queries with just "use ES"; does not know scale-out requires migrating data.
- Consistency and idempotency: answers "use a distributed transaction framework" for every cross-service write; says idempotency is just "add a unique index" without considering out-of-order delivery; does not know about reconciliation.
- Message queues and async processing: treats the queue as universal decoupling without discussing reliability; does not know at-least-once delivery means consumers must be idempotent; answers a backlog with just "add consumers".
- Rate limiting, degradation and fault tolerance: only recites rate limiting algorithm names; does not know a timeout should be shorter than the caller's timeout; the degradation plan is "return an error".
- High availability and failure handling: says high availability is just "deploy several machines"; does not know primary-replica failover can lose data; treats multi-active as the default option.
- Distributed IDs and delayed tasks: answers delayed tasks with just "periodically scan the table" without considering load; does not know Redis expiry events are unreliable; cannot explain clock rollback in the Snowflake algorithm.
- Observability and release: monitoring means "look at the logs"; cannot state an SLO; release is a full cutover at once.
- End-to-end scenario walkthrough: recites a memorized diagram but cannot explain why each layer exists; throws the design away and starts over after a failure is injected; does not know where the bottleneck of their own design is.

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Requirements clarification and scoping
- Ladder: have the candidate list what to ask → the distinction between functional and non-functional requirements (latency, availability, consistency) → which requirements conflict with each other and how to prioritize → the interviewer deliberately changes one constraint and watches how the design changes
- Signs of a solid answer: asks about scale, read/write ratio, latency and consistency requirements first; identifies the key constraints; states assumptions proactively and asks the interviewer to confirm.

### Capacity estimation
- Ladder: how to convert daily active users to QPS → the peak-to-average multiplier, estimating storage volume → using the estimate to decide whether one machine can handle it and whether sharding is needed → whether the design still holds if the estimate is off by an order of magnitude
- Signs of a solid answer: the estimate has stated assumptions and unit conversions; can give the basis for the peak multiplier; the estimate directly drives the sharding, caching, and async decisions.

### Storage choice
- Ladder: where relational and NoSQL each fit → choosing storage by access pattern (point lookup, range, full-text, time series, graph) → why one business ends up using several stores and how data is synchronized between them → the cost of choosing the wrong store and the migration path
- Signs of a solid answer: starts from access patterns and the data model; can state each store's write amplification, read amplification, or consistency cost; knows the synchronization approach when several stores coexist.

### Caching strategy
- Ladder: why cache and at which layer → consistency strategies between cache and database (cache-aside, write-through, delayed double delete) → how to defend against penetration, breakdown, and avalanche, and how to detect and handle hot keys → below what hit rate a cache is not worth it
- Signs of a solid answer: can state the failure window of each consistency strategy; has a hot key plan using a local cache plus multi-level caching; knows the cache monitoring metrics; can assess the complexity the cache introduces.

### Data sharding and scalability
- Ladder: where the ceiling of a single database and table is → how to choose the shard key and why → what to do about cross-shard queries, cross-shard transactions, and hot shards → how data migrates on scale-out, the trade-off between consistent hashing and range sharding
- Signs of a solid answer: derives the shard key backward from query patterns; has a heterogeneous index table or redundant-write approach; can state the scale-out plan and the steps of dual-write migration.

### Consistency and idempotency
- Ladder: which scenarios suit strong consistency and which suit eventual consistency → ways to implement idempotency (unique key, state machine, dedup table, token) → consistency approaches for cross-service writes (local message table, transactional message, Saga, TCC) and the failure points of each → when to give up on distributed transactions and fall back on reconciliation
- Signs of a solid answer: can tell consistency levels apart and map them to business needs; idempotency design accounts for concurrency and out-of-order delivery; knows the compensation and manual intervention path for eventual consistency.

### Message queues and async processing
- Ladder: why introduce a queue, what peak shaving and decoupling each mean → causes of lost, duplicate, and out-of-order messages and their countermeasures → how to detect and handle consumer backlog, what to do with dead letters → the cost to user experience and observability when sync becomes async
- Signs of a solid answer: can match delivery semantics to the business; has backlog monitoring plus rate limiting, scaling, and discard strategies; considers status queries after going async.

### Rate limiting, degradation and fault tolerance
- Ladder: differences among rate limiting algorithms (fixed window, sliding window, token bucket, leaky bucket) → whether to limit at the gateway or in the service, and along which dimensions → circuit breaking, degradation, and fallback data when a dependency times out or goes down → who flips the degradation switch and how to avoid hurting the core path
- Signs of a solid answer: timeouts, retries, circuit breakers, and isolation (thread pool or semaphore) form a system; has a fallback data plan; knows retry storms and backoff.

### High availability and failure handling
- Ladder: where the single points are and how to remove them → the data loss window and split-brain on primary-replica failover → during a data center outage, which features stay up and which do not → the cost and consistency price of multi-active, which businesses justify it
- Signs of a solid answer: can state each component's failure mode and recovery time; has a business compensation plan for data loss; is cost-aware about multi-active.

### Distributed IDs and delayed tasks
- Ladder: why auto-increment primary keys will not do → bit allocation and clock rollback in the Snowflake algorithm, double buffering in segment mode → what to do when the ID service itself goes down → trade-offs among polling, Redis ZSet, and MQ delayed messages for delayed tasks (order timeout)
- Signs of a solid answer: picks a plan by scale and reliability requirements; considers lost tasks and duplicate execution; the ID service has a degradation path.

### Observability and release
- Ladder: what monitoring a new system needs before launch → what metrics, logs, and tracing each solve → which metrics to start from when investigating "the API occasionally times out" → how canary release shifts traffic and how to set rollback criteria
- Signs of a solid answer: has a RED- or USE-style metric system; has alert thresholds and SLOs; canary has quantified advance and rollback criteria.

### End-to-end scenario walkthrough
- Ladder: given a common system (short links, likes, IM, flash sale, feed), ask for a complete design → go deep on the read and write path of one component → the interviewer injects a failure or ten times the traffic and watches how the design adjusts → discuss what in this design would need refactoring first
- Signs of a solid answer: the layered funnel has numbers; each component has a stated failure mode; can point out the next bottleneck of their own design and its evolution path.
