---
name: android
description: How to interview for Android, covering lifecycle, Compose, coroutines and Flow, performance, startup. Read when the JD names Android.
keywords: [android, kotlin, jetpack, compose, coroutines, flow, viewmodel, hilt, gradle, art, binder, recyclerview, android development]
layer: detail
domains: [mobile]
---

## What interviewers care about

An Android engineer's daily work is writing business screens and the architecture layer in the Kotlin and Jetpack ecosystem: Activity/Fragment or Compose screens, ViewModel and state flows, coroutines for async work, Room/DataStore for storage, Hilt for injection, Gradle multi-module builds, and adapting from Android 8 to the latest version and across vendor ROM differences. In real interviews the dividing line on Android questions is "why did the system design it this way": many people can recite the order of lifecycle callbacks, few can explain why a ViewModel survives a configuration change, why a Fragment's viewLifecycleOwner exists, or why a coroutine scope is tied to a lifecycle. Interviewers care most about three things: first, real understanding of system mechanisms (lifecycle and process, message loop and the main thread, Binder and the four components, ART and memory); second, whether the mental models of the two newer paradigms, coroutines and Compose, are correct (structured concurrency, exception propagation, recomposition and stability); third, the closed loop for diagnosing production problems (the tools and attribution methods for ANR, OOM, jank, startup, and package size).

Campus hiring emphasizes the four components, lifecycle, the Handler mechanism, View drawing and event dispatch, Kotlin language features, basic coroutine usage, and RecyclerView; experienced hiring emphasizes architecture layering and modularization, Compose rollout experience and performance pitfalls, engineering practice around coroutine exceptions and cancellation, quantified governance of startup and package size, attribution of ANR and OOM, Gradle build speedups, and pitfalls of vendor ROM and new-version adaptation. Top-tier companies usually also have a fixed structure of "hand-coded algorithm + system internals + project deep dive", and this pack covers the Android-specific part of the system internals and the project deep dive.

How to ask like an interviewer in this field:
- For every system-mechanism question, press on "why did the system design it this way": lifecycle, Handler, Binder, background restrictions; flag candidates who can recite callbacks but cannot state the design motivation.
- Coroutines and Compose are currently the two areas that best separate depth: start from real bugs like "an exception cancelled the sibling coroutines" or "a component that should not recompose recomposed" and have the candidate explain the model.
- Performance questions must land on tools and numbers: real experience with Perfetto, Layout Inspector, Profiler, and build scan is a hard bar for experienced candidates; press on tools for anyone who only says "move it to a background thread" or "reduce nesting".
- Do not test version currency: do not ask "what APIs did Android 15 add"; test the method for diagnosing behavior changes and the compatibility approach; platform-independent startup, package size, gradual rollout, and cross-platform questions go to the parent pack mobile.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows Compose migration / a Compose project → probe which screens were migrated, why others were not, how recomposition performance problems were located, the boundary of mixing with View, package-size and first-frame cost
- Resume shows a coroutine / Flow architecture → probe the exception-handling strategy, cancellation propagation, how one-shot events are modeled, whether "partial failure cancelled everything" or lost events ever occurred
- Resume shows "startup optimized by X%" → probe the measurement point (first frame or reportFullyDrawn), the Perfetto attribution process, how the startup task framework schedules, risks introduced by lazy initialization
- Resume shows "ANR rate / crash rate reduced" → probe the top root-cause types, what collection was added, differences across vendor devices, which switches and gradual rollouts were used
- Resume shows OOM / memory optimization → probe the Hprof analysis process, the image library's cache policy, whether thread count and FD leaks were checked, the production collection approach
- Resume shows modularization / componentization / build speedup → probe module division, api/implementation governance, build time numbers before and after, the kapt/KSP migration
- Resume shows custom Views / complex animation → probe how scroll conflicts were resolved, how drawing performance was measured, limits of hardware acceleration
- Resume shows a targetSdk upgrade / vendor adaptation → probe the specific list of behavior changes, how gradual-rollout validation was done, the hardest compatibility problem encountered

## Common failures and red flags

