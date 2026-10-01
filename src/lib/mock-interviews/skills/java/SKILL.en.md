---
name: java
description: How to interview Java backend engineers - JVM and GC, JUC concurrency, Spring, persistence, microservice components.
keywords: [java, spring, spring boot, spring cloud, jvm, gc, juc, mybatis, jpa, dubbo, netty, java backend, java development, microservices, thread pool]
layer: detail
domains: [backend]
---

## What interviewers care about

Java backend is the largest backend role at Chinese internet companies. The day-to-day is writing business services in the Spring Boot / Spring Cloud or Dubbo ecosystem, integrating middleware, and handling production issues. Real Java interviews follow a very stable main thread: JVM memory and GC, concurrency (thread pools, locks, JUC utilities), Spring internals (IoC, AOP, transactions), persistence (MyBatis/JPA and connection pools), and microservice components (registry, gateway, config center, RPC). These questions have been asked to death, so what interviewers care about most is not whether the candidate can recite the difference between CMS and G1, but three things. First, when facing OOM, CPU spikes, slow endpoints, or a saturated thread pool, have they actually investigated, with what tools and looking at what data. Second, do they truly understand the mechanism behind Spring's "magic", and can they explain why an annotation in their own project did not take effect. Third, can they write concurrent code correctly and spot the race in a snippet.

Campus hiring leans toward fundamentals: collection source code (HashMap, ConcurrentHashMap), synchronized vs ReentrantLock, JVM memory regions and the basic garbage collection flow, the Spring Bean lifecycle, hand-writing a thread-safe singleton or producer-consumer. Experienced hiring leans toward troubleshooting and design: how to locate frequent Full GC in production, how to set thread pool parameters, scenarios where @Transactional fails, distributed lock pitfalls, timeout chains across microservice calls, and the impact of JDK 17/21 virtual threads on existing models. In recent years top companies have clearly cut back on pure rote questions in favor of "here is a piece of code or a symptom, say where the problem is".

How to ask like an interviewer in this field:
- Architecture and methodology (cache consistency, message queues, rate limiting and degradation) belong to the backend pack; this pack focuses on implementation details and troubleshooting methods in the Java ecosystem.
- Rote knowledge must land on symptoms: attach to every principle question a follow-up like "how would it show up in production" and "how would you verify it"; flag candidates who can recite but cannot apply.
- Code-level follow-ups: for concurrency, transactions, and collections, prefer handing over a snippet or a symptom and asking the candidate to find the problem, rather than having them restate concepts.
- Match the JDK version and project scale: do not press on virtual threads for a project still on JDK 8; do not press on ZGC and container memory allocation for small projects, but they must still be able to read GC logs and thread stacks.
- The 2026 production baseline for Java backend is JDK 21 / 25 and Spring Boot 3 / 4: with virtual threads taking over IO-bound services, old thread-pool tuning questions get flipped to "when should you not use virtual threads" (pinning, CPU-bound work, ThreadLocal bloat); compact object headers, generational ZGC, Spring's HTTP Service Client, and null-safety annotations are new follow-up points; services that call large models get pressed on timeouts, retries, and cost control in integrations like Spring AI.

## Probing projects and internships

Where to start and what to press on when the resume contains the following kinds of experience. Keep going until the candidate can describe the mechanism, where the numbers came from, and one real failure or trade-off; if they can only name the framework and the conclusion and cannot describe their own part, record it as a red flag. For the general follow-up method see project-deep-dive.

- Resume mentions JVM tuning → press on the GC metrics before tuning, which parameters were changed, the comparison data after tuning, and whether memory leaks were ruled out first; flag candidates who cannot describe what is in a GC log
- Resume mentions thread pools / concurrency optimization → press on how parameters were set, what was monitored, and whether there was ever task pile-up or deadlock
- Resume mentions Spring Cloud / Dubbo → press on which registry, how graceful deregistration is done, which layer configures timeouts and retries, and what problems occurred in service-to-service calls
- Resume mentions MyBatis / JPA → press on the connection pool size and its rationale, how slow SQL is discovered, how large transactions are, and whether there was N+1
- Resume mentions Redis distributed locks → press on how lock expiry is handled, how release is guaranteed to be by the owner, and whether master-replica failover was considered
- Resume mentions Netty / a self-built RPC → press on the threading model, codecs and TCP sticky packets, direct memory management, idle detection and reconnection
- Resume mentions a JDK 17/21 upgrade → press on migration problems (modularization, reflection restrictions, Jakarta package names), whether virtual threads were used, and what the benefit was
- Resume mentions "endpoint performance optimization" → press on what tool was used to locate it (Arthas, profiler, trace), what the bottleneck was, and P99 before and after the optimization

## Common failures and red flags

