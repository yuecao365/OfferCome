---
name: cs-fundamentals
description: How to interview CS fundamentals, covering OS, networking, data structures, algorithms, database principles, for new grads.
keywords: [computer science fundamentals, operating systems, computer networking, data structures, algorithms, database principles, compilers, computer organization, tcp, http, process, thread, campus hiring, rote interview questions, software engineer]
layer: domain
---

## What interviewers care about

CS fundamentals make up the bulk of first-round campus interviews for technical roles in China. They cover operating systems, computer networking, data structures and algorithms, and database principles; some roles (C++, infrastructure, embedded, compilers, chip-related) add computer organization and compiler principles. Experienced-hire interviews also ask fundamentals, but more often start from a production problem and work back to the principle, for example "TIME_WAIT piling up", "CPU idle but requests slow", or "how do you read an execution plan for a slow query".

Nearly all campus candidates have memorized the standard "interview trivia", so single-concept questions (the three-way handshake, process versus thread, why B+ trees suit indexes) no longer discriminate. Interviewers connect the dots instead: give a symptom and have the candidate attribute it to a mechanism, or have them explain the causal link between two concepts, or find a real scenario in the candidate's project and drill down. For experienced hires, the question is whether the candidate can use fundamentals to explain failures they have actually encountered, and whether they know the matching troubleshooting tools.

Interviewers care most about three things. First, whether the candidate understands the mechanism or is reciting conclusions: does their thread snap when you press one more "why". Second, whether they can map a symptom back to principles, for example going from "intermittent API timeouts" to retransmission, queues, GC, and locks. Third, how well the knowledge fits the candidate's stack: someone who writes web services should have intuition for HTTP and TCP, someone who writes concurrent code should have intuition for locks and scheduling; fundamentals should not all stay at textbook level.

How to ask questions like an interviewer in this field:
- Single-concept questions are only an opener. The real scoring points are the second layer ("why") and the third layer (symptom attribution). A candidate who recites fluently but whose thread breaks under follow-up is treated as not understanding.
- Prefer fundamentals related to the candidate's stack: ask web developers about networking and databases, ask concurrency developers about OS and architecture; do not cast a wide net.
- Every topic should land on at least one real troubleshooting scenario, and the candidate should name tools or commands. Test "can use it", not "has heard of it".
- For campus hires, look at understanding and reasoning; for experienced hires, look at whether they can use fundamentals to explain failures they have hit. Do not ask experienced candidates pure definition questions.

## Probing projects and internships

When the resume shows experience like the following, this is where to start and what to press on. An answer is solid only when the candidate can state the mechanism, where the numbers came from, and one real failure or tradeoff. If they offer only framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume mentions a web service → pick any segment along the path of "one request from the browser to the database" and drill down to protocol and kernel behavior.
- Resume says "high performance" or "optimization" → press on the load-testing method, the tools used to locate bottlenecks, and how the before-and-after metrics were defined.
- Resume mentions multithreading or concurrency → press on lock granularity, any deadlock experience, and the basis for thread-pool parameters.
- Resume mentions network programming, RPC, or long-lived connections → press on the choice of IO model, the connection-count ceiling, and timeout and reconnect strategy.
- Resume mentions C/C++ or systems programming → press on memory management, compile and link, and cache friendliness.
- Resume mentions SQL or database use → press on slow-query experience, execution plans, and the choice of transaction isolation level.
- Resume mentions algorithm competitions → pose a variation on the problem type they know best, and press on preconditions and the scenarios where the approach fails.

## Common failures and red flags

- Processes, threads, and coroutines: can only recite "threads share the address space"; conflates load with CPU utilization; knows coroutines are "lighter" but cannot say why.
- Memory management and virtual memory: cannot tell RSS from heap; thinks low "free" memory means memory is running out; knows page faults only as a term.
- Locks, synchronization, and deadlock: can only recite the four conditions; does not know how to read a thread dump; treats a spinlock as a "faster lock".
- IO models and multiplexing: equates non-blocking with asynchronous; knows epoll only as "efficient"; does not know the difference between sendfile and mmap.
- TCP connection management and reliable delivery: after reciting the handshake, the thread snaps at "why"; treats TIME_WAIT as a failure; does not know CLOSE_WAIT means the application did not close the connection.
- Network attribution of API timeouts: can only say "the network is bad"; does not know server processing time does not include queueing; cannot tell a connect timeout from a read timeout.
- HTTP, HTTPS, and newer protocols: answers HTTPS with just "encryption" and cannot state the division of labor between symmetric and asymmetric crypto; knows HTTP/2 only as "faster"; cannot name a single cache header.
- Data structure choice and complexity intuition: answers hash table for every lookup; does not know hash table resizing causes latency spikes; offers an "optimal solution" without asking about data scale.
- Verbal walk-through of algorithm paradigms: states a problem number and solution directly; cannot state an algorithm's preconditions; finds boundary conditions by trial and error.
- Database indexes and transaction principles: answers B+ tree with only "low height"; knows isolation levels only by name; cannot read an execution plan.
- Cache hierarchy and CPU architecture basics: does not know cache lines exist; answers volatile with only "visibility" and cannot explain the underlying mechanism; conflates memory barriers with locks.
- Compile, link, and runtime: cannot name the four steps of preprocessing, compilation, assembly, and linking; does not know the dynamic library search path; confuses JIT with interpretation.

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed here, as a reference for "how deep counts as grounded". Which topics to ask and how many is decided by this JD and this resume, not by a quota.