- Activity and Fragment lifecycle: only recites callback order and cannot say which objects are destroyed on configuration change; does not know how a ViewModel survives configuration changes; conflates a Fragment's lifecycle with its View's lifecycle
- Handler, Looper and the main-thread model: says Looper.loop is an infinite loop so it must stall; does not know about the sync barrier; for ANR only looks at the last stack
- View drawing, event dispatch and custom Views: can only recite "events go to the Activity first, then the ViewGroup"; does not know requestDisallowInterceptTouchEvent; a custom View does not handle wrap_content
- Jetpack Compose mental model and performance: treats recomposition as "the whole page is redrawn"; does not know the stability inference rules; does expensive computation or creates objects directly inside a Composable; uses Compose but still stores state inside components the View way
- Kotlin coroutines and structured concurrency: thinks wrapping launch in try/catch catches the exception; does not know SupervisorJob; catches all exceptions inside a coroutine including CancellationException; GlobalScope everywhere
- Flow, StateFlow and UI state: cannot tell cold flows from hot flows; calls lifecycleScope.launch { collect } directly in onCreate; thinks StateFlow is simply a LiveData replacement
- Memory, GC and OOM diagnosis: believes the stack at the OOM is the culprit; does not know whether Bitmap memory is on the native or Java heap; only says "use LeakCanary" and cannot read an Hprof
- ANR and jank governance: only looks at the stack at the moment of ANR; does not know ANRs have types; believes all jank is the main thread doing expensive work
- Startup optimization and Application initialization: does not know ContentProviders are initialized before Application.onCreate; startup optimization is only "move initialization to a background thread"; no Perfetto practice
- Storage, Room and the data layer: stores all config in SP and does not know SP's ANR problem; Room migrations have no tests; queries the database on the main thread
- Binder, the four components and system interaction: does not know the Binder transaction size limit; believes a background Service can be started freely; treats keep-alive as a legitimate technique
- Gradle build, obfuscation and release: cannot tell the effect of api versus implementation on rebuild scope; obfuscation rules are "keep everything"; has never looked at a build time report
- Version adaptation and vendor differences: does not know the difference between targetSdk and compileSdk; upgrades targetSdk by changing the number without auditing; for vendor differences only says "adapt it"

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Activity and Fragment lifecycle
- Ladder: the order of Activity lifecycle callbacks, how callbacks of A and B interleave when A starts B → the recreation flow and onSaveInstanceState on configuration change (rotation, language, dark mode), a Fragment's two lifecycles (its own and its View's), launch modes and the task stack → how to locate data lost after rotation or a duplicated screen, multiple callbacks from observing LiveData in a Fragment, and a crash from a large object in the Intent when recreating after the process was killed → the trade-off between ViewModel and savedStateHandle for saving state, the benefits of a single-Activity multi-Fragment architecture versus navigation complexity
- Signs of a solid answer: can say the ViewModelStore is passed via NonConfigurationInstances; distinguishes what ViewModel and savedStateHandle each survive (configuration change vs process death); knows where TransactionTooLargeException comes from; has real scenarios for launchMode and Intent flags

### Handler, Looper and the main-thread model
- Ladder: why a background thread cannot update the UI, basic Handler usage → blocking and waking of the MessageQueue (epoll), sync barriers and async messages, IdleHandler, the relationship between the main-thread Looper and ActivityThread → how to use a trace to find which message took long when the main thread stall causes an ANR, the root cause of Handler memory leaks → the trade-off between Handler delayed tasks and coroutine delay, the benefits and invasiveness of message-scheduling frameworks (for example jumping render messages ahead during startup)
- Signs of a solid answer: understands the loop blocks in nativePollOnce without burning CPU; knows Choreographer uses async messages to keep rendering prioritized; has experience with main-thread message monitoring (printing dispatch time); can name multiple root causes of ANR (busy main thread, lock wait, Binder call, CPU contention)

