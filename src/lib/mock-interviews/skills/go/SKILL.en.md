---
name: go
description: How to interview Go backend engineers - goroutine scheduling, channels, GC and escape analysis, pprof, gRPC.
keywords: [go, golang, goroutine, channel, gin, grpc, go-zero, kratos, pprof, gmp, go backend, cloud native, kubernetes, microservices, server-side development]
layer: detail
domains: [backend, infra-sre]
---

## What interviewers care about

In China, Go backend work is concentrated in cloud-native infrastructure, middleware, high-concurrency businesses (IM, live streaming, games, ads), and companies going overseas. The day-to-day is writing services with Gin/Kratos/go-zero or the standard library, using gRPC for internal communication, running on Kubernetes, and debugging performance with pprof and trace. Go interviews have one clear main thread: goroutines and GMP scheduling, channels and the sync package, GC and memory allocation, escape analysis, the internals of interfaces and reflection, and common concurrency bugs (leaks, races, deadlocks). The language itself is simple, so interviewers do not test "do you know the syntax"; they care about three things. First, is the concurrent code correct: can the candidate spot a goroutine leak or data race in a snippet, and do they know how context should be passed. Second, have they actually located CPU, memory, or blocking problems with pprof. Third, engineering habits: error handling, dependency injection, package organization, testing, and graceful shutdown, which are areas with strong Go community conventions, must be internalized.

Campus hiring leans toward language basics and the concurrency model: the internals of slice and map, defer execution order and its pitfalls, how goroutines differ from threads, channel blocking semantics, hand-writing a worker pool or concurrent requests with timeouts. Experienced hiring leans toward production issues and design: how to investigate goroutine count climbing to a hundred thousand, how to optimize frequent GC, how to manage gRPC connections and timeouts, how to design a component that controls concurrent access to a downstream. In the past two years top companies have handed over code snippets and asked "what is wrong with this", then followed up on whether the candidate has used Go 1.21+ features (generics in practice, structured logging, PGO).

How to ask like an interviewer in this field:
- Architecture and methodology (cache consistency, message queues, rate limiting and degradation) belong to the backend pack; this pack focuses on the Go runtime, concurrency primitives, and engineering practice.
- For concurrency questions, lead with code: have the candidate write it or find the bug live, and press on the lifecycle of every goroutine and who closes each channel; do not accept "it's roughly like this".
- Performance questions must land on pprof: whenever the candidate claims any "optimization", press on which profile they used, what they saw, and the benchmark numbers before and after.
- Match the project scale: for a service with a few hundred QPS, do not press on GOMEMLIMIT and PGO, but they must still be able to write correct context propagation and graceful shutdown; for infrastructure projects, press on scheduler and memory allocation details.
- New 2026 follow-ups for Go interviews: newer GCs such as GreenTea and container-aware GOMAXPROCS have changed old tuning conclusions; the candidate should explain why the defaults changed and which scenarios still need manual tuning. Since Go is the main language for cloud-native and Agent gateways, press on how context cancellation propagates down to downstream model calls and streaming forwarding.

## Probing projects and internships

Where to start and what to press on when the resume contains the following kinds of experience. Keep going until the candidate can describe the mechanism, where the numbers came from, and one real failure or trade-off; if they can only name the framework and the conclusion and cannot describe their own part, record it as a red flag. For the general follow-up method see project-deep-dive.

- Resume says "high concurrency" / worker pool → press on how the concurrency limit was set, how goroutine leaks are prevented, and whether they have looked at goroutine counts with pprof
- Resume mentions gRPC / microservices → press on which layer owns timeouts and retries, how connections are reused and load balanced, what the interceptors do, and how proto compatibility is managed
- Resume mentions Gin / Kratos / go-zero → press on why they chose it, which parts of the framework they replaced or wrapped themselves, and how the middleware chain is organized
- Resume mentions performance optimization → press on which profile revealed it, whether they optimized allocations, locks, or IO, the benchmark data, and post-release metrics
- Resume mentions Kubernetes / cloud native / Operator → press on how they used client-go informers and workqueues, how graceful shutdown and probes are configured, and how GOMAXPROCS and memory limits are set
- Resume mentions Redis / Kafka clients → press on connection pool parameters, the concurrency model of consumption, and how message processing failures and rebalances are handled
- Resume mentions generics / new Go 1.2x features → press on where exactly they were used, what duplication they removed, and whether they hit constraint or performance problems
- Resume mentions a self-built middleware / gateway → press on connection management, memory pools and zero-copy, hot config reload, and load test data

