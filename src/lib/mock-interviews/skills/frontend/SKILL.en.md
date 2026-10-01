---
name: frontend
description: Framework-agnostic frontend interviewing - browser rendering, JS/TS mechanics, builds, HTTP caching, web security.
keywords: [frontend, web frontend, frontend development, web developer, javascript, typescript, browser, vite, webpack, http, performance optimization, large-scale frontend, h5, full-stack, fullstack, bff, next.js, ssr, graphql]
layer: domain
---

## What interviewers care about

A frontend engineer (also called web frontend, "big frontend", H5 developer, Frontend Engineer) turns design mockups and APIs into pages and applications that users can use, teams can maintain, and metrics can measure. The day-to-day work: setting up project scaffolding and build pipelines, writing business components and state logic, integrating APIs with error handling and auth, watching performance and production errors, and supporting a range of browsers and WebViews. In real interviews the framework-agnostic part is more than half: how the browser turns code into pixels, how JS async and scope actually work, why the bundle is large, why the first screen is slow, why a request fails cross-origin, where XSS gets in. Interviewers care about three things. First, can the candidate reason backward from a user-visible symptom (white screen, jank, flicker, growing memory) to the underlying mechanism. Second, do they have a habit of quantifying: a performance optimization must come with the measurement method and before/after numbers. Third, engineering judgment: why this build tool, why this chunking strategy, how this convention was rolled out across the team.

Campus hiring leans toward language and browser fundamentals: event loop, prototype chain, closures, the TS type system, HTTP caching, CORS, hand-writing Promise/debounce. Experienced hiring leans toward engineering and production issues: bundle size governance, first-screen metric optimization, monitoring systems, micro-frontend vs Monorepo trade-offs, web security incident postmortems. Top-tier and foreign companies increasingly hand the candidate a concrete page or production symptom to debug on the spot; pure "explain the prototype chain" questions are declining, but they still exist as a screening bar.

How to ask like an interviewer in this field:
- Open frontend questions from a user-visible symptom: white screen, jank, flicker, memory growth, stale page after a release. Ask how they would locate it first, then why it happens; never ask for term definitions.
- Performance and bundle-size questions must demand the measurement method and before/after numbers; "it felt faster" is not an answer. The next follow-up is always "how did you prove it".
- Tie engineering questions to the scale of the candidate's project: for a personal project, ask about bundle analysis and caching strategy; for a team project, ask about build speedups, rolling out conventions, and dependency governance across many contributors.
- Do not test tool trivia: do not ask "what changed in the latest Vite"; test build principles and selection judgment. Framework-specific topics (Hooks, reactivity) belong to the stack packs; here only the framework-agnostic browser and language mechanics are tested.
- For full-stack roles, use a cross-layer failure scenario to force the candidate to pick a side and go deep: first ask "do you check the frontend or the backend first, and why", then follow the side they pick down to the troubleshooting level. Backend-side depth uses the backend pack; here cover only BFF, rendering strategy, and contracts.
- The 2026 watershed at the framework layer is server components and compilers: React 19 Server Components, Actions, and React Compiler; Vue 3.5's reactivity rewrite and Vapor mode. These live in the react / vue detail packs; here only framework-agnostic browser and language mechanics are tested, but press the candidate on "what should be server-rendered and what should stay on the client".

## Probing projects and internships

Where to start and what to press on when the resume contains the following kinds of experience. Keep going until the candidate can describe the mechanism, where the numbers came from, and one real failure or trade-off; if they can only name the framework and the conclusion and cannot describe their own part, record it as a red flag. For the general follow-up method see project-deep-dive.

