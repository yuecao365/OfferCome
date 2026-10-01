---
name: cpp
description: How to interview C++ backend engineers, covering memory, RAII, STL, threads, atomics, IO models, modern C++.
keywords: [c++, cpp, c++ backend, server-side development, infrastructure, smart pointers, raii, stl, multithreading, atomics, epoll, network programming, performance optimization, modern c++, game server]
layer: detail
domains: [backend, ai-infra]
---

## What interviewers care about

C++ backend roles mainly show up in infrastructure (storage, database kernels, RPC frameworks, message queues), networking and gateways, game servers, quantitative trading, and online services for audio/video and recommendation engines. The daily work is writing services for multithreaded, high-performance, resource-constrained settings, dealing directly with memory, locks, system calls, and CPU caches. The through-line of a C++ interview is very stable: object lifetime and the memory model, smart pointers and RAII, the internals of STL containers and algorithms, multithreading and atomics, network IO models (epoll, Reactor), profiling and performance optimization, and practical use of modern C++ (11 through 23). The language is complex, so interviewers care most about three things. First, whether the candidate can write code that does not crash, leak, or invoke undefined behavior, and can spot a dangling reference, data race, or exception-unsafe spot in a snippet. Second, whether their performance intuition rests on measurement: they know the cost of cache lines, branch prediction, and memory allocation, and have used perf and sanitizers. Third, their understanding of the system layer: process and thread models, IO multiplexing, memory allocators, and the cost of locks.

For new-grad hiring, the emphasis is language fundamentals and hand-coding: how virtual functions and polymorphism are implemented, copy and move semantics, how smart pointers work internally, STL container complexity and invalidation rules, and hand-writing a thread-safe queue or a simple Reactor. For experienced hires, the emphasis is engineering and troubleshooting: core dump analysis, memory leaks and fragmentation, lock contention and false sharing, edge-triggered epoll and the thundering herd, zero-copy and batching, compile-time optimization and build systems. Infrastructure teams go deep into memory ordering, lock-free structures, and the design of coroutine and async frameworks (brpc, seastar, asio); game companies ask more about lockstep synchronization, object pools, and hot updates.

How to ask questions like an interviewer in this field:
- Architecture and methodology (cache consistency, message queues, rate limiting and degradation) belong to the backend pack. This pack focuses on C++ language mechanics, the system layer, and performance engineering.
- Code first: for memory, concurrency, and STL topics, give a snippet of ten lines or fewer and have the candidate find the bug or complete it, then press on each object's lifetime and each thread's visibility.
- Performance questions need measurement: for any optimization the candidate mentions, press on how it was measured, with which tool, and the numbers before and after. "Faster in theory" does not count.
- Adjust depth by direction: for infrastructure and storage roles, press on memory ordering, allocators, and IO model details; for business-service roles, focus on correctness (RAII, exception safety, thread safety) and troubleshooting tools.

## Probing projects and internships

When the resume shows experience like the following, this is where to start and what to press on. An answer is solid only when the candidate can state the mechanism, where the numbers came from, and one real failure or tradeoff. If they offer only framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume mentions a self-built network framework / RPC → press on the threading model (how many Reactors, how dispatch works), buffers and framing protocol, connection management and timeouts, benchmark data and what it was compared against
- Resume says "high performance" / "low latency" → press on how it was measured (perf, benchmark), what was optimized (allocation, locks, copies, caching), and P99 from what to what
- Resume mentions multithreading / lock-free → press on how lock granularity was decided, whether there were ever deadlocks or races, how correctness was verified (TSan, stress tests), and ABA and memory reclamation in lock-free structures
- Resume mentions a smart-pointer refactor / memory governance → press on how leaks were found, how ownership was sorted out, and whether the overhead of shared_ptr on the hot path was ever measured
- Resume mentions a C++17/20 migration → press on which features solved what problems, whether coroutines or ranges were actually adopted, and how compile time changed
- Resume mentions a storage engine / database kernel → press on page management and caching, concurrency control, WAL and crash recovery, and the choice of memory allocator
- Resume mentions a game server → press on lockstep versus state synchronization, object pools and memory layout, the hot-update mechanism, and the split between single-threaded logic and multithreaded IO
- Resume mentions core dumps / handling production crashes → press on how symbols were obtained, what kind of UB or race the root cause was, and what tooling or checks were added afterward

## Common failures and red flags