### View drawing, event dispatch and custom Views
- Ladder: the measure/layout/draw steps and MeasureSpec → how ViewRootImpl and vsync drive the pipeline, hardware acceleration and RenderThread, the dispatch/intercept/onTouch chain for event dispatch → how to locate and resolve nested scroll conflicts (a RecyclerView inside a ViewPager, pull-to-refresh with a list) and why a custom View displays wrongly under wrap_content → the trade-off between a custom View and composing existing widgets, the point where overdraw and hierarchy optimization hit diminishing returns
- Signs of a solid answer: can draw the path of a touch from InputDispatcher to the View; distinguishes the external and internal interception methods and knows the flaws of each; knows the scope difference between what invalidate and requestLayout trigger; has practice with Layout Inspector and overdraw tools

### Jetpack Compose mental model and performance
- Ladder: the fundamental difference between Compose and the View system, what declarative UI is → the trigger conditions and skipping mechanism of recomposition, state hoisting, remember versus rememberSaveable, stability (Stable/Immutable) and lambda capture → how to use Layout Inspector or compiler reports to locate a whole page recomposing repeatedly during list scrolling (unstable parameters, state read too high, a new lambda each time) → migration strategy for mixing Compose and View, the first-frame and package-size cost of Compose, which screens are not suitable to migrate yet
- Signs of a solid answer: distinguishes the composition, layout, and draw phases and knows that deferring state reads to a later phase reduces recomposition; knows the uses of derivedStateOf and key; has practice with compiler stability reports or strong skipping mode; understands LazyColumn's key and contentType

### Kotlin coroutines and structured concurrency
- Ladder: how a coroutine differs from a thread, what a suspend function is → coroutine scopes and the Job tree, exception propagation rules (plain Job vs SupervisorJob, where CoroutineExceptionHandler takes effect), cancellation being cooperative, choosing Dispatchers → how to investigate a child coroutine's exception cancelling every request on the page, a network request still running after the coroutine was cancelled, or a CancellationException caught inside withContext that breaks cancellation → the boundaries of viewModelScope/lifecycleScope, when a global scope is appropriate, the trade-offs when coroutines are mixed with RxJava / thread pools
- Signs of a solid answer: can draw the Job tree and the upward exception propagation path; knows the difference between coroutineScope and supervisorScope; understands cancellation needs a suspension-point check (ensureActive, isActive); has experience converting callback-style APIs to coroutines (suspendCancellableCoroutine) and handling cancellation

### Flow, StateFlow and UI state
- Ladder: how Flow differs from LiveData, cold versus hot flows → the semantics of StateFlow and SharedFlow (replay, stickiness, deduplication), collect and lifecycle (repeatOnLifecycle), operators and backpressure → how to locate events consumed twice or lost when returning from background to foreground, refresh failing because StateFlow does not emit on an equal value, and collect still consuming resources in the background → a single UiState versus splitting into multiple flows, how to model events (one-shot) versus state (replayable) and the pitfalls of each
- Signs of a solid answer: knows what repeatOnLifecycle and flowWithLifecycle are for; understands StateFlow's distinctUntilChanged semantics; has a clear position and reasons on modeling one-shot events; knows what the WhileSubscribed timeout in stateIn means

### Memory, GC and OOM diagnosis
- Ladder: the difference between Java heap, native heap, and virtual memory, common triggers of OOM → ART's GC types and triggers, how Bitmap memory's location has changed, large objects and memory churn, how LeakCanary works (weak reference plus check after GC) → how to attribute a production OOM whose stack is at a Bitmap allocation but whose real cause is accumulated leaks, and which tools to use when native memory grows (for example WebView, image libraries, SO files) → the trade-off between image cache pool size and display quality, the cost of collecting Hprof in production, sampling strategy for memory monitoring
- Signs of a solid answer: can read the dominator tree and GC Root paths in MAT/Profiler; knows thread count and FD count can also cause OOM; has experience trimming and uploading Hprof from production; understands matching inSampleSize to display size

