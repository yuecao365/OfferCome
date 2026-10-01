---
name: python
description: Python backend interviews covering the GIL and asyncio, web frameworks, ORMs, Celery. Read when the JD names Python.
keywords: [python, django, fastapi, flask, asyncio, celery, gunicorn, uvicorn, sqlalchemy, pydantic, gil, python backend, python development, server-side development, backend]
layer: detail
domains: [backend, ai-agent, ai-algorithm, ai-infra, algorithm]
---

## What interviewers care about

Python backend work is concentrated in AI applications and algorithm services, data platforms, SaaS, content and tooling products, and a large number of startups and foreign companies. The daily work is writing APIs with Django/FastAPI/Flask, accessing databases with SQLAlchemy or the Django ORM, handling async jobs with Celery or asyncio, running behind Gunicorn/Uvicorn, and deploying to containers. Python interviews have one notable feature: the language is so easy to pick up that "can write Python" is worth little, and interviewers really care about three things. First, whether the concurrency model is thoroughly understood: what the GIL actually limits, what asyncio, threads and processes each solve, and what happens when synchronous code is mixed into an async framework. Second, understanding of framework "magic": lazy evaluation and N+1 in the Django ORM, dependency injection and Pydantic validation in FastAPI, middleware and lifecycle. Third, whether the candidate has actually kept a Python service running stably: how the worker count is decided, why memory grows, what to do when a Celery task is lost, and how to measure where the time goes.

For campus hires, focus on the language and fundamentals: decorators, generators, context managers, the GIL and multithreading, language traps such as mutable default arguments, and whether they can use a framework to write a CRUD with authentication and pagination and explain each step. For experienced hires, focus on production problems and design: tracking down blocking calls in an async service, Celery reliability and idempotency, ORM performance tuning, the memory and deployment model of Python services, and when a hotspot should move to a Rust/Go extension or a separate service. AI companies additionally watch how model inference services are wrapped (batching, streaming responses, GPU resource isolation) and the engineering use of Python's type system.

How to ask like an interviewer in this field:
- Architecture and methodology (cache consistency, message queue semantics, rate limiting and degradation) belong to the backend pack; this pack stays on the Python runtime, framework mechanics and production operations.
- The concurrency model is a must-ask: every Python backend candidate should be asked about the GIL and on what basis they choose among threads, processes and coroutines, with a concrete scenario to verify real understanding.
- Framework questions must land on "where the magic fails": N+1 in the ORM, resource leaks in dependency injection, Celery ack semantics, not "describe the framework's features".
- Tie questions to project scale and company type: for small-team projects, probe engineering practice (types, tests, dependency management); for AI companies, probe model service wrapping; for high-traffic projects, probe the deployment model and memory governance.
- What is new in 2026 Python backend interviews: now that free-threaded (no-GIL) builds have moved from experimental to usable, "how do you get around the GIL" needs an answer on what multiprocessing, asyncio, subinterpreters and free threading each suit; Python is the default language for agents and model services, so interviewers will probe how to write timeouts, concurrency limits and streaming responses when calling a model from an async framework.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows FastAPI → probe how they choose between def and async def, what resources dependency injection manages, the Pydantic version and validation performance, and how many workers in deployment
- Resume shows Django → probe how N+1 was found and fixed, how migrations run in production, which built-in Django features they used instead of building their own, and whether async views are used
- Resume shows Celery / task queues → probe the acks policy, how idempotency is done, whether backlogs have happened, how queues are split, and how beat is protected against duplicates
- Resume shows asyncio / aiohttp / httpx → probe how blocking calls are tracked down, how the concurrency cap is controlled, how exceptions are collected, and whether they have hit the lost-Task pitfall
- Resume shows SQLAlchemy → probe Session scoping, the arithmetic of connection pool versus worker count, 1.x or 2.0 style, and lazy-loading problems with the async engine
- Resume shows "performance optimization" → probe py-spy or cProfile, what the hotspot was, whether they swapped a library or changed the algorithm, and the before and after numbers
- Resume shows model serving / LLM API wrapping → probe streaming and cancellation, batching, GPU memory and the worker model, and how timeouts are propagated
- Resume shows Gunicorn / Uvicorn / Docker deployment → probe the basis for worker type and count, how memory growth is handled, and how graceful restarts are done

## Common failures and red flags

