---
name: node
description: Interviewing Node.js backend engineers on the event loop, streams and backpressure, memory leaks, and Nest/Express.
keywords: [node, nodejs, node.js, nestjs, express, koa, typescript, event loop, stream, full-stack, bff, node backend, server-side development, backend]
layer: detail
domains: [backend, frontend]
---

## What interviewers care about

Node.js backend work is concentrated in BFF and gateway layers, full-stack teams, tooling and platform products, real-time communication (IM, collaboration, push), Serverless and edge functions, plus a large number of TypeScript full-stack roles at overseas-facing and foreign companies. Day to day it means writing APIs with NestJS/Express/Koa or Fastify, aggregating downstream services, handling WebSockets, writing SSR and build services, running under PM2 or in containers. The main line of a Node interview is clear: the event loop and asynchronous model, the details of Promises and async/await, streams and backpressure, the module system, performance and memory leak investigation, clustering and multi-process, frameworks (Nest's DI and lifecycle), and TypeScript engineering. Because of the special nature of the single-threaded model, interviewers care about three things most. First, does the candidate truly understand "what blocks the event loop" and can they locate it. Second, is their handling of asynchronous errors rigorous: unhandled rejections, stream errors, how process crashes are handled. Third, have they kept a Node service running stably: how to catch memory leaks, how to isolate CPU-heavy tasks, how to use multiple cores, how to do graceful shutdown.

For new-grad candidates, focus on language and runtime fundamentals: the event loop phases and microtask ordering, how Promises are implemented, closures and this, module loading, and whether they can write an async task scheduler with a concurrency limit. For experienced candidates, focus on production problems and design: investigating intermittent API stalls, heap snapshot analysis, streaming large files, Nest module and dependency-injection design, BFF aggregation and degradation, SSR service performance. Full-stack roles also press on collaboration with the frontend (API contracts, SSR, Monorepo); platform roles press on Node internals (libuv, N-API, Worker Threads) and judgment about Bun/Deno.

How to ask like an interviewer in this field:
- Leave architecture and methodology (cache consistency, message queues, rate limiting and degradation) to the backend pack; this pack focuses on the Node runtime, the async model, framework mechanics, and production operations.
- The event loop is a must-ask and must land on troubleshooting: do not accept recited phase order; give a "the service is stuck" scenario and have the candidate name the locating tools and the fix.
- Async error handling is the dividing line: every candidate should be pressed on unhandled rejections, error propagation in streams, and process crash strategy, and loose answers are marked as red flags.
- Set questions by role type: for full-stack roles press on API contracts and SSR; for platform roles press on Workers, multi-process, and runtime details; for small teams press on TypeScript engineering and simplified deployment.

## Probing projects and internships

When the resume shows experience like the items below, this says where to start and what to press on. An answer is solid once the candidate can state the mechanism, where their numbers came from, and one real failure or tradeoff; if they can only give framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume says BFF / API aggregation → probe whether downstream calls are parallel or serial, how timeouts and degradation are done, the caching strategy in the aggregation layer, and the gap between P99 and downstream
- Resume says NestJS → probe how modules were divided, which scopes were used, what the interceptors and guards do, and whether they have hit circular dependencies
- Resume says WebSocket / real-time → probe connection counts, heartbeat and reconnection, how broadcast works across multiple instances, and state recovery after disconnect
- Resume says "performance optimization" → probe which tools (flame graphs, heap snapshot), what the hotspot was, the before-and-after numbers, and whether there was load testing
- Resume says memory leak investigation → probe how it was discovered, what the snapshot diff showed, and whether the root cause was a cache, a listener, or a closure
- Resume says SSR / Next.js server side → probe render time, caching and streaming rendering, the resource usage of the Node service, and the cooperation with the CDN
- Resume says TypeScript / Monorepo → probe how strict the config is, the build tools, how types are shared between packages, and how CJS/ESM is handled
- Resume says Serverless / edge functions → probe cold-start optimization, how connection pools are handled in a stateless environment, and how logging and tracing are done

## Common failures and red flags

- Event loop and execution order: can only recite "macrotask, microtask"; does not know the libuv thread pool defaults to 4 threads and that fs/DNS/crypto use it; believes async/await keeps CPU computation from blocking
- Promises, async/await, and async error handling: does not know Promise.all discards the rest when one fails; uses forEach with await inside an async function; swallows errors in process.on('unhandledRejection')
- Streams and backpressure: reads a whole file into a Buffer before returning it; uses pipe without knowing it does not propagate errors; does not know what write returning false means
- Memory leaks and heap analysis: only adds --max-old-space-size; has never seen a heap snapshot; does not know what the EventEmitter MaxListeners warning means
- Profiling and CPU hotspots: optimizes by guessing; does not know console.log is synchronous in some cases; has never run a benchmark
- NestJS architecture and dependency injection: stuffs everything into AppModule; does not know what forwardRef solves; does not know the execution order of Pipes and Guards
- Express / Koa / Fastify middleware: does not know Express 4 does not catch async errors; writes error middleware with three parameters; does not know the onion model can do work in the response phase
- Clustering, multi-process, and deployment: still uses PM2 as a supervisor inside a container; does not know the cluster load distribution on Linux is round-robin; does not handle SIGTERM
- Module system and TypeScript engineering: cannot tell import type from import; tsconfig is all any; does not know the exports field
- Real-time communication and long connections: stores a large object per connection; does not know socket.io has its own protocol and fallback; does not handle state recovery after reconnect
- Security and input handling: does not know prototype pollution; writes regexes casually without considering backtracking; never runs npm audit after npm install
- Runtime choice and new features: Node version stuck at 14; does not know native fetch and the test runner; blindly chases new runtimes

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Event loop and execution order
- Ladder: why Node is single-threaded yet handles high concurrency → the libuv event loop phases (timers, poll, check, close), priority of microtasks and process.nextTick, the role of the thread pool → locating a case where a synchronous JSON.parse of a huge object or regex backtracking stalls every request, inaccurate timers, why setImmediate and setTimeout order is inconsistent → which tasks go to Worker Threads and which to a separate service, how to monitor event-loop delay
- Signs of a solid answer: uses perf_hooks monitorEventLoopDelay or --cpu-prof to catch blocking; knows UV_THREADPOOL_SIZE; puts CPU-heavy work in Worker Threads or a separate service; can state exactly the order of nextTick, Promise, setTimeout, and setImmediate and how it differs inside an IO callback

### Promises, async/await, and async error handling
- Ladder: Promise states and chaining → what async/await compiles to, the differences among Promise.all/allSettled/race/any, how to write a concurrency limit → investigating unhandledRejection exiting the process (Node 15+), errors lost by forgetting await, try/catch failing to wrap exceptions inside callbacks → error classification (retryable / business / programming errors) and a global fallback strategy, when to let the process crash and restart
- Signs of a solid answer: allSettled or per-promise catch; AbortController combined with timeouts; logs unhandledRejection and then exits per policy so the process manager restarts it; mentions Error.cause and custom error classes

### Streams and backpressure
- Ladder: why use streams → Readable/Writable/Transform, the difference between pipe and pipeline, highWaterMark, the drain event → memory spiking on a large file download, file handles leaking because errors after pipe went unhandled, investigating buffers that grow without bound when upstream is fast and downstream slow → when hand-writing a stream is worthwhile, the convergence of Web Streams and Node Streams, the overhead of object streams
- Signs of a solid answer: stream.pipeline unifies errors and cleanup; database queries use cursors or streaming APIs; waits for drain when write returns false; the res close event triggers upstream destruction; mentions Readable.from and consuming streams with async iterators

### Memory leaks and heap analysis
- Ladder: V8 memory structure and GC (young/old generation) → common leak sources (unbounded global cache, closure references, listeners not removed, timers not cleared) → the process for locating steadily growing memory: --heapsnapshot-signal, comparing snapshots, reading retainer paths → matching heap size (--max-old-space-size) to container memory, the restart strategy when a leak cannot be fixed
- Signs of a solid answer: compares the delta between two snapshots; reads retained size and the retainer tree; adds bounds and TTL to LRU caches; knows where WeakMap/WeakRef apply; knows Buffer lives off-heap and where ArrayBuffer is counted

### Profiling and CPU hotspots
- Ladder: how to tell where a service is slow → --cpu-prof, clinic.js, 0x flame graphs, the overhead of async_hooks → locating and optimizing when JSON serialization, synchronous log writes, template rendering, or regexes become hotspots → common causes of JIT deoptimization (deopt), when to switch to Fastify and when to use a Worker or native module
- Signs of a solid answer: reads flame graphs for self time versus waiting on downstream; turns serial awaits into parallel; streams JSON or trims fields; uses async logging such as pino; compares with autocannon load tests; knows the effect of hidden classes and megamorphic calls

### NestJS architecture and dependency injection
- Ladder: what Nest adds over Express → modules, providers, scopes (singleton/request/transient), lifecycle hooks, the execution order of guards/interceptors/pipes/filters → request-scoped providers slowing performance, circular dependency injection, investigating a global exception filter that misses some class of errors → whether Nest's abstraction layer is too heavy for a small project, the benefit of the Fastify adapter, module division in a Monorepo
- Signs of a solid answer: scope bubbling turns the whole dependency chain request-scoped; uses AsyncLocalStorage or CLS to carry request context; divides modules by domain and controls visibility with exports; custom decorators and DTO validation with ValidationPipe

### Express / Koa / Fastify middleware
- Ladder: what the middleware model is → Express's linear next, Koa's onion model and async middleware, Fastify's schema and hooks → investigating error middleware that does not fire, async errors that never reach next, and middleware ordering that lets authentication be bypassed → performance and ecosystem differences in framework choice, how to split the routing layer from the business layer
- Signs of a solid answer: express-async-errors or Express 5's Promise support; post-await-next handling of response time and errors in Koa; the performance gain from Fastify's JSON schema serialization; middleware order and security (helmet, rate limit, body size limits)

### Clustering, multi-process, and deployment
- Ladder: how a single process uses multiple cores → the cluster module's master/worker and port sharing, PM2 modes, one process or many inside a container → restart storms after worker crashes, sticky sessions and WebSocket problems under multi-process, investigating inconsistent state across processes → cluster versus horizontal container scaling, how graceful shutdown works with rolling releases
- Signs of a solid answer: a single process per container plus K8s scaling is simpler; SIGTERM → server.close stops accepting → wait for in-flight requests → close connection pools; WebSocket uses a Redis adapter or a separate gateway layer; health checks distinguish liveness from readiness

### Module system and TypeScript engineering
- Ladder: the difference between CommonJS and ESM → circular-dependency behavior differences, dual-package publishing, dynamic import, the require cache → investigating ESM/CJS interop errors, path aliases that break after compilation, and mismatches between types and runtime → the tsconfig strict policy, build tool choice (tsc/esbuild/swc/tsup), dependency management in a Monorepo (pnpm workspace/turborepo)
- Signs of a solid answer: package.json exports and conditional exports; import.meta.url in place of __dirname; the tradeoff of strict and noUncheckedIndexedAccess; zod for runtime validation and type inference; pnpm strict dependencies and phantom dependencies

### Real-time communication and long connections
- Ladder: how to choose among WebSocket, SSE, and long polling → the differences between ws and socket.io, heartbeat and reconnection, message ordering and loss → memory and file descriptors after connections pass ten thousand, broadcast storms, investigating message routing across multiple instances → build your own long-connection service or use managed push, how reliable messages need to be
- Signs of a solid answer: slim connection context and WeakRef; Redis pub/sub or an adapter for cross-instance broadcast; heartbeat timeouts and half-open connection cleanup; SSE is simpler for one-way push; mentions ulimit and kernel parameters

### Security and input handling
- Ladder: common Node security problems → prototype pollution, regex DoS, dependency supply chain, body size and JSON depth limits → a single regex pegs the CPU, a user-submitted __proto__ changes default behavior, investigating and defending against a poisoned dependency → the effect of security measures on performance and development efficiency, the dependency audit process
- Signs of a solid answer: Object.create(null) or key-name validation; safe-regex or RE2; helmet, rate limit, body limits; lockfile and npm audit/socket.dev; runs with least privilege

### Runtime choice and new features
- Ladder: what recent Node LTS releases brought → native fetch, the test runner, --watch, the permission model, single-file executables → dependency incompatibility and OpenSSL-related problems when upgrading a major Node version → the positioning and use cases of Bun/Deno relative to Node, when switching is worthwhile
- Signs of a solid answer: uses native fetch, AbortSignal.timeout, and structuredClone; Worker Threads and SharedArrayBuffer; evaluates Bun's compatibility and ecosystem rationally; knows the LTS lifecycle and upgrade cadence