### Processes, threads, and coroutines
- Ladder: process versus thread, coroutine versus thread → what exactly a context switch saves and where the cost is → what to suspect when CPU usage is low but requests are slow, or load is high but CPU is not → the basis for choosing among multi-process, multi-thread, and coroutine models
- Signs of a solid answer: can state the registers saved on a switch and the kernel-mode overhead; knows load includes uninterruptible sleep; has experience with tools like top, vmstat, pidstat, perf.

### Memory management and virtual memory
- Ladder: what problem virtual memory solves → page tables, TLB, and the page-fault process → how to tell memory leaks from out-of-memory and locate them, and what high swap usage means → the effect of the page cache on IO performance and NUMA tradeoffs on large-memory machines
- Signs of a solid answer: distinguishes off-heap memory, thread stacks, and page cache; knows tools like pmap, jcmd, valgrind, asan; can explain what buffers/cache mean.

### Locks, synchronization, and deadlock
- Ladder: where mutexes, read-write locks, spinlocks, and semaphores each apply → the four deadlock conditions and ways to break them → how to locate a stuck thread pool in production, and how to recognize livelock and starvation → when lock-free structures and optimistic concurrency are worth it
- Signs of a solid answer: can find the lock-holding chain from a dump; knows ordered locking and timeout release; can evaluate the relationship between lock granularity and throughput.

### IO models and multiplexing
- Ladder: the differences among blocking, non-blocking, synchronous, and asynchronous → the differences among select/poll/epoll, and epoll's edge-triggered mode → where the CPU goes in a service with very high connection counts, and what zero-copy solves → choosing between single-threaded and multithreaded Reactor, and whether io_uring is worth using
- Signs of a solid answer: can state the two phases, readiness notification and data copy; knows the handling differences between ET and LT; understands which copies and context switches zero-copy eliminates.

### TCP connection management and reliable delivery
- Ladder: why the handshake takes three steps and teardown four → how sequence numbers, acknowledgments, retransmission, sliding windows, and congestion control work together → what many TIME_WAIT or CLOSE_WAIT sockets each indicate, and how to defend against SYN floods → long versus short connections, and the tradeoffs in keepalive parameters
- Signs of a solid answer: knows the two purposes of TIME_WAIT and 2MSL; can distinguish the states of the active and passive closer; has experience with ss, netstat, tcpdump.

### Network attribution of API timeouts
- Ladder: what stages an HTTP request passes through from DNS to response → whether the timeout can occur at connect, send, wait, or read → how to capture packets for intermittent timeouts and tell retransmission from queueing from a slow server → principles for configuring timeouts, retry counts, and caller timeouts
- Signs of a solid answer: can list candidates such as the accept queue, kernel buffers, retransmission, and GC pauses; knows tcpdump and retransmission metrics; can give sensible timeout and retry configuration.

### HTTP, HTTPS, and newer protocols
- Ladder: HTTP/1.1 keep-alive and head-of-line blocking → what the HTTPS handshake protects and how the certificate chain is verified → the residual problems of HTTP/2 multiplexing and what HTTP/3 solves with QUIC → caching strategy (strong versus negotiated caching) and CDN tradeoffs
- Signs of a solid answer: can distinguish TCP-layer from application-layer head-of-line blocking; knows the round trips in a TLS 1.3 handshake; can design cache headers and an invalidation strategy.

### Data structure choice and complexity intuition
- Ladder: where hash tables, balanced trees, skip lists, and heaps each apply → amortized complexity (dynamic array growth, hash resizing) and worst cases → attributing "why is this API slow" to complexity, and the memory math for deduplicating tens of millions of items → time versus space tradeoffs, and when constant factors matter more than the order of magnitude
- Signs of a solid answer: asks about scale before picking a structure; can compute memory usage; knows the error cost of Bloom filters and HyperLogLog; knows cache friendliness affects the constant.

### Verbal walk-through of algorithm paradigms
- Ladder: the conditions and boundaries of binary search, two pointers, and sliding windows → how to come up with the state definition in dynamic programming, and when greedy goes wrong → abstracting algorithm problems from business scenarios (rate limiting, scheduling, dedup, matching) → recursion versus iteration, exact versus approximate solutions
- Signs of a solid answer: can abstract a problem from a scenario; states preconditions and failure conditions; gives complexity and boundary handling.

### Database indexes and transaction principles
- Ladder: why indexes use B+ trees rather than hash tables or red-black trees → clustered indexes and table lookups, leftmost-prefix and covering indexes → attributing a slow query (index failure, lock wait, IO) and reading an execution plan → transaction isolation levels and the cost of MVCC, and when to give up on relational
- Signs of a solid answer: can state the B+ tree's IO and range-query advantages; knows implicit conversion, functions, and selectivity can make an index fail; can explain phantom reads and gap locks.

### Cache hierarchy and CPU architecture basics
- Ladder: why there are multiple cache levels and how large a cache line is → the performance effects of false sharing, branch misprediction, and memory barriers → why changing a loop's traversal order makes it ten times faster → when rewriting a data structure for cache friendliness is worth it
- Signs of a solid answer: can explain cache lines and coherence protocols; knows to look at cache misses with perf; can state the principles behind row-major traversal and padding.

### Compile, link, and runtime
- Ladder: the stages from source code to executable → the differences between static and dynamic linking, and symbol resolution → how to troubleshoot an "undefined reference" or a library not found at runtime → how compiler optimizations (inlining, escape analysis, JIT) affect how code should be written
- Signs of a solid answer: can explain symbols and relocation; knows LD_LIBRARY_PATH and rpath; understands the relationship between undefined behavior and optimization.