- GIL and choice of concurrency model: believes the GIL makes Python unable to run in parallel at all; does not know numpy/IO calls release the GIL; treats asyncio as a way to speed up CPU computation
- asyncio internals and tracking down blocking: calls requests directly inside async def; does not know asyncio.create_task requires holding a reference; believes async is always faster than sync
- FastAPI and Pydantic: does not know a def handler runs in a thread pool; cannot state the differences between Pydantic v1 and v2; uses dependency injection only as parameter passing
- Django ecosystem and ORM depth: does not know when a QuerySet actually executes; accesses foreign-key attributes inside a for loop; runs migrations that add an index to a big table in production without looking at locks
- SQLAlchemy and database access: one global Session used everywhere; does not know pool_pre_ping; gets an error accessing a relationship attribute in an async session and does not know why
- Celery and task queue reliability: does not know the default is acks_early; passes large objects as task arguments; all tasks share one queue and one worker pool
- Deployment model, Gunicorn / Uvicorn and workers: does not know a sync worker handles one request at a time; opens database connections before fork; in containers does not know how to match the memory limit to the worker count
- Performance diagnosis and optimization: only times with print; has never used py-spy; optimizes without a benchmark
- Memory management and leaks: believes having a GC means no leaks; does not know lru_cache is unbounded; does not know memory from C extensions is not visible in tracemalloc
- Language features and common traps: can only recite "decorators are syntactic sugar"; does not know functools.wraps; writes type annotations but never runs a checker
- Testing and project engineering: no lock file; tests connect straight to the production database; does not know fixture scopes
- AI / model service wrapping (optional, often asked at AI companies): each worker loads its own copy of the model; streams by polling; does not know how to detect a client disconnect

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for how deep a solid answer goes; which topics to ask and how many is decided by this JD and this resume, not a quota.

### The GIL and choice of concurrency model
- Ladder: what the GIL is and what it limits → how threads, processes and asyncio each perform under IO-bound and CPU-bound work, GIL switching and C extensions releasing the GIL → a service gains a thread pool but throughput does not rise, diagnosing multiprocess shared state and memory-copy problems → which tasks should be handed to a process pool, a C extension, or a separate service, and what Python 3.13's free-threaded build and subinterpreters mean
- Signs of a solid answer: distinguishes IO-bound (threads/coroutines) from CPU-bound (processes or C extensions); knows about copy-on-write of shared read-only memory after fork; mentions the serialization overhead of ProcessPoolExecutor; has a basic understanding of the per-interpreter GIL in 3.12+ and the experimental no-GIL in 3.13 without being starry-eyed about them

### asyncio internals and tracking down blocking
- Ladder: how coroutines and the event loop work → yield points at await, Task and Future, gather and TaskGroup, async IO libraries (aiohttp, asyncpg, httpx) → a synchronous database driver or time.sleep in an async service freezes the whole loop, a Task is garbage-collected and silently disappears, an exception is never awaited → when to use run_in_executor, the limits of async's benefit and its debugging cost
- Signs of a solid answer: catches blocking with loop.slow_callback_duration or PYTHONASYNCIODEBUG; puts synchronous calls in run_in_executor or anyio.to_thread; manages exceptions with TaskGroup (3.11) or gather's return_exceptions; knows uvloop's benefits and limits

### FastAPI and Pydantic
- Ladder: how FastAPI is positioned against Flask/Django → dependency injection scope and caching, Pydantic v2 validation and serialization, thread-pool behavior of def versus async def handlers → Pydantic validation becomes the bottleneck as request volume rises, a database session opened in a dependency is never closed, background tasks are lost → what scale of project FastAPI suits, and how to make up for the missing "batteries" (ORM, admin, migrations)
- Signs of a solid answer: explains the default anyio thread-pool capacity (40); the Rust core of Pydantic v2 and model_validate performance; dependencies that yield to clean up resources; where BackgroundTasks ends and Celery begins; automatic OpenAPI generation and contract testing

### Django ecosystem and ORM depth
- Ladder: Django's request lifecycle and middleware → lazy evaluation of QuerySets, select_related/prefetch_related, transactions and atomic, the cost of signals → diagnosing N+1, slow pagination on big tables, migrations that lock tables, ORM-generated SQL that differs from expectations → when Django's "all-in-one" is an asset and when a burden, choosing between DRF and Django Ninja, the current state of async views
- Signs of a solid answer: the memory and SQL cost of select_related using a JOIN versus prefetch_related using an IN query; only/defer and values to cut fields; iterator for large result sets; knows the boundaries of the async ORM in Django 4.2+; migrations that separate schema from data and use RunSQL to build indexes concurrently

