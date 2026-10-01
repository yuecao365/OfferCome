---
name: mysql-internals
description: Database deep dive on indexes, storage, transactions and MVCC, locking, query plans, replication, sharding, and NoSQL choice.
keywords: [mysql, innodb, database, index, b+tree, transaction, mvcc, isolation level, deadlock, execution plan, slow query, replication, high availability, sharding, lsm, redis, nosql, dba, connection pool]
layer: detail
domains: [backend, data-engineering]
---

## What interviewers care about

The database is the part of a backend interview that is easiest to probe deeply and best at separating levels: from "add an index" to "page splits and the change buffer", from "use a transaction" to "ReadView and the undo version chain". Interviewers start from a business symptom (slow query, deadlock, replication lag, accidental deletion, connection pool exhaustion) and press down to the mechanism; for DBA and kernel roles they keep going into the storage engine and optimizer. A new follow-up in 2026 is whether vector and full-text search inside a relational database (pgvector and the like) is advisable, and at what scale it gives out.

## Probing projects and internships

When the resume shows experience like the items below, this says where to start and what to press on. An answer is solid once the candidate can state the mechanism, where their numbers came from, and one real failure or tradeoff; if they can only give framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume says MySQL tuning / slow SQL → probe how they read the execution plan, how the index was changed, the before-and-after numbers, and whether they ever misjudged because of statistics or parameters
- Resume says replication / high availability / data migration → probe how replication lag was handled, whether they have done a failover, how split-brain is prevented, and the dual-write and verification plan for migration
- Resume says sharding → probe the shard key, cross-shard queries, whether they have expanded capacity, and why they did not first do archiving or read-write splitting
- Resume says deadlock / lock wait → probe how they read the deadlock log, which index the lock was on, and how the business logic was changed
- Resume says connection pool / data access layer → probe the basis for pool size, the product of instance count and pool size, and timeouts and retries
- Resume says Redis / MongoDB / ES → probe why it was chosen, the data model, how consistency is kept, and what incidents occurred

## Common failures and red flags

- Storage structure and indexes: knows only the three words "B+ tree"; cannot explain back-to-table lookups and covering indexes; uses UUID as the primary key without knowing about page splits
- Transactions, isolation levels, and MVCC: conflates RR and RC; cannot describe ReadView and the undo version chain; does not know how to find out when a long transaction bloats undo
- Locks and deadlocks: does not know locks are placed on indexes; cannot read a deadlock log; only says "retry"
- SQL optimization and execution plans: only says "add an index"; does not look at the execution plan; deep pagination with offset into the millions
- Replication and high availability: does not know where replication lag comes from; failover is done by hand; does not know semi-synchronous replication can degrade
- Database scaling and sharding: jumps straight to sharding; cannot give the basis for the shard key; does not know the cost of cross-shard transactions and pagination
- Connection pools and the access layer: fills in pool size arbitrarily; does not know total connections is a product over instances; never looks at the SQL the ORM generates
- LSM, KV, and NoSQL selection: puts everything in MySQL or everything in MongoDB; does not know LSM write and read amplification; has never dealt with Redis big keys and hot keys

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Database scaling and sharding
- Ladder: how much a single database can handle and what signals say it is time to split → how to handle replication lag with read-write splitting, vertical versus horizontal splitting → what to do after picking the wrong shard key (hotspots, cross-shard queries, resharding on expansion) → tradeoffs among sharding, a distributed database (TiDB etc.), and switching storage (wide tables, ES)
- Signs of a solid answer: has already done hot/cold separation or archiving; chooses the shard key by the main query dimension and accepts that secondary dimensions go through a heterogeneous index (ES / wide table / mapping table); the expansion plan uses consistent hashing or doubling; under replication lag has measures such as "reads after writes go to the primary"