- Resume says "first-screen optimization X%" → press on the before/after metric names (LCP or FCP), the measurement tool and sample, the single biggest change, and whether there was any regression
- Resume says "bundle size reduced X%" → press on what tool was used to analyze it, what the biggest cut was, how chunk granularity was decided, and whether the loading waterfall got worse after release
- Resume mentions a custom scaffold / build configuration → press on why not an existing template, what team pain point it solved, how maintenance cost is controlled, and what went wrong when migrating to Vite or upgrading a major version
- Resume mentions frontend monitoring / tracking → press on which metrics are collected, the sampling rate, how source maps are used to restore stacks, how much overhead the monitoring SDK itself adds, and what production issues it found
- Resume mentions micro-frontends → press on why they were needed (team or technical reasons), how style and global-variable isolation works, how shared dependencies are handled, and what it solves beyond a Monorepo
- Resume mentions a TypeScript migration → press on the incremental strategy, how the share of any was reduced, type-check duration, and the hardest type they wrote
- Resume mentions H5 / WebView / cross-platform → press on how compatibility issues were located, how the JSBridge is designed, and performance data on low-end devices
- Resume mentions a component library / design system → press on how on-demand loading and tree shaking are guaranteed, the theming approach, how far accessibility goes, and how upgrades avoid breaking business code
- Resume mentions BFF / middle layer → press on how many downstream services it aggregates, whether it has timeouts and circuit breaking, which API is slowest, and why the frontend does not call them directly
- Resume mentions Next.js / Nuxt / Remix → press on which pages are SSR and which CSR, what hydration errors they hit, where it is deployed, and who pays for server-side rendering
- Resume mentions GraphQL / monorepo / shared types → press on why they chose it, how N+1 is solved, what is shared, and how the blast radius of a change is controlled

## Common failures and red flags

- Browser rendering pipeline and first screen: can only recite "reflow and repaint" but cannot explain the difference between Layout and Paint; says "SSR makes it fast" but cannot explain SSR's effect on TTFB and server cost; has no experience with any measurement tool
- Event loop and async model: can recite the output order of setTimeout vs Promise puzzles but cannot explain how that affects page jank; does not know microtasks can block rendering; treats "add debounce" as the cure for every jank
- Scope, closures, and this: can only say "a closure is a function returning a function"; cannot distinguish a memory leak from high memory usage; does not know how to diff heap snapshots
- Prototypes, classes, and the module system: cannot state the essential difference between ESM static analysis and CJS dynamic require; does not know the package.json exports field
- TypeScript type system and engineering practice: treats TS as "JS with type annotations" and uses any everywhere; does not know the difference between unknown and any; cannot say what real business problem type gymnastics solved
- Build tools and bundle governance: can only say "configure splitChunks"; does not know browserslist affects polyfills and syntax downleveling; has never looked at a bundle analysis report
- HTTP, caching, and network optimization: cannot explain the Cache-Control directives; thinks "add a timestamp parameter" is cache governance; does not know why HTML must not be strongly cached
- CORS, auth, and web security: believes "escaping on the frontend means no XSS"; when discussing CSRF, cannot explain what SameSite does; stores the JWT in localStorage without knowing the consequences under XSS

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid". Which topics to ask and how many is decided by this JD and this resume; it is not a quota.

### Browser rendering pipeline and first screen
- Ladder: what stages happen from entering a URL to the page becoming visible → DOM/CSSOM construction, render tree, when Layout/Paint/Composite are each triggered and what they cost, why scripts block parsing → a first screen that stays white for 3 seconds: how to use the Performance panel or Lighthouse to attribute the time to network, parsing, script execution, or resource blocking → what delay each of SSR, streaming rendering, skeleton screens, and inlined critical CSS addresses, and what kind of product justifies SSR
- Signs of a solid answer: can distinguish FCP/LCP/TTI/INP and say what affects each; knows the differences between defer/async/preload/prefetch; can read long tasks and main-thread blocking in the Performance panel; has a real judgment about SSR's benefits and costs