- Object lifetime and memory model: does not know RVO exists and std::move's return values everywhere; cannot tell a dangling reference from a wild pointer; has never used AddressSanitizer
- Smart pointers and RAII: thinks shared_ptr being thread-safe means the pointed-to object is thread-safe too; uses new instead of make_shared but cannot state the difference; a hand-written smart pointer does not handle self-assignment
- Polymorphism, virtual functions, and object layout: can only recite "vtable"; does not know destructors must be virtual; does not know final and devirtualization
- Internals of STL containers and algorithms: uses map for every case; does not know reserve; uses an old iterator after erase; does not know the difference between emplace and push
- Multithreading, locks, and thread-safe design: condition_variable without a predicate; does IO while holding a lock; uses volatile for thread synchronization; does not know thread_local
- Memory ordering and atomics: thinks atomic defaults to relaxed; does not know x86 is a strong memory model, so "it passed testing" proves nothing; lock-free queue ignores ABA
- Network programming and IO models: cannot tell LT from ET; does not know SO_REUSEPORT; treats TCP as having message boundaries; does not handle EINTR
- Profiling and optimization: optimizes by guessing; does not know the difference between perf record and perf stat; has never swapped the allocator
- Memory allocation, leaks, and fragmentation: thinks no leak report means no problem; does not know jemalloc stats and heap profiling; uses memset to zero memory as a way of "freeing" it
- Modern C++ and engineering practice: still uses raw new/delete and C-style arrays; does not know auto&& and perfect forwarding; writes everything as templates
- Exceptions, error handling, and safety: does not know noexcept affects whether vector growth uses move; catch(...) swallows everything; throws exceptions from destructors
- Build, dependencies, and debugging toolchain: does not know -O2 can expose undefined behavior; has never looked at a core dump; does not know about separate debug info

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed here, as a reference for "how deep counts as grounded". Which topics to ask and how many is decided by this JD and this resume, not by a quota.

### Object lifetime and memory model
- Ladder: stack, heap, static storage, and construction and destruction order → copy constructor, move constructor, RVO/NRVO, temporaries and lifetime extension by reference → dangling references, returning a reference to a local, iterator invalidation, and ways to diagnose use-after-free (ASan, Valgrind) → value versus reference semantics as a design choice, and when copying is safer than sharing
- Signs of a solid answer: can state construction/destruction order and exception safety; knows a moved-from object is in a "valid but unspecified" state; ASan/UBSan are always on in CI; mentions the lifetime traps of std::string_view and std::span

### Smart pointers and RAII
- Ladder: why use smart pointers → unique_ptr is zero-overhead, shared_ptr's control block and atomic reference count, weak_ptr breaks cycles, enable_shared_from_this → shared_ptr cycle leaks, races on shared_ptr itself across threads, and diagnosing double free from mixing raw and smart pointers → ownership design: what should be unique, what shared, what observed through raw pointer or reference, and whether shared_ptr's cost on the hot path is worth it
- Signs of a solid answer: explains make_shared's single allocation and the side effect that weak_ptr delays memory release; expresses ownership with unique_ptr and borrowing with references or raw pointers; uses RAII for locks, files, and sockets, not just memory; uses custom deleters

### Polymorphism, virtual functions, and object layout
- Ladder: how virtual functions are implemented → vtable and vptr layout, multiple and virtual inheritance, behavior of calling a virtual function in a constructor → the indirect jump of virtual calls and lost inlining, diagnosing cache-unfriendly behavior from object size and alignment → choosing between runtime and compile-time polymorphism (templates, CRTP, std::variant + visit)
- Signs of a solid answer: can compute sizeof and alignment; uses final to help the compiler devirtualize; knows the benefit of variant + visit or CRTP for a closed set of types; can state the cost of dynamic_cast

### Internals of STL containers and algorithms
- Ladder: where vector, deque, list, map, and unordered_map each fit → vector growth and iterator invalidation, unordered_map buckets and rehash, map's red-black tree and its cache-unfriendliness → allocation overhead from inserting and deleting many small objects, degradation from hash collisions, diagnosing crashes from iterator invalidation on erase → when to use flat_map, absl's swiss table, a custom allocator, or pmr
- Signs of a solid answer: preallocation and reserve; heterogeneous lookup (transparent comparator) to avoid constructing temporary strings; the advantage of flat structures on small collections; knows std::pmr and memory pools; uses algorithm and ranges

### Multithreading, locks, and thread-safe design
- Ladder: std::thread and thread pools → mutex, condition_variable spurious wakeups, lock_guard/unique_lock/scoped_lock, shared_mutex → locating deadlocks (gdb thread stacks), throughput that does not scale because of lock contention, and diagnosing and verifying false sharing → where lock granularity, sharding, read/write separation, thread-local storage, and lock-free structures each apply
- Signs of a solid answer: handles spurious wakeups with a predicate loop; weighs notifying outside versus inside the lock; alignas(64) to avoid false sharing; uses sharded or per-thread queues for multiple producers and consumers; can verify with perf or ThreadSanitizer