### SQLAlchemy and database access
- Ladder: the difference between Core and ORM → Session lifecycle and identity map, 2.0-style select, autoflush and expire_on_commit → diagnosing connection pool exhaustion, a Session shared across threads, DetachedInstanceError, lazy-loading errors under the async engine → the boundary between ORM and raw SQL, how to match pool size to worker count
- Signs of a solid answer: request-scoped Session; the arithmetic total connections = worker × (pool_size + max_overflow); explicit loading with selectinload under async; Alembic migrations and versioning; locating slow queries with echo or database-side logs

### Celery and task queue reliability
- Ladder: why Celery, and what Broker and Backend each are → acks_late, prefetch, visibility timeout, task retries and idempotency → diagnosing lost tasks, duplicate execution, steadily growing worker memory, queue backlog, scheduled tasks firing twice → trade-offs between Celery and RQ/Dramatiq/arq or using Kafka directly, whether long and short tasks should go in separate queues
- Signs of a solid answer: acks_late plus an idempotency key; how the Redis broker's visibility_timeout relates to long tasks; queues split by priority and duration; workers use max_tasks_per_child to guard against memory leaks; beat runs as a single instance or with a lock; large data is not stored in the result backend

### Deployment model, Gunicorn / Uvicorn and workers
- Ladder: the difference between WSGI and ASGI → Gunicorn's pre-fork model, worker types (sync/gthread/uvicorn worker), worker count and timeouts → diagnosing requests killed by worker timeout, memory growing over time, strange errors from database connections shared after fork → one process with many workers or many containers with one process each, and how that fits Kubernetes resources
- Signs of a solid answer: chooses worker type by IO/CPU profile; uses preload_app and post_fork hooks to handle connections; rotates workers with max_requests and jitter; the simple model of one process per container plus horizontal scaling; graceful restarts and graceful_timeout

### Performance diagnosis and optimization
- Ladder: where Python is slow → what cProfile, py-spy, Scalene and memray each show, sampling versus instrumentation → steps to locate high CPU, slowly growing memory, and high API P99 in production, common hotspots (JSON serialization, ORM object construction, regex, logging) → when to optimize Python code, when to swap a library (orjson, pydantic v2), and when to go to a Cython/Rust extension or split the service
- Signs of a solid answer: attaches py-spy dump/record directly to the production process; locates memory with memray or tracemalloc; reduces object construction, streams responses, caches serialized results; verifies with timeit/pytest-benchmark

### Memory management and leaks
- Ladder: how reference counting relates to the generational GC → reference cycles, the __del__ pitfall, memory fragmentation and arenas not returned to the operating system → diagnosing worker memory that keeps growing while GC stats look normal, RSS not dropping after large objects are freed, caches with no upper bound → whether to turn off the generational GC, rotate workers with max_requests, or fix the root cause
- Signs of a solid answer: distinguishes the Python heap from C-level memory (numpy, drivers); memray's native tracking; gc.freeze and the fork scenario; caches with limits and TTLs; finds reference cycles with objgraph or gc.get_referrers

### Language features and common traps
- Ladder: what decorators, generators and context managers are for → descriptors, metaclasses, __slots__, the internals of dataclass and attrs → debugging production bugs from mutable default arguments, late-binding closures, shallow copies, is versus == → the benefit of type annotations (typing, mypy/pyright) in large projects and the cost of rolling them out
- Signs of a solid answer: can write a decorator with arguments that preserves metadata; uses generators for streaming to save memory; uses Protocol for structural typing; rolls out mypy strict in stages; mentions pattern matching from 3.10+ and type parameter syntax from 3.12

### Testing and project engineering
- Ladder: pytest fixtures and parametrization → mocks and dependency injection, transaction rollback in database tests, async tests → governing slow, flaky tests and coupling to external services → dependency management (poetry/uv/pip-tools), lock files, image builds and reproducible environments
- Signs of a solid answer: layered unit and integration tests; testcontainers or factory_boy; pytest-xdist for parallelism; ruff + mypy + pre-commit; multi-stage Docker builds and running as non-root

### AI / model service wrapping (optional, often asked at AI companies)
- Ladder: what to watch for when wrapping a model as an API → request batching, streaming responses (SSE), GPU memory and the process model → diagnosing a single large request blocking all requests, the model loaded in every worker and duplicating GPU memory, timeouts and cancellation not propagating to inference → wrapping it yourself or using an inference framework (vLLM, Triton, Ray Serve)
- Signs of a solid answer: StreamingResponse and request.is_disconnected; load once in a single process plus queue-based batching; async inference isolated from the thread pool; knows mature inference frameworks and where building your own stops making sense
