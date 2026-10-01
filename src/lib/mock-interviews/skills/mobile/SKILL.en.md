---
name: mobile
description: Platform-neutral mobile interviewing on lifecycle, rendering, networking, offline sync, app size, startup, and release.
keywords: [mobile, client-side, app development, client development, android, ios, flutter, react native, cross-platform, startup optimization, app size, staged rollout, mobile development]
layer: domain
---

## What interviewers care about

A mobile engineer (also called client developer, app developer, or Mobile Engineer; large Chinese companies often split roles by Android/iOS, but infrastructure teams require both platforms) turns product requirements into an app that runs stably on thousands of device models: building screens and interactions, integrating networking and local storage, managing the app lifecycle and background behavior, watching startup speed and app size, handling crashes and ANR/jank, going through review and staged rollout, and adopting cross-platform solutions where they fit. The platform-neutral part weighs more and more in real interviews: interviewers ask "the user switches to the background and comes back and the page state is lost, what do you do", "how do you keep a list usable on a weak network", "the crash rate rose after a release, how do you stop the bleeding". The answers differ between Android and iOS but the reasoning is the same. Interviewers care about three things most. First, is there a closed loop for investigating production problems (crashes, jank, battery, app size, and startup each have their own attribution methods and tools). Second, respect for the uncertainty of devices and networks (low-end phones, weak networks, the system killing processes, permission changes). Third, release and quality awareness (staged rollout, hotfix, rollback, A/B experiments, review rules).

For new-grad candidates, focus on language fundamentals and basic platform concepts: lifecycle, threading model, memory management, common UI components and layouts, network requests and JSON parsing. For experienced candidates, focus on architecture and production experience: modularization and componentization, the numbers behind startup and app-size governance, the process of bringing crash and ANR rates down, judgment in choosing dynamic-delivery and cross-platform frameworks, and how they drive quality metrics in a large team. Client interviews at top companies typically have four segments, "hand-written algorithms + platform internals + production troubleshooting + architecture design", and this pack covers the platform-neutral part of the last three.

How to ask like an interviewer in this field:
- Start mobile questions from "the uncertainty of devices and networks": low-end phones, weak networks, being killed in the background, denied permissions. Ask about the symptom and how to locate it first, then the principle. Press a candidate who can recite one platform's lifecycle callbacks but cannot say why the system works that way.
- Press for numbers and tools on every optimization: startup, app size, crash rate, and frame rate all require the measurement point definition, production data, and a before-and-after comparison. "It feels faster" is not an answer.
- Two-platform thinking comes first: for platform-neutral questions, have the candidate name the differences between Android and iOS, and a candidate who knows only one platform should be able to say roughly how the other does it. Leave platform details to the stack pack.
- Set questions according to team and user scale: for a small team's utility app, do not hard-test the staged-rollout platform or modularization; for an app with millions of daily actives, always press on stability governance and the release process.

## Probing projects and internships

When the resume shows experience like the items below, this says where to start and what to press on. An answer is solid once the candidate can state the mechanism, where their numbers came from, and one real failure or tradeoff; if they can only give framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume says "startup time optimized by X%" → probe the measurement point definition (first frame or interactive), production or local data, the single biggest change, and whether lazy initialization caused features to be occasionally unavailable
- Resume says "app size reduced by X MB" → probe the analysis tools, the few biggest sources, what dynamic delivery was done, and whether a CI gate prevents regression
- Resume says "crash rate reduced from X to Y" → probe the denominator definition, the top crash types and root causes, whether a hotfix or a release was used, and whether they have handled intermittent crashes inside system libraries
- Resume says "performance optimization / jank governance" → probe the tools used to locate problems, before-and-after frame rate or slow-function metrics, and the hardest jank root cause
- Resume says modularization / componentization / architecture upgrade → probe the basis for splitting modules, how modules communicate, the change in build time, and the resistance when rolling it out to the team
- Resume says cross-platform (RN / Flutter / mini-program container) → probe why it was chosen, which pages did not use cross-platform, bridge performance problems, the impact on app size and startup, and consistency problems across the two platforms
- Resume says offline / sync → probe the data model, conflict strategy, idempotency and ordering of the replay queue, and the weak-network testing method
- Resume says staged rollout / A/B experiments / hotfix → probe the ramp-up strategy and observation metrics, how many times they rolled back, and how the review risk of hotfixes was handled

## Common failures and red flags