### Storage structure and indexes
- Ladder: why indexes use B+ trees and how they differ from B trees → clustered versus secondary indexes, table lookups and covering indexes, page structure → inserts into a large table slow down, how to observe and handle page splits and fragmentation → auto-increment versus UUID as the primary key, which scenarios call for an LSM engine (tradeoff of write amplification and read amplification)
- Signs of a solid answer: can draw the relationship between clustered and secondary indexes; knows page splits, fill factor, the change buffer; can compare B+ tree and LSM write and read amplification

### Transactions, isolation levels, and MVCC
- Ladder: what mechanism guarantees each of ACID; what redo, undo, and binlog each solve → the differences between RC and RR, when the ReadView is created, the undo version chain; the order of two-phase commit and the recovery rules after a crash → how to detect and handle undo bloat from long transactions; how to tell which link is at fault when primary and replica data differ → the business basis for choosing RC or RR; the performance cost of the double-1 configuration and which businesses can relax it
- Signs of a solid answer: can explain why two snapshot reads in the same transaction under RR are consistent; knows innodb_trx and history list length; can lay out the order of prepare, write binlog, commit and the recovery decision; can pick a flush policy by business tolerance

### Locks and deadlocks
- Ladder: what row locks, gap locks, next-key locks, and intention locks each lock → under RR which statements take gap locks, differences between unique and non-unique indexes → how to read a deadlock log, how to investigate lock wait timeouts → business rewrites that reduce lock conflicts and the tradeoff of dropping to RC
- Signs of a solid answer: knows locks are on indexes and lock the whole table when there is no index; can read the deadlock section of SHOW ENGINE INNODB STATUS; has business-layer approaches such as ordering operations or splitting transactions

### SQL optimization and execution plans
- Ladder: what to look at in type, key, rows, and Extra of an execution plan → common causes of index failure, selectivity and the leftmost prefix, whether sorting and grouping use an index → the full attribution process for one slow query (index, statistics, locks, IO, parameters) → rewriting large-table pagination, count, and deep JOINs, and when to stop doing it in the database
- Signs of a solid answer: can read an execution plan and explain every column; knows the effects of data distribution, statistics, parameters, and cache warmth; has rewrites such as deferred join and cursor pagination

### Replication and high availability
- Ladder: the three threads and flow of replication; binlog formats, parallel replication, GTID → when replication lag keeps growing, how to tell whether it is a large transaction, DDL, a single thread, or replica IO; how semi-synchronous replication degrades on timeout → the timeline of handling a primary outage: how failover guarantees no data loss, how to prevent split-brain, what to do with the old primary; the principles and side effects of Online DDL and large-table change tools → the cost of cross-datacenter and multi-active; which businesses warrant it; when to adopt a distributed database instead of sharding
- Signs of a solid answer: can state the bottleneck of the IO thread and the SQL thread separately; knows fencing and VIP/DNS switching; has norms for splitting large transactions and running DDL off-peak; migration has dual-write, verification, and rollback steps

### Connection pools and the data access layer
- Ladder: why a connection pool and how to set its size → total connections is instances × pool size; the database-side limit and wait queue → from the application layer, how to investigate intermittent API timeouts, "too many connections", ORM N+1 queries, and implicit transactions → which layer should do read-write splitting and caching; when to bypass the ORM and write SQL
- Signs of a solid answer: can compute total connections; has a pool-exhaustion investigation case; knows the SQL the ORM generates and has looked at its execution plan

### LSM, KV, and NoSQL selection
- Ladder: what read-write ratio B+ trees and LSM each suit; memtable, SSTable, compaction, and bloom filter → Redis persistence and replication, cluster sharding, big keys and hot keys; what data model each of MongoDB, HBase, and Elasticsearch suits → how to measure write, read, and space amplification; how to investigate cache-database inconsistency, Redis memory filling up, and one slow cluster node → what data belongs in the database, what in the cache, what in a search engine; the boundary for vector and full-text search inside a relational database
- Signs of a solid answer: can compare B+ tree and LSM amplification; chooses by data model and access pattern; knows bigkeys / slowlog / hotkeys; has key-splitting or local-cache approaches