## Common failures and red flags

- Goroutines and GMP scheduling: believes spawning unlimited goroutines is free; does not know the default number of Ps equals the CPU count and that in a container it may pick up the host's core count; cannot explain the difference between runtime.Gosched and preemption
- Channels and concurrency patterns: closes a channel on the receiver side; does not know when a for-range over a channel exits; uses time.Sleep to wait for a goroutine to finish; reaches for channels on every concurrency problem
- The sync package and data races: thinks sync.Map is a cure-all; does not know the -race flag; copies structs containing a Mutex; does not know RWMutex can be slower in write-heavy cases
- Context and timeout cancellation: uses context.Background everywhere; does not know to defer cancel; stores context in a struct field
- GC and memory allocation: only knows "Go has a GC so no need to care"; does not know what the GOGC default of 100 means; thinks a small heap means less GC
- Escape analysis and performance details: does not know escape analysis exists; thinks pointers are always faster than values; over-optimizes cold paths
- Internals and pitfalls of slice, map, and interface: does not know a slice references an underlying array; does not know a nil pointer placed in an interface is not a nil interface; map needs make before writing
- Error handling and engineering conventions: panics everywhere; logs errors instead of returning them; compares error strings to determine the error type
- Web frameworks and gRPC: does not know http.Client should be reused and that Transport has a connection pool; does not close resp.Body; does not know the L4 load balancing problem of gRPC long-lived connections with a K8s Service
- pprof and profiling: has only used CPU profiles; does not know the difference between inuse and alloc; has never used go tool trace
- Graceful shutdown, configuration, and deployment: calls os.Exit directly; does not know the ordering of SIGTERM and preStop; health check just returns 200
- Testing and code organization: has never written tests; a package called utils/common holds everything; defines interfaces on the implementer side instead of the consumer side

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid". Which topics to ask and how many is decided by this JD and this resume; it is not a quota.

### Goroutines and GMP scheduling
- Ladder: how goroutines differ from threads → the G/M/P relationship, local and global queues, work stealing, M and P detaching during system calls → investigating a goroutine count explosion, CPU maxed out but throughput flat, or a goroutine that is not scheduled for a long time → how to set GOMAXPROCS in containers, what preemptive scheduling solved and what it did not
- Signs of a solid answer: uses the pprof goroutine profile aggregated by stack to find the leak site; knows to use automaxprocs or GOMAXPROCS to match cgroup limits; puts concurrency limits on downstream access (semaphore, worker pool); mentions that Go 1.14 asynchronous preemption fixed tight loops starving others

### Channels and concurrency patterns
- Ladder: semantics of buffered vs unbuffered channels → rules for closing a channel, uses of nil channels, select's randomness and default → deadlocks, the panic from sending on a closed channel, investigating a producer blocked forever after the consumer exits → channel vs mutex, when to use pipeline, fan-in/fan-out, and errgroup
- Signs of a solid answer: whoever produces closes; errgroup.WithContext or a hand-written semaphore; a select with a ctx.Done branch to prevent blocking; can state the rule "use a mutex for shared memory, use channels to pass ownership"

### The sync package and data races
- Ladder: when to use Mutex vs RWMutex → correct use of sync.Once and WaitGroup, where atomic applies, Mutex starvation mode → how to locate a race found with -race, the panic from concurrent map writes, symptoms of WaitGroup Add and Wait in the wrong order → where sync.Map applies and its cost, lock sharding, whether lock-free structures are worth it
- Signs of a solid answer: LoadOrStore/atomic or sharded locks; runs -race in CI; knows sync.Map suits read-heavy workloads or stable key sets; can explain that Mutex is not reentrant and go vet's copylocks check

### Context and timeout cancellation
- Ladder: what problem context solves → the derivation chain, Done and Err, resource release with WithTimeout (cancel must be called) → a request is already canceled but downstream is still running, coupling caused by stuffing business parameters into context, investigating timeouts that are not propagated layer by layer → how to allocate timeouts per layer, what belongs in context and what does not
- Signs of a solid answer: context as the first parameter throughout; database, HTTP, and gRPC calls all use ctx-aware APIs; knows context.WithoutCancel and AfterFunc (1.21); mentions timeout budgets and deadline propagation