- App lifecycle and state restoration: can only recite one platform's lifecycle callbacks and cannot say why the system kills processes; believes going to the background will not lose state; does not know the difference between a low-memory kill and a user force-quit
- UI rendering and jank investigation: only says "reduce layout nesting" and "use RecyclerView/reuse" without using tools; does not know which thread image decoding happens on; blames all jank on "bad devices"
- Memory management and leak investigation: cannot tell high memory usage from a memory leak; does not know images are the biggest memory consumer; only says "use LeakCanary/Instruments" but cannot explain how to read a retention chain
- Network layer design and weak networks: one timeout for all requests; retries with no backoff or cap; does not know idempotency keys; thinks a weak network just needs "a loading spinner"
- Local storage and caching strategy: stores everything in key-value pairs; database migrations have no versioning or tests; reads and writes files on the main thread
- Offline availability and data sync: believes "caching the last API response" is offline support; ignores operation ordering and idempotency; the conflict strategy is "last write wins" but cannot state the cost
- Startup optimization: measures startup with a stopwatch by eye; does not know the startup phases; initializes every SDK synchronously in Application/AppDelegate
- App size governance: only knows "compress images"; has no experience with app-size analysis tools; does not know the effect of SO architectures and dynamic libraries on size
- Crashes, ANR, and stability governance: does not know their own project's crash rate; the crash platform is used only for the top list with no drill-down; has no staged rollout or switch mechanism at all
- Release, staged rollout, and dynamic delivery: ships to everyone with no staged rollout; switches have no default value or expiry policy; treats hotfix as a routine release method
- Cross-platform and technology selection: believes cross-platform can fully replace native; does not know the rendering-principle differences among solutions; the only reason for the choice is "the team is familiar with it"
- Permissions, privacy, and compliance: requests all permissions at once at launch; does not know the basic privacy compliance requirements; has no awareness of auditing SDK behavior
- Architecture and modularization: a pile of architecture terms but cannot say what concrete problem they solve; after modularization every module depends on every other; has no build-time data

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### App lifecycle and state restoration
- Ladder: what states the app goes through from cold start to foreground, to background, to being killed by the system → how page and data state is saved and restored across foreground/background switches, the difference between process recreation after a kill and a cold start, system limits on background tasks → a half-filled form is lost after the user returns from the camera, or the page is blank or the data is corrupted when coming back to the foreground, how to locate and fix it → the granularity of state saving (memory, disk, server) and its implementation cost, which state is worth persisting and which can be rebuilt
- Signs of a solid answer: distinguishes in-memory state, process-recreation state, and cold start; has practiced auto-saving drafts; knows the limits on background execution time and the boundary of keep-alive techniques; can state how to test the restoration approach (the developer option "don't keep activities", or simulating a memory warning)

### UI rendering and jank investigation
- Ladder: why a frame must fit in 16ms (or 8ms) and how users perceive dropped frames → what the main thread is responsible for, the layout/measure/draw flow, the division of labor between the rendering pipeline and the GPU, overdraw → when a list drops frames on scroll, how to use platform tools (Systrace/Perfetto, Instruments, Flutter DevTools) to tell whether it is deep layout hierarchy, main-thread IO, image decoding, or GC → the payoff and complexity of recycling and prefetching, async layout, flattening hierarchy, and pre-rendering; which jank is worth fixing
- Signs of a solid answer: can read a frame timeline and attribute to a specific stage; knows to sample images to display size; has integrated jank monitoring (frame rate, slow-function stack sampling); understands that main-thread IO and lock contention also drop frames

### Memory management and leak investigation
- Ladder: why memory is tighter on mobile than on desktop, how OOM shows up → the difference between reference counting and GC models, common leak sources (static references to pages, listeners not unregistered, closure retain cycles, singletons holding a Context) → how to reproduce and locate an online memory alert or OOM crash (memory snapshots, leak-detection tools, tracking memory growth per page) → tradeoffs in image cache size, cache pools, and degradation strategy; balancing memory and smoothness
- Signs of a solid answer: can draw a typical retention chain; understands where weak references apply; has experience with online memory monitoring (per page, per device model); knows what the memory-warning callback should release

### Network layer design and weak networks
- Ladder: how an HTTP request is sent on the client, common networking libraries → connection reuse, DNS resolution and HTTPDNS, timeout and retry strategy, the benefit of HTTP/2 and QUIC on mobile networks → on a weak network the page spins forever or an order is submitted twice, how to investigate and design for it (tiered timeouts, idempotency keys, backoff retries, request priority) → tradeoff between a self-built persistent connection and plain HTTP, the benefit and migration cost of a unified networking wrapper, the operational burden of certificate pinning and security
- Signs of a solid answer: distinguishes connect timeout from read timeout; auto-retries only GET and idempotent writes; mentions weak-network simulation tools and testing; has network-quality tiers and request degradation strategy

### Local storage and caching strategy
- Ladder: what key-value storage, files, and databases each hold → cache expiry and eviction policy, database indexes and migrations, the harm of main-thread IO → a crash after upgrade in a database migration, data lost because the system cleared the cache directory, a cache that has grown to several GB, how to investigate and govern → balancing cache hit rate and disk usage, the performance cost of encrypted storage, which data must be persisted and which can always be rebuilt
- Signs of a solid answer: stores data in layers by type; has cache size tracking and LRU cleanup; database migrations have upgrade-path tests; knows the difference between system cache directories and user data directories

