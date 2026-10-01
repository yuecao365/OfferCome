---
name: backend
description: How to interview backend engineers, stack-agnostic, covering caching, queues, APIs, reliability, observability, capacity, releases.
keywords: [backend, server-side, backend development, backend engineer, microservices, distributed systems, cache, redis, message queue, kafka, high concurrency, rate limiting, observability, api design, mysql, database, transactions, index, dba, sharding]
layer: domain
---

## What interviewers care about

A backend engineer's daily work is turning business requirements into stable, scalable, debuggable production services: designing APIs and data models, handling concurrency and consistency, wiring in caches and queues, watching dashboards and alerts, surviving traffic peaks, and dealing with production incidents. In real interviews, whether the candidate writes Java, Go, or Python, the same set of questions keeps coming up: how is data stored, how is it read fast, how is it written without loss, what happens when something dies, how do you know it died, and what breaks first when traffic grows tenfold. Interviewers care most about three things. First, whether the candidate can explain why each component in their own system is there, rather than "everyone builds it this way". Second, whether they have real production troubleshooting experience, the full chain from alert to root cause. Third, whether they have their own judgment about the tradeoffs among consistency, availability, cost, and complexity, rather than reciting CAP.

For new-grad hiring, the emphasis is fundamentals: the difference between HTTP and RPC, basic cache usage, transactions and locks, and whether the candidate can break a simple business problem into sensible tables and APIs. What matters is whether the thinking is clear and whether follow-ups can push the candidate to think further. For experienced hires, the emphasis is engineering judgment: give a concrete incident or capacity problem and watch the troubleshooting order, whether the candidate quantifies (QPS, P99, connection count, hit rate), and whether the plan includes rollback and degradation. Top-tier and foreign companies have recently leaned toward scenario walk-throughs: give a business description and have the candidate design it live and explain every decision. Pure terminology questions ("tell me about Redis data structures") are an increasingly small share.

How to ask questions like an interviewer in this field:
- Stack-agnostic: this pack tests only the fundamentals everyone must know. Deep dives into language details, database internals, and distributed consistency live in their own detail packs (java, go, mysql-internals, distributed-systems, and so on). Read those when the JD or resume lands on them.
- 2026 adds one more line of questioning: candidates who have put an LLM or Agent into a service get asked how they handle timeouts, retries, idempotency, cost budgets, and caching for non-deterministic calls. Treating them like any other downstream dependency counts as not having thought about it.
- Every question needs numbers: whenever the candidate states an architectural decision, press for QPS, data volume, latency, and machine count, and use scale to test whether the design is over-engineered or under-designed.
- Prefer failures and tradeoffs: do not ask "what is X", ask "what does X look like when it breaks" and "why not the simpler Y".
- Fit questions to the scale of the candidate's project: do not ask about sharding for a project with a few thousand daily actives; for a project with tens of millions of daily actives, you must press on capacity, degradation, and change management.

## Probing projects and internships

When the resume shows experience like the following, this is where to start and what to press on. An answer is solid only when the candidate can state the mechanism, where the numbers came from, and one real failure or tradeoff. If they offer only framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume says "high concurrency" → press on the concrete QPS, P99, machine count, which layer was the bottleneck, and how load testing was done; flag candidates who cannot give numbers
- Resume mentions Redis → press on what was cached, hit rate, how big keys and hot keys were handled, what happens to the system if Redis goes down, and whether there was ever a cache consistency incident
- Resume mentions Kafka/RocketMQ/RabbitMQ → press on how consumer idempotency is done, whether backlog ever built up, whether ordering is required, and how the partition count was chosen
- Resume mentions sharding (splitting databases and tables) → press on the shard key, how cross-shard queries are handled, whether they ever scaled out, and why not archiving or read/write splitting first
- Resume mentions microservices → press on how many services, what the split was based on, what hurt most after splitting, and whether any were ever merged back
- Resume says "performance improved by X%" → press on metrics before and after, how the bottleneck was located, whether the numbers come from a load-test environment, and whether there was a regression after release
- Resume mentions handling production incidents → press on how the alert caught it, how long it took to locate, what the root cause was, and what mechanism was changed afterward
- Resume mentions "API design" → press on how idempotency, pagination, error codes, and version compatibility were handled, and whether upstream retries ever overwhelmed the service
- Resume mentions MySQL tuning / slow SQL → press on how they read the execution plan, how the index was changed, the numbers before and after, and whether statistics or parameters ever misled them
- Resume mentions primary-replica / high availability / data migration → press on how replication lag is handled, whether they ever failed over, how split-brain is prevented, and the dual-write and verification plan for the migration

## Common failures and red flags

- Cache design and consistency: can only say "add a Redis cache"; treats delayed double delete as the standard answer but cannot say which race it addresses; does not know the hit rate or key-count order of magnitude in their own system
- Message queues and async decoupling: believes an MQ guarantees exactly-once; has no idempotency design on the consumer side; does not know the partition count, consumer groups, or consumer lag metrics of their own topic
- API design and evolution: thinks API design is just naming conventions; achieves idempotency by "a unique index error from the database" without considering user experience or concurrency; paginates with offset into the millions of pages
- Reliability: timeouts, retries, circuit breaking, degradation: all calls share one thread pool or connection pool; retries have no cap and no backoff; circuit-breaker thresholds are guesses
- Observability and production troubleshooting: troubleshooting is all grep through logs; does not know the P99 of their own service; alerts are so numerous that nobody reads them
- Rate limiting, capacity planning, and load testing: does not know where the rate-limit threshold came from; load-tests a single endpoint rather than the whole call chain; scales out only the application tier without looking at database connection counts
- Storage selection and data modeling: puts everything in MySQL or everything in MongoDB; does dual writes without handling failures; does not know the binlog subscription route
- Configuration, release, and change management: releases are manual; schema changes are bundled into the same release as code changes; no rollback drills
- Security and authentication basics: believes JWT is inherently secure; authorization is scattered across individual controllers; sensitive data is logged in plaintext

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed here, as a reference for "how deep counts as grounded". Which topics to ask and how many is decided by this JD and this resume, not by a quota.