### GC and memory allocation
- Ladder: what kind of GC Go has → tri-color marking, write barriers, GC triggers (GOGC, GOMEMLIMIT), the mcache/mcentral/mheap allocation hierarchy → investigating frequent GC driving CPU up, heap memory not returned to the OS, RSS far larger than the heap → how GOGC and GOMEMLIMIT work together, the payoff limits of object pools and allocation reduction
- Signs of a solid answer: allocation rate, more than heap size, determines GC frequency; uses pprof alloc_objects to find hot allocation sites; sync.Pool reuse, preallocated slices, avoiding small-object escapes; uses GOMEMLIMIT in containers to prevent OOM; knows the soft memory limit mechanism since Go 1.19

### Escape analysis and performance details
- Ladder: the difference between stack and heap allocation → common causes of escape (returning pointers, interface conversion, closure capture, uncertain slice growth) → using -gcflags=-m to view escapes, interface call and reflection overhead on hot paths → when it is worth changing code for escape, the boundary between readability and performance
- Signs of a solid answer: can read escape analysis output; knows the allocation cost of interface method calls and fmt.Sprintf; strings.Builder, preallocation, avoiding needless []byte and string conversions; validates with benchmarks and benchstat

### Internals and pitfalls of slice, map, and interface
- Ladder: the slice triple, append growth rules, the map bucket structure → unexpected modification from sub-slices sharing the underlying array, unordered map iteration and deleting during iteration, iface/eface and the nil-interface trap → how to locate production bugs caused by slice sharing or concurrent map writes → in what scenarios generics (1.18+) fit better than interfaces
- Signs of a solid answer: three-index slices or copy; the two parts of an interface, type and value; map growth and the issue that GC does not reclaim buckets; practical use of generic constraints and code bloat

### Error handling and engineering conventions
- Ladder: why Go does not use exceptions → error wrapping (%w), errors.Is/As, sentinel errors and custom types → error messages losing context, a panic in a goroutine without recover crashing the process, investigating swallowed errors → error classification (retryable/non-retryable/business) and its mapping to logs, metrics, and return codes
- Signs of a solid answer: wraps with context without repeating it; errors.As to check the concrete type; panic only for unrecoverable programming errors; HTTP/gRPC middleware that recovers and maps errors uniformly; mentions configuring go vet, staticcheck, golangci-lint

### Web frameworks and gRPC
- Ladder: net/http's Handler model and middleware chain → routing and context in Gin/Echo/Chi, gRPC interceptors, streaming calls, connection reuse → investigating HTTP connection leaks (body not closed), gRPC connection imbalance, large numbers of TIME_WAIT → gRPC or HTTP JSON for internal communication, the constraints and benefits of scaffolds like Kratos/go-zero
- Signs of a solid answer: Transport's MaxIdleConnsPerHost; reads the body fully and closes it; gRPC with a headless service plus client-side load balancing or a service mesh; timeouts and retries configured uniformly in interceptors

### pprof and profiling
- Ladder: what pprof can show → what questions the CPU, heap (inuse/alloc), goroutine, block, and mutex profiles each answer, and how sampling works → steps to locate occasional latency spikes in production, slowly growing memory, and throughput capped by lock contention → the cost of continuous profiling, the division of labor between trace and pprof, the payoff of PGO
- Signs of a solid answer: distinguishes which profile to use for CPU/memory/blocking/scheduling problems; uses trace to see GC pauses and scheduling latency; benchmark comparisons; puts authentication on the pprof port in production; knows Go 1.21 PGO can optimize using production profiles

### Graceful shutdown, configuration, and deployment
- Ladder: why graceful shutdown matters → signal handling, http.Server.Shutdown, the wind-down order of in-flight requests and background goroutines → errors during rolling releases, health checks passing while the service is not ready, investigating Kubernetes pulling traffic early → readiness vs liveness design, the trade-off between shutdown timeout and data consistency
- Signs of a solid answer: signal.NotifyContext → first mark not ready → wait for traffic to drain → Shutdown → wait for background tasks; readiness checks dependencies; multi-stage builds and statically compiled image practice; configuration via environment variables and something like viper/koanf with hot reload support

### Testing and code organization
- Ladder: table-driven tests and testify → interface abstraction and dependency injection (wire/fx or by hand), mock generation, httptest → flaky tests, races in concurrent tests, isolating the integration test environment → package structure (internal, cmd, pkg) and layering conventions, balancing over-engineering against "Go idioms"
- Signs of a solid answer: interfaces defined by the consumer and kept small; testcontainers or docker-compose for integration tests; -race and -count to chase flaky tests; real use of fuzz testing
