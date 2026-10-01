---
name: distributed-systems
description: Distributed systems deep dive on consistency, consensus, transactions, idempotency, locks, governance, hot writes, multi-active.
keywords: [distributed systems, consistency, consensus, raft, distributed transactions, saga, tcc, idempotency, exactly once, distributed locks, clocks, microservices, service governance, hotspots, active-active, disaster recovery, chaos engineering]
layer: detail
domains: [backend]
---

## What interviewers care about

This pack digs into everything under the word "distributed" in the backend pack: how data stays consistent across multiple machines, what to do when a cross-service operation fails halfway, how to act on the same message only once when it arrives twice, and how to survive when a data center goes down. Interviewers do not test recitation of CAP. They test which kind of consistency the candidate chose in their own system, what it cost, and what consistency incidents they have had. A key focus of second-round and architecture interviews.

## Probing projects and internships

When the resume shows experience like the following, this is where to start and what to press on. An answer is solid only when the candidate can state the mechanism, where the numbers came from, and one real failure or tradeoff. If they offer only framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume mentions distributed transactions / Seata / Saga → press on why they were needed, what happens when compensation fails, whether there was ever an inconsistency, and how reconciliation is done
- Resume mentions microservice decomposition → press on what the split was based on, what hurt most afterward, whether any were merged back, and how data ownership was decided
- Resume mentions flash sales / inventory / hotspots → press on how concurrent writes were absorbed, how hot row locks were handled, and async persistence and reconciliation
- Resume mentions distributed locks → press on what implements them, expiry and renewal, what happens under split-brain, and why not a database unique key
- Resume mentions multi-active / disaster recovery → press on how data is synchronized, how conflicts are resolved, and whether failover drills were ever run
- Resume mentions "exactly-once" → press on what guarantees it (idempotency key, transactional consumption, dedup table) and whether duplicate consumption ever occurred

## Common failures and red flags

- Consistency and consensus: can only recite CAP; cannot describe the Raft leader election and log replication flow; does not know which kind of consistency their own system has
- Distributed transactions and consistency: can only say "use Seata"; treats eventual consistency as inconsistency; does not know compensation can fail too
- Idempotency and exactly-once: believes an MQ guarantees exactly-once; achieves idempotency through a unique index error from the database without considering concurrency and user experience
- Distributed locks and clocks: Redis lock without thought given to expiry and renewal; does not know the risks of depending on the system clock
- Service decomposition and microservice governance: thinks microservices are inherently better; bases the split on technical layers rather than business boundaries; gives no thought to data ownership
- High-concurrency writes and hotspot handling: updates the inventory table directly to absorb concurrency; does not know about hot row locks; no async persistence or reconciliation
- Multi-active and disaster recovery: can only say "two sites, three centers"; does not know about data sync lag and conflicts; has never drilled a failover
- Failure drills and chaos: has never done fault injection; does not know which dependency's failure would take their whole system down

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed here, as a reference for "how deep counts as grounded". Which topics to ask and how many is decided by this JD and this resume, not by a quota.

### Distributed transactions and consistency
- Ladder: why database transactions cannot span services → the model and cost of 2PC, TCC, Saga, and local message tables → how compensation failure, hanging, and empty rollback edge cases are handled → whether the business can avoid distributed transactions by redefining the flow
- Signs of a solid answer: prefers avoiding strong consistency through reservation, state machines, and async verification; TCC has a concrete design for resource reservation in the try phase; reconciliation and manual fallback; can quantify the consistency window

### Service decomposition and microservice governance
- Ladder: why split and when not to → what boundary to split along (domain, team, change frequency), and why a shared database is an anti-pattern → what to do about longer call chains, distributed transactions, and painful integration testing after the split → cost comparison of monolith, modular monolith, and microservices
- Signs of a solid answer: strangler pattern for gradual migration; decouples data first, then services; understands service registry and discovery, config center, and unified gateway without being dogmatic; can cite a case of merging back after splitting too far

### High-concurrency writes and hotspot handling
- Ladder: what makes scenarios like flash sales and coupon grabbing hard → whether inventory deduction goes in Redis or the database, and Lua atomic operations versus database row locks → what to do about hot row lock waits and a single Redis key saturating a single shard → how to rank accuracy, fairness, and throughput
- Signs of a solid answer: front-line interception (local rate limiting, queueing), Redis pre-deduction, async persistence, reconciliation and compensation; hot-key splitting; request coalescing; can state the fallback when Redis goes down

### Consistency models and consensus
- Ladder: what strong, linearizable, and eventual consistency each promise → Raft leader election, log replication, and membership change; why a majority quorum guarantees no loss → what the system does under split-brain, clock drift, and network partitions → which consistency their own system chose and its cost; which business flows can accept eventual consistency
- Signs of a solid answer: can walk through one round of a Raft write; knows their own system's consistency level and the basis for it; can reason through partition or split-brain scenarios

### Idempotency and exactly-once
- Ladder: why duplicates are the norm in distributed settings → what idempotency keys, dedup tables, transactional consumption, and version numbers each solve → how to guard against a user request submitted twice, duplicate consumption after a consumer restart, and compensation executed twice → the real meaning of exactly-once (at-least-once plus idempotency); the lifecycle and storage cost of idempotency keys
- Signs of a solid answer: idempotency design has a concrete key and storage; knows what combination achieves exactly-once; has a duplicate-consumption incident and its fix

### Distributed locks and clocks
- Ladder: what distributed locks solve and when they are actually unnecessary → Redis lock expiry, renewal, and releasing someone else's lock; how ZooKeeper / etcd locks differ → the risks of depending on the system clock (leases, expiry, ordering); monotonic and logical clocks → the performance and availability tradeoff of locks; scenarios where a database unique constraint replaces a lock
- Signs of a solid answer: can name the three pitfalls of Redis locks; knows the concrete consequences of untrustworthy clocks; has the judgment to use a constraint instead of a lock

### Multi-active and disaster recovery
- Ladder: what same-city active-active, geo-distributed multi-active, and two-sites-three-centers each solve → data sync lag and conflicts (dual writes, cell-based architecture, per-user routing) → the timeline of switching over during a data center failure; how data is reconciled after the switch → how RPO / RTO are set, what they cost, and which business flows justify it
- Signs of a solid answer: can state the routing basis for cells; has failover drills or walk-throughs; RPO / RTO have numbers and a rationale

### Failure drills and chaos engineering
- Ladder: why inject failures proactively → what to inject (latency, dropped connections, dependency down, resource exhaustion), in which environment, and how to control the blast radius → typical problems that drills uncover (timeout chains, retry storms, degradation not taking effect) → drill frequency, automation, and coordination with the business teams
- Signs of a solid answer: has done or designed fault injection; has problems that drills found and fixed; knows the means of controlling blast radius