- JVM memory structure and OOM troubleshooting: only knows -Xmx; cannot tell a JVM OOM from a container OOMKilled; does not know NIO/Netty uses direct memory
- GC selection and tuning: recites collector names but has never looked at a GC log; blames every problem on "heap too small"; does not know about G1 humongous object issues
- Thread pool design and failures: uses Executors.newFixedThreadPool without knowing it has an unbounded queue; recites the "CPU cores + 1" formula without looking at the task type; does not know ThreadLocal can leak across tasks in a thread pool
- Locks and concurrency utilities: believes volatile guarantees atomicity; does not know ConcurrentHashMap's size and compound operations are not atomic; has never looked at thread states with jstack
- Java memory model and visibility: treats volatile as a lightweight lock; does not know the JIT can reorder and hoist; cannot state any happens-before rule
- Virtual threads and newer JDKs: believes virtual threads are just coroutines and blindly faster; does not know about pinning; does not know the database connection pool is still the bottleneck
- Spring IoC / AOP internals and failure scenarios: recites the three-level cache but cannot say what each level stores; does not know self-invocation bypasses the proxy; puts @Transactional on a private method
- Spring Boot and ecosystem practice: does not know spring.factories / AutoConfiguration.imports; cannot state the order of configuration sources; has never read the startup log
- Persistence: MyBatis / JPA and connection pools: sets the pool to several hundred thinking bigger is better; does not know how the MyBatis first-level cache behaves under Spring transactions; a JPA project that does findAll and then filters in memory
- Microservice components: registry and discovery, config, gateway, RPC: can only configure the starter without knowing the internals; does not know the AP/CP difference between registries; has never handled graceful shutdown
- Distributed locks and caching practice (Java view): deletes the lock without verifying the owner; does not know about watchdog renewal; thinks RedLock is a silver bullet
- Performance troubleshooting tools and methods: only restarts; does not know to combine top -H with jstack to find threads; has never used Arthas or a profiler
- Collections and core source code: can recite HashMap source but cannot say where in their own project a collection was misused; does not know the pitfalls of removing while iterating an ArrayList

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid". Which topics to ask and how many is decided by this JD and this resume; it is not a quota.

### JVM memory structure and OOM troubleshooting
- Ladder: what goes in the heap, stack, method area/metaspace, and direct memory → object allocation and promotion, TLAB, escape analysis and scalar replacement → the typical causes and troubleshooting methods for each kind of OOM (heap, metaspace, direct, unable to create native thread) → how to divide memory among heap size, container memory limit, and off-heap memory
- Signs of a solid answer: can use jmap/jcmd to dump the heap and use MAT to inspect the dominator tree; knows MaxDirectMemorySize, metaspace, thread stacks, and the JIT code cache all count toward container memory; uses percentage flags (MaxRAMPercentage) in containers; can describe one real memory-leak diagnosis (e.g., ThreadLocal not cleaned up, static collections, unclosed connections)

### GC selection and tuning
- Ladder: the generational hypothesis and the goals of common collectors (Parallel, CMS, G1, ZGC) → how G1's Regions, Mixed GC, and pause target work, ZGC's concurrency and colored pointers → how to locate frequent Young GC, frequent Full GC, and single long pauses → throughput-first or latency-first, at what scale to move to ZGC, which comes first, tuning parameters or changing code
- Signs of a solid answer: can read generation sizes before and after collection, promotion failures, and concurrent mode failures in GC logs; knows common Full GC triggers (old generation full, metaspace full, System.gc, promotion failure); mentions using jstat and GC log analysis tools to view trends; first checks for memory leaks or large-object allocation before tuning parameters

### Thread pool design and failures
- Ladder: why use a thread pool, what the core parameters are → the task submission flow (core threads → queue → max threads → rejection), why an unbounded queue is dangerous → investigating a saturated pool, task pile-up, thread leaks, and parent-child task deadlock → how to set parameters for IO-bound vs CPU-bound work, isolating and monitoring multiple thread pools
- Signs of a solid answer: explains that the queue fills before max threads are used; names thread pools and exposes active count / queue length metrics; chooses the rejection policy per business (discard, caller runs, degrade); mentions the pitfall of CompletableFuture using ForkJoinPool by default; knows a parent task waiting on child tasks in a shared pool deadlocks

### Locks and concurrency utilities
- Ladder: difference between synchronized and ReentrantLock → lock upgrading, AQS queue and state, CAS and ABA → how to locate deadlock with jstack, how to optimize throughput lost to lock contention → lock granularity, read-write locks, lock-free structures, the boundaries of striping and LongAdder
- Signs of a solid answer: can draw the AQS wait queue; knows atomic compound operations such as compute/merge; resolves lock contention with striping, shrinking the critical section, and read-write separation; can explain happens-before and memory visibility

### Java memory model and visibility
- Ladder: what problem volatile solves → the JMM's happens-before rules, instruction reordering, memory barriers → why double-checked locking needs volatile, what code runs correctly on x86 but breaks on ARM → when you need to care about the JMM, final and safe publication
- Signs of a solid answer: distinguishes atomicity, visibility, and ordering; knows AtomicXxx and VarHandle; can explain the value of safe publication and immutable objects