### Event loop and async model
- Ladder: execution order of macrotasks and microtasks → Promise and async/await are built on the microtask queue, where requestAnimationFrame and requestIdleCallback sit within a frame → the page freezes for 2 seconds after some action: how to use Performance to tell whether it is a long task, forced synchronous layout, or a flood of microtasks starving rendering → slicing large computations (time slicing, Web Worker, scheduler.yield) and the trade-offs and engineering intrusiveness
- Signs of a solid answer: can draw the order of JS, style calculation, layout, and paint within one frame; knows the 50ms long-task threshold and its relation to INP; has practice moving heavy computation off the main thread; understands the serialization cost of transferring data to a Worker

### Scope, closures, and this
- Ladder: what a closure is, the classic var vs let difference in loops → lexical scope, execution context, the four this binding rules and arrow functions → real scenarios where closures cause memory leaks (unremoved event listeners, timers holding large objects, unbounded module-level caches) and how to find them with the Memory panel → balancing modularity, functional style, and readability; when to use a class
- Signs of a solid answer: uses the three-snapshot heap comparison to find detached DOM; mentions AbortController for centralized unbinding; knows where WeakMap/WeakRef apply; can say that a closure captures variables, not values

### Prototypes, classes, and the module system
- Ladder: the prototype chain lookup process, instanceof and Object.create → class is syntactic sugar but differs in some ways (temporal dead zone, static blocks, private fields) → pitfalls when mixing ESM and CommonJS (default interop, circular dependencies, broken tree shaking) → should a library ship ESM, CJS, or both, and how to design conditional exports
- Signs of a solid answer: can locate problems with bundle analysis tools; knows side-effect flags and that Babel transpiling to CJS breaks tree shaking; understands live-binding behavior of ESM under circular dependencies

### TypeScript type system and engineering practice
- Ladder: interface vs type, basic generics → conditional types, mapped types, infer, covariance and contravariance on function parameters → how to investigate a project's type check growing from 10 seconds to 2 minutes (deep recursive types, huge unions, any contagion) → balancing strictness and iteration speed: how to roll out strict incrementally in a legacy project, when as/any is acceptable
- Signs of a solid answer: can write discriminated unions and type guards; knows what satisfies and as const are for; has investigated type performance with tsc --extendedDiagnostics or a trace; has an incremental strategy for migrating JS to TS

### Build tools and bundle governance
- Ladder: why Vite is fast in development and yet still bundles with Rollup in production → the division of labor between ESBuild/SWC/Rolldown and Babel/Terser on the compile and minify sides, how to decide code-splitting boundaries → how to tame a 3MB bundle: use analysis tools to find the biggest chunks, duplicate dependencies, excessive polyfills, images and fonts, route-based splitting, dynamic imports → in micro-frontend/Monorepo setups, build caching, dependency version unification, and CI build time trade-offs
- Signs of a solid answer: can use rollup-plugin-visualizer or webpack-bundle-analyzer; mentions how chunk granularity changes under HTTP/2; understands modulepreload and chunk-loading waterfalls; knows how to do build caching in CI

### HTTP, caching, and network optimization
- Ladder: strong vs conditional caching, status codes 200/304/206 → what HTTP/2 multiplexing solved and what HTTP/3 solves, CDN cache keys and Vary → how to locate a user report that "the page is still old after the release" (HTML cached by the CDN, Service Worker cache, hash unchanged) → how caching strategy works with release rollback and canary, edge cases of long caching plus content hashing
- Signs of a solid answer: the combination of HTML no-cache plus immutable static assets; keeping old-version assets during a release; mentions SW update strategy and the skipWaiting risk; knows when preconnect/dns-prefetch apply

### CORS, auth, and web security
- Ladder: same-origin policy and CORS simple requests vs preflight → Cookie attributes (SameSite, HttpOnly, Secure), where to store tokens, how CSRF works → XSS found in production: did it come in through rich text, URL parameters, or third-party scripts, and how to locate it and contain it → the benefits of rolling out CSP vs the business refactoring cost, trade-offs between token in localStorage and in a Cookie
- Signs of a solid answer: distinguishes stored/reflected/DOM XSS; mentions CSP, SRI, sandboxed iframes; can explain what changed with the SameSite=Lax default; weighs trade-offs on token storage instead of reciting dogma