### Cache design and consistency
- Ladder: why add a cache and at which layer → where Cache Aside / Read Through / Write Behind each fit, and why "delete the cache first, then write the database" goes wrong → what cache breakdown, penetration, and avalanche each look like in production, how to tell them apart, and how to fix them → the boundary between strong and eventual consistency: which data can tolerate a few seconds of inconsistency and which must go to the database
- Signs of a solid answer: can draw the read and write paths and point out the race window; distinguishes handling of hot keys and big keys (local cache, splitting, async loading); knows what TTL jitter, mutex rebuild, and Bloom filters each solve; can name which business flows use a cache and what degree of inconsistency they accepted

### Message queues and async decoupling
- Ladder: which scenarios call for async → where at-least-once, at-most-once, and exactly-once are each guaranteed, and how consumer idempotency is done → troubleshooting and handling of message backlog, slow consumers, duplicate consumption, and out-of-order delivery → the eventual consistency that peak shaving brings, how to explain it to users in business terms, and which scenarios should not use a queue
- Signs of a solid answer: idempotency by business key or a dedup table; a backlog plan that combines throttling downstream with dynamic scale-out; ordering guaranteed by a shared partition key, with awareness that it costs parallelism; dead-letter queues and alerts; can explain how transactional messages or a local message table keep "write to database" and "send message" consistent

### API design and evolution
- Ladder: how to choose between RESTful and RPC → the design of idempotency keys, pagination cursors, error-code schemes, and versioning → what to do when an API is overwhelmed by upstream retries or old client versions cannot be retired → gRPC/Thrift versus HTTP JSON for internal APIs, and how field compatibility rules are set
- Signs of a solid answer: idempotency key generated by the client, with the server claiming it before processing; cursor pagination; error codes that distinguish retryable from non-retryable; fields only added, never removed or changed in meaning; API docs and contract tests

### Reliability: timeouts, retries, circuit breaking, degradation
- Ladder: why every remote call must have a timeout → how retry amplification (retry storm) happens, backoff and jitter, retry budgets → troubleshooting thread-pool exhaustion and cascading avalanche when a dependency slows down → what to degrade and what to protect, how to define the core path, how runbooks are drilled
- Signs of a solid answer: isolates resources per dependency (thread pool / semaphore / connection pool); timeouts allocated level by level from the call-chain budget; half-open probing in circuit breakers; degradation with a switch and fallback data; can describe one real avalanche and its fix

### Observability and production troubleshooting
- Ladder: what question logs, metrics, and tracing each answer → how to choose RED/USE metrics, sampling rate and cost → what to do when an alert fires but the logs show nothing, or slow requests reproduce only for certain users → alert noise reduction and SLO-driven alerting
- Signs of a solid answer: checks changes first (releases, config, traffic), then dependencies, then resources; a trace ID runs through everything; distinguishes error rate, latency, and saturation; mentions that alerts need a runbook; can walk through one full case from alert to root cause

### Rate limiting, capacity planning, and load testing
- Ladder: why rate limit and at which layer → the differences among token bucket, leaky bucket, and sliding window, and single-node versus distributed rate limiting → how to build load-test data, how to isolate it, and which layer the load test showed to be the bottleneck → provisioning for peak versus elastic scaling, and the tradeoff between cost and SLA
- Signs of a solid answer: computes capacity layer by layer across database, cache, and downstream dependencies; load tests use a shadow database or traffic marking; rate limits are tiered by user/endpoint/tenant with graceful rejection; hot-spot isolation; mentions runbooks and degradation switches

### Storage selection and data modeling
- Ladder: what relational, KV, document, wide-column, search, and time-series stores each suit → how to keep multiple copies of the same data (primary database + ES + cache) in sync → handling CDC/binlog sync lag, reordering, and loss → whether the consistency and operational complexity of multiple stores is worth it
- Signs of a solid answer: picks storage by query pattern; CDC instead of dual writes; reconciliation jobs; ES degrades to simple database queries

### Configuration, release, and change management
- Ladder: why most failures come from changes → the differences among gray release, blue-green, and canary, and dynamic push from a config center → compatibility problems when old and new versions coexist during a release, and what to do about the database schema on rollback → balancing release frequency against stability, and what should be automated
- Signs of a solid answer: expand-then-contract schema changes (add column, dual write, cut over, drop column); gray release by machine/user percentage with metrics watched; config changes also go through gray release; change records are queryable

### Security and authentication basics
- Ladder: the difference between authentication and authorization → what session, JWT, and OAuth2 each suit, and how to revoke a JWT → how to block unauthorized access (horizontal and vertical) uniformly at the framework layer, and what to do when an API is being abused → the impact of security measures on performance and developer productivity
- Signs of a solid answer: resource-level permission checks in one unified layer; short-lived JWT plus refresh or a blocklist; API signing and risk control; log masking