### Virtual threads and newer JDKs
- Ladder: what problem JDK 21 virtual threads solve → the mapping to platform threads, carrier threads, pinning (blocking inside synchronized) → what to do about thread pools, ThreadLocal, and database connection pools once virtual threads are adopted → which workloads are worth migrating, migration risk and benefit
- Signs of a solid answer: knows blocking inside a synchronized block pins the carrier thread (before JDK 24); virtual threads should not be pooled but downstream resources still need rate limiting; the memory problem of ThreadLocal under huge numbers of virtual threads and ScopedValue; mentions practical use of language features like record, sealed, and pattern matching

### Spring IoC / AOP internals and failure scenarios
- Ladder: what problem IoC and DI solve → the Bean lifecycle, how the three-level cache resolves circular dependencies, proxy generation (JDK dynamic proxy vs CGLIB) → how to investigate why @Transactional / @Async / @Cacheable do not take effect → what logic belongs in AOP and what does not, the performance and debuggability cost of proxies
- Signs of a solid answer: explains the difference between the proxy object and the target object; knows transaction propagation behaviors and rollback rules (by default only RuntimeException rolls back); can name BeanPostProcessor extension points and a scenario where they used one; mentions Spring Boot auto-configuration's conditional annotations and how to investigate (the condition evaluation report)

### Spring Boot and ecosystem practice
- Ladder: how auto-configuration works → the Starter mechanism, configuration precedence, what Actuator exposes → investigating slow startup, Bean conflicts, and overridden config → whether the changes in Spring Boot 3 / Spring 6 (Jakarta, AOT, GraalVM native) justify migrating
- Signs of a solid answer: uses Actuator's startup endpoint or ApplicationStartup to view startup time; lazy loading and asynchronous initialization; understands @ConditionalOnMissingBean and the mechanism by which users override default configuration

### Persistence: MyBatis / JPA and connection pools
- Ladder: how to choose between MyBatis and JPA → MyBatis's first- and second-level caches, dynamic SQL, batch inserts, JPA's N+1, lazy loading, and open-in-view → investigating connection pool (HikariCP) exhaustion, slow SQL dragging down the pool, RPC calls inside a transaction → how to size the connection pool, at which layer to do read-write splitting, the boundary between ORM and hand-written SQL
- Signs of a solid answer: relates pool size to database core count and transaction duration; uses the pool's leak detection or slow-transaction monitoring; splits large transactions and does no IO inside transactions; batch operations with rewriteBatchedStatements or hand-written batching; knows JPA's dirty checking and flush timing

### Microservice components: registry and discovery, config, gateway, RPC
- Ladder: the positioning of Spring Cloud vs Dubbo → the consistency model of registries (Nacos/Eureka/ZK), heartbeat and eviction, how config hot reload works → investigating traffic still arriving after a service goes offline, config pushes that do not take effect, a gateway that becomes a bottleneck → service mesh vs SDK mode, the trade-off between cross-language support and unified governance
- Signs of a solid answer: deregister first then stop the container, wait for in-flight requests, client cache refresh interval; Dubbo/gRPC serialization, load balancing, and retry semantics; gateway rate limiting, auth, and hot route updates; config center canary and rollback

### Distributed locks and caching practice (Java view)
- Ladder: why synchronized is useless in a cluster → the difference between Redis distributed locks (SET NX PX, Redisson watchdog) and ZK locks → handling a lock expiring before the business logic finishes, lock loss on master-replica failover, and accidental lock deletion → which scenarios actually do not need a distributed lock (idempotency, optimistic locking, queue serialization)
- Signs of a solid answer: unique value plus Lua script for release; fencing token or a database version number as the final protection; can say when to switch to database optimistic locking; handles expiry and cache penetration when combining Spring Cache annotations with Redis

### Performance troubleshooting tools and methods
- Ladder: how to investigate high CPU and high memory → what jstack/jmap/jstat/jcmd, Arthas, and async-profiler each show → the approach to locating high endpoint P99 with normal average, intermittent jitter, and a slow specific machine → the production safety of the tools (dump pauses, sampling overhead), what should be monitored continuously
- Signs of a solid answer: top -H → convert thread ID to hex → match in jstack; Arthas thread/trace/watch; async-profiler flame graphs; knows a heap dump causes STW so pick the machine and timing; looks at trends with GC logs and monitoring

### Collections and core source code
- Ladder: HashMap structure and resizing → the tree conversion threshold, concurrency problems, ConcurrentHashMap's segmentation and CAS → performance and memory problems caused by collections (resize jitter in large Maps, fail-fast, memory amplification) → when to care about these and when to use a dedicated structure
- Signs of a solid answer: explains resizing and hash collisions; presets capacity; Bloom filters, bitmaps, external deduplication; knows the memory footprint of String and wrapper types