### ANR and jank governance
- Ladder: the trigger conditions and types of ANR (input, broadcast, Service) → ANR collection mechanisms (traces, SIGQUIT), the effect of system load and CPU contention, Choreographer frame callbacks and dropped-frame statistics → how to attribute a high production ANR rate where most traces sit at nativePollOnce or the stacks are all over the place (historical messages, lock contention, Binder blocking, low-end device CPU) → the sampling overhead and precision of jank monitoring, the ROI and business priority of ANR governance
- Signs of a solid answer: distinguishes a busy main thread from a waiting main thread; has monitoring for slow messages, lock waits, and Binder duration; knows ApplicationExitInfo can retrieve the ANR trace; has awareness of vendor ROM differences

### Startup optimization and Application initialization
- Ladder: the cold start flow (zygote fork, Application, Activity first frame) and reportFullyDrawn → class loading and verification, pitfalls of ContentProvider auto-initialization, the App Startup library, main-thread IO and locks → attributing startup time by looking at the main-thread timeline in Perfetto/Systrace, and what to do when an SDK turns out to initialize in a ContentProvider or the home-page layout inflate is too slow → the risk that lazy initialization makes "a feature on the home page slow on first tap", the benefits of Baseline Profile and R8, the maintenance cost of a startup task framework
- Signs of a solid answer: can read Perfetto main-thread slices; has a startup task directed graph and thread scheduling framework; knows how to use Baseline Profile and the splash screen API; startup metrics have production collection and version comparison

### Storage, Room and the data layer
- Ladder: what SharedPreferences/DataStore/Room/files each store, the pitfalls of SP → Room's compile-time validation, migration, integration with Flow, transactions and threads, WAL → how to investigate crashes in Migration after an upgrade, SP apply on the main thread causing an ANR (commitToMemory wait), and database lock conflicts → the trade-off between Room and hand-written SQLite / other ORMs, the performance cost of database encryption, the caching strategy of the Repository layer
- Signs of a solid answer: knows SP's load and apply mechanism; has practice with MigrationTestHelper; understands WAL's effect on concurrent reads and writes; can say what problem DataStore solves over SP

### Binder, the four components and system interaction
- Ladder: what each of the four components is for, explicit versus implicit Intents → Binder's single-copy principle and the 1MB limit, AIDL oneway and the thread pool, Service foreground restrictions, broadcast registration methods and background restrictions → what to do about a crash passing a large object across processes, a background Service being restricted by the system and unable to start, and process keep-alive techniques failing → the benefits of a multi-process architecture versus memory and complexity costs, the choice between WorkManager and a foreground service, the relationship with vendor allowlists
- Signs of a solid answer: can say Binder reduces copying through mmap; knows the foreground service type declaration requirements; understands Doze and app standby buckets; has awareness of duplicated initialization in multi-process and cross-process SP problems

### Gradle build, obfuscation and release
- Ladder: Gradle's configuration phase and execution phase, module dependencies api versus implementation → build cache and incrementality, the difference between KSP and kapt, R8 obfuscation and optimization, build variants and Product Flavor → how to attribute a 15-minute full build (build scan, configuration-phase time, kapt, module granularity), and how to locate reflection crashes or serialization failures after obfuscation → dependency governance and compile isolation in a single repo with many modules, the benefits and limits of AAB and dynamic feature modules, the cost of migrating build scripts to the Kotlin DSL and version catalogs
- Signs of a solid answer: knows the difference between the configuration cache and the build cache; has experience migrating from kapt to KSP; can read the mapping file to restore stacks; has awareness of the optimizations and risks of R8 full mode

### Version adaptation and vendor differences
- Ladder: the meaning of a targetSdk upgrade and store requirements → major behavior changes in recent years (background restrictions, permission splitting, notification permission, implicit Intent restrictions, Privacy Sandbox), vendor ROM custom restrictions → how to investigate and make compatible a feature that breaks on a specific version after a targetSdk upgrade, or a crash or restricted functionality on a particular vendor's devices → the trade-off between new features and compatibility burden, the basis for deciding the minimum supported version
- Signs of a solid answer: has a behavior-change checklist and a gradual-rollout validation process; knows the compatibility framework toggles allow testing ahead of time; has specific cases of vendor differences (background restrictions, notifications, permissions)