### Memory ordering and atomics
- Ladder: what problem std::atomic solves → the six memory_order values, acquire/release pairing, the cost of sequential consistency → using relaxed for a counter but relying on its visibility elsewhere, double-checked locking failing on weak-memory-model CPUs, diagnosing ABA → the verification cost of lock-free structures, and when writing lock-free is worth it
- Signs of a solid answer: explains the happens-before that release-acquire establishes; knows the difference between x86 TSO and ARM's weak ordering; the difference between compare_exchange_weak and strong; mentions hazard pointers or epoch reclamation; knows TSan cannot fully verify memory-ordering problems

### Network programming and IO models
- Ladder: the differences among blocking, non-blocking, and IO multiplexing → epoll LT/ET, Reactor versus Proactor, one loop per thread → diagnosing starvation from not reading everything under edge trigger, thundering herd, massive TIME_WAIT, connection leaks, and TCP stream-framing mistakes → single Reactor with multiple threads versus multiple Reactors, the benefit of io_uring, building your own versus using asio/brpc/muduo
- Signs of a solid answer: ET must read in a loop until EAGAIN; caps bytes handled per event or uses LT; multiple Reactors use SO_REUSEPORT or dispatch after accept; application-layer framing protocol and buffer management; knows how io_uring differs from epoll and its kernel version requirements

### Profiling and optimization
- Ladder: how to find the performance bottleneck → perf sampling and flame graphs, observing cache misses and branch prediction (perf stat), the cost of memory allocation → optimization techniques when the hotspot is in malloc, locks, system calls, or memory copies respectively, locating jitter (tail latency) → the benefit boundaries and maintenance cost of swapping allocators (jemalloc/tcmalloc), object pools, zero-copy, batching, and compiler options (LTO, PGO)
- Signs of a solid answer: perf flame graphs and off-CPU analysis; perf stat for IPC, cache-misses, branch-misses; preallocation with mlock and huge pages; jemalloc arenas and thread caches; verifies with a benchmark (google benchmark) and guards against the compiler optimizing the code away

### Memory allocation, leaks, and fragmentation
- Ladder: how new/delete relate to malloc/free → allocator layers (thread cache, arena, page), memory alignment and padding → memory slowly growing while ASan reports no leak (fragmentation or an unbounded cache), RSS not shrinking, analyzing a core dump to see who holds memory → where object pools, arena allocators, and pmr fit, and the operational differences compared with GC languages
- Signs of a solid answer: jemalloc/tcmalloc heap profiles and fragmentation stats; fixed-size objects go through a pool; large objects use mmap directly; the role and limits of malloc_trim; loads a core in gdb to inspect stacks and container contents

### Modern C++ and engineering practice
- Ladder: the key features C++11/14/17/20 each brought → move semantics and perfect forwarding, constexpr, structured bindings, optional/variant/string_view, concepts, ranges, coroutines → misusing universal references and std::forward, dangling lambda captures, unreadable template errors, diagnosing compile-time explosions → how the team sets its C++ standard and coding guidelines, and where template metaprogramming stops being readable
- Signs of a solid answer: pass-by-value plus move interface design; constexpr and if constexpr to cut runtime overhead; concepts to improve template error messages; modules and precompiled headers to shorten compile time; clang-tidy and formatting to unify style

### Exceptions, error handling, and safety
- Ladder: how to choose between exceptions and error codes → the three levels of exception safety, noexcept and moves, the cost of stack unwinding → diagnosing terminate caused by exceptions thrown from destructors or crossing a C interface or thread boundary → why infrastructure projects ban exceptions, practice with std::expected (C++23) and outcome, defending against integer overflow and buffer overruns
- Signs of a solid answer: factory functions return optional/expected; RAII guarantees exception safety; the scope of impact of -fno-exceptions; UBSan and fuzz testing; bounds checking and safe integer arithmetic

### Build, dependencies, and debugging toolchain
- Ladder: CMake's target model → the differences between static and dynamic linking, symbol visibility, ODR violations → diagnosing link errors, ABI incompatibility, debug versus release behavior differences, and locating problems from a core dump → package management (vcpkg/conan/bazel), build caching, monorepos and build-time governance
- Signs of a solid answer: suspects UB and uninitialized variables first; objcopy to split symbols and a debuginfo service; gdb bt/frame/print and reverse debugging; sanitizer builds always on in the test environment; ccache and distributed compilation