### Offline availability and data sync
- Ladder: how the app should behave when offline → local-first architecture, operation queues and replay, conflict detection and resolution strategies → after offline edits sync on reconnect, data is overwritten, ordering is wrong, or uploads are duplicated, how to locate and design for it → the cost gap between fully offline-first and "show cache + act online", leaving conflict resolution to the user versus auto-merge
- Signs of a solid answer: distinguishes read-only offline from writable offline; operation log and version numbers; has conflict visualization or a merge strategy; knows sync must account for battery and data usage

### Startup optimization
- Ladder: the difference between cold, warm, and hot start and how users perceive them → the division of startup phases (process creation, framework initialization, first-screen first frame, interactive) and their measurement points, dependencies and parallelism among startup tasks → startup time rose from 1.2s to 2.5s, how to attribute it (SDK initialization, main-thread IO, class loading, serialized first-screen data requests) → the benefit of lazy and on-demand initialization versus the risk of "a first-screen feature is occasionally unavailable", the tug-of-war between startup metrics and business-side SDKs
- Signs of a solid answer: has online startup monitoring and version comparison; startup tasks form a directed graph with thread assignment; knows the boundary between first-screen preloading and lazy loading; can say where startup optimization's returns diminish

### App size governance
- Ladder: why app size affects download conversion → how to analyze what is in the package (code, resources, SO/dynamic libraries, third-party SDKs), compression and obfuscation, on-demand resource delivery → the release package grew from 80MB to 120MB, how to find the source of the increase and how to spot duplicate dependencies brought in by SDKs → the operational cost and review risk of dynamic delivery, the effect of on-demand loading on first-use experience, the effect of image format and compression ratio on visual quality
- Signs of a solid answer: has a CI size gate and attribution report; knows resource obfuscation, unused-resource cleanup, WebP/AVIF; understands mechanisms like App Bundle/App Thinning; knows the review boundaries of dynamic delivery

### Crashes, ANR, and stability governance
- Ladder: how crash rate is defined and roughly what the industry baseline is → how crash collection works (signals, exception capture), symbolication, how ANR/main-thread freeze detection works → after a release the crash rate rose from 0.1% to 0.5%, how to stop the bleeding and attribute it (drill down by version, device model, OS, page; roll back, hotfix, or turn off via config), what to do about intermittent crashes whose stacks are inside system libraries → the benefit and review risk of hotfixes, the tug-of-war between stability metrics and iteration speed
- Signs of a solid answer: ranks crashes by affected users rather than count; has staged-rollout ramp-up and switch-based degradation; knows OOM and watchdog-type crashes need special collection; has experience analyzing ANR/freeze stacks

### Release, staged rollout, and dynamic delivery
- Ladder: the app store release process and review essentials → staged rollout ramp-up strategy, A/B experiment framework, remote config and switches, how hotfix works → during staged rollout how to quickly pin down a problem on one device model, how to analyze an A/B result that is insignificant or opposite to expectation, how to handle a hotfix patch that causes a new crash → the benefit versus experience, review, and maintenance cost of dynamic frameworks (mini-program containers, H5, RN, custom DSL), which businesses are worth making dynamic
- Signs of a solid answer: staged-rollout metrics include crashes, key funnels, and performance; config has versions and rollback; understands iOS review's stance on hotfixes; can state the limits of dynamic delivery

### Cross-platform and technology selection
- Ladder: what native, H5, React Native, Flutter, and mini-program containers each are → each solution's rendering principle (WebView, JS bridge + native controls, self-drawn engine) and differences in performance, consistency, and dynamic capability → a cross-platform page has poor experience on one platform, bridge communication stutters, native capability is missing, how to handle it → how team size, business change frequency, performance requirements, and hiring difficulty affect selection, routing and communication design for hybrid architecture
- Signs of a solid answer: chooses by layer according to page characteristics; understands bridge cost and the consistency cost of a self-drawn engine; has a routing and state-sync scheme for hybrid stacks; has data on the app-size and startup impact of cross-platform

### Permissions, privacy, and compliance
- Ladder: the runtime permission request flow → degraded experience after a permission is denied, privacy compliance requirements (compliance checks, SDK collection behavior), changing system restrictions on background location, clipboard, and photo library → the app is pulled from the store or reported by a regulator over a privacy issue, how to find which SDK is collecting and how to set up SDK admission → balancing user experience and compliance, how to hold to the principle of least privilege under business pressure
- Signs of a solid answer: requests permissions by usage scenario with an explanation; does not initialize collection-type SDKs before the privacy-policy prompt; has experience with SDK behavior detection (hooking or static scanning)

### Architecture and modularization
- Ladder: what MVC/MVP/MVVM/MVI each solve → drawing the boundaries of modularization and componentization, inter-module communication (routing, interface sinking, events), dependency injection → after modularization builds get slow, circular dependencies appear, and a change in a base module triggers a full rebuild, how to handle it → monorepo with multiple modules versus multiple repos, how to land architecture standards in a large team, the cost of over-architecture
- Signs of a solid answer: layers by business domain and base layer; separates interface from implementation; has measured and optimized build speed; has practice enforcing architecture standards (lint, dependency checks)
