---
name: react
description: React interviews covering reconciliation and Hooks, state and data fetching, re-renders, Next.js. Read when the JD names React.
keywords: [react, react.js, next.js, nextjs, hooks, redux, zustand, react query, tanstack, rsc, server components, jsx, react development, frontend react]
layer: detail
domains: [frontend]
---

## What interviewers care about

Day to day, a React-track frontend engineer uses components and Hooks to structure business UI, manages server data and local state, controls re-renders, handles first paint and SEO on Next.js or a home-grown SSR setup, and writes tests to make refactoring safe. In real interviews the dividing line on React questions is very clear: someone who has memorized the docs can recite the dependency-array rules for useEffect but cannot say why their own page flashes twice, why a list drops frames as soon as it scrolls, or why useState cannot be used in a Server Component. Interviewers care about three things above all. First, real understanding of React's rendering model (what triggers a render, the difference between render and commit, why state is a snapshot). Second, whether the candidate has investigated real performance and state problems (re-render attribution, race conditions, cache invalidation). Third, judgment in choosing within the React ecosystem (data-fetching libraries, state libraries, Next.js App Router versus Pages Router, the boundaries of RSC).

For campus hires, focus on the rules of Hooks, the virtual DOM and diffing, controlled components, hand-writing common Hooks, and closure traps. For experienced hires, focus on practical use of Concurrent features, the architectural impact of RSC and Server Actions, state layering in large applications, performance-attribution tooling, testing strategy and migration experience. Top companies and foreign firms now often hand the candidate a piece of buggy component code to find bugs and optimizations in on the spot, or give a page requirement and ask the candidate to describe the component breakdown and data flow aloud.

How to ask like an interviewer in this field:
- Ask about the symptom before the principle: start from real bugs such as "the page flashes twice", "input contents are misaligned", or "stale state"; someone who can recite the docs but has never written it will be exposed here.
- For every optimization technique, press on "how did you measure it, what were the numbers, and when should it not be used", especially memo-type optimizations, and ask "have you ever rolled back because of over-optimization".
- Pose Next.js and RSC questions according to the routing mode and deployment the candidate actually used; do not press RSC details on someone who has not used App Router, but do test general understanding of SSR and hydration.
- Do not test API recency: do not ask memory questions like "which Hooks did React 19 add"; test the rendering model, state design and engineering judgment; general browser and build questions go to the parent pack frontend.
- The 2026 dividing line in React interviews is React 19: Server Components and Actions (useActionState, useOptimistic, use), ref as a prop, and automatic memoization by the React Compiler. Interviewers will press on "which components belong on the server, how Actions take over pending and error states, and which hand-written memos the compiler let you delete"; someone who can only talk about useEffect dependency arrays is out of date.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows "performance optimization / fewer re-renders" → probe which tool they measured with, the render counts or INP numbers before and after, the biggest single root cause, and whether they over-memoized and later rolled back
- Resume shows Redux / Zustand / MobX / Jotai → probe why they chose it over Context or another library, how subscription granularity is controlled, whether server data was also stuffed into it, and whether they migrated
- Resume shows TanStack Query / SWR → probe how cache keys are designed, the invalidation strategy, whether optimistic updates have rollback, and the cache structure for pagination and infinite scroll
- Resume shows Next.js → probe Pages or App Router, where the Server Component boundary is drawn, what pitfalls they hit in the caching layers, the TTFB and LCP numbers, and where it is deployed
- Resume shows a custom Hooks library → probe what problem the most complex Hook solves, how it is tested, how the dependency array is handled, and whether it created implicit coupling
- Resume shows a component library / design system → probe API design principles, support for controlled and uncontrolled use, accessibility, on-demand loading, and how breaking upgrades are managed
- Resume shows migrating Class components to Hooks / a major version upgrade → probe the migration strategy, the hardest lifecycle mapping, and what problems StrictMode's double invocation exposed
- Resume shows test coverage → probe what layer is tested, the flaky rate, the mock strategy, and whether the coverage number means anything

## Common failures and red flags

- Rendering model and reconciliation: believes "the virtual DOM is faster than manipulating the DOM directly"; says key is only there to silence a warning; does not know that rendering is not the same as a DOM update
- Hooks mental model and closure traps: treats useEffect as a one-to-one match for lifecycle methods; adds and removes dependency-array entries at random following lint hints; cannot say what useMemo and useCallback actually cache
- State layering and data flow design: puts all state in Redux; does not know that a new object as Context value triggers every consumer to render; cannot tell server state from client state
- Server data fetching and caching: cannot say how a race condition arises; writes cache keys as unstable objects; does no rollback on optimistic updates
- Performance optimization and re-render attribution: wraps every component in memo; cannot use the Profiler; treats useMemo as a performance cure-all; does not know React Compiler exists or its prerequisites
- Concurrent features and Suspense: treats useTransition as debouncing; does not know Suspense's limits for client-side data fetching; has never used it in a project and cannot say why
- Next.js and server-side rendering: believes SSR is a cure-all for SEO; cannot tell Server Components from SSR; does not know components below a "use client" boundary are still SSR-ed; treats a Server Action like an ordinary API without considering security and idempotency
- Component design and reuse patterns: piles every option into boolean props; does not know children can also be used as a function; a component secretly fetches data internally and so cannot be tested
- Forms and complex interactions: keeps the whole form value in one useState object and revalidates everything each time; does not know the point of uncontrolled inputs
- Testing strategy: only snapshot tests; tests implementation details (state values, internal methods); cannot handle async and timers
- Error handling and robustness: puts a single error boundary at the root; does not know error boundaries do not catch event-handler and async errors; does not know how to decode production error codes

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for how deep a solid answer goes; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Rendering model and reconciliation
- Ladder: what triggers a component to re-render, and does a parent rendering always render its children → Fiber's interruptible rendering, the difference between the render and commit phases, the three heuristic rules of diffing and the role of key → how to explain input contents misaligning when a list uses index as key, how to attribute a component that "obviously has unchanged props" yet keeps re-rendering → the cost and readability impact of lifting components, passing children, and splitting subscription granularity
- Signs of a solid answer: can say render is pure computation and only commit changes the DOM; understands that a key change unmounts and rebuilds; knows React.memo does only a shallow comparison and that passing a new object or function in props defeats it

### Hooks mental model and closure traps
- Ladder: why Hooks cannot be written inside conditionals → Hooks live on the Fiber linked list by call order, state is a snapshot of each render, the timing of useEffect versus useLayoutEffect → how to analyze reading "stale state" in a timer or event callback (the closure captured that render's value), what symptoms appear when a useEffect dependency array omits something → the trade-offs among useRef holding the latest value, functional updates, and useEvent-style patterns; when to extract a custom Hook and when that creates implicit coupling
- Signs of a solid answer: can draw the model of "each render is an independent function call"; knows the purpose of effects being double-invoked under StrictMode; understands the cost of useLayoutEffect blocking paint; custom Hooks have clear inputs and outputs rather than implicit sharing

### State layering and data flow design
- Ladder: which component should own a piece of state, and when to lift it → the re-render scope of Context and how to split it, the subscription granularity of external stores (Zustand/Redux Toolkit/Jotai) → how to locate a large form page that re-renders entirely on every keystroke (Context value changes, a single giant state, unsplit subscriptions) → principles for dividing global state, URL state, server cache and component-local state, and the maintenance cost of over-globalizing versus prop drilling
- Signs of a solid answer: distinguishes server state from client state; knows selector-style subscription; can say what tearing problem useSyncExternalStore solves; has practice using the URL as a state source

### Server data fetching and caching
- Ladder: why not fetch directly inside useEffect → the stale-while-revalidate model of TanStack Query/SWR, cache key design, invalidation and refetching → how to explain and fix seeing the previous tab's data after switching tabs quickly (a race condition), how to do optimistic update rollback → cache time, prefetching, the cache structure for pagination/infinite scroll, and how the work is split with RSC data fetching
- Signs of a solid answer: AbortController or an ignore flag; understands how queryKey corresponds to dependencies; knows the difference between staleTime and gcTime; can say to precisely invalidate the related queries after a mutation

### Performance optimization and re-render attribution
- Ladder: what React.memo/useMemo/useCallback each do → why overusing memo can make things slower, how to read the React DevTools Profiler flame graph and commit list, where React Compiler's automatic memo ends → how to investigate a ten-thousand-row table that drops frames on scroll: too many renders, heavy single renders, or too many DOM nodes, and when a virtualized list applies → trade-offs of giving up readability for memo, accessibility and search for virtual lists, and complexity for Concurrent features
- Signs of a solid answer: measures before optimizing; can distinguish render cost from commit cost; has practice with virtualized lists and knows their downsides (variable heights, scroll anchoring); knows useTransition/useDeferredValue address priority, not the amount of computation

### Concurrent features and Suspense
- Ladder: how useTransition differs from setTimeout → interruptibility and priority in concurrent rendering, Suspense boundaries and fallbacks, working with error boundaries → how to analyze input still lagging after using useDeferredValue (the computation itself is too heavy, there is no interruptible point) → the current state and limits of Suspense for data fetching, the relationship between streaming SSR and Suspense, and when it is worth introducing
- Signs of a solid answer: understands that "interruptible" requires rendering to be cut into multiple units; knows updates inside startTransition can be interrupted and merged; can say that in streaming SSR the Suspense boundaries determine how the HTML is chunked

### Next.js and server-side rendering
- Ladder: what CSR/SSR/SSG/ISR each solve, and what hydration is → the App Router's Server Component versus Client Component boundary, Server Actions, route segment cache and fetch cache → how to investigate a hydration mismatch error (time, random numbers, localStorage, browser extensions), how to attribute high page TTFB (serial data fetching, no caching, cold starts) → the architectural benefit and mental burden of RSC, the risk of migrating from Pages Router to App Router, differences between Vercel and self-hosting
- Signs of a solid answer: can state the benefit of RSC shipping no JS and the props serialization limits; knows Next.js's multiple cache layers and how they are invalidated; has SSR performance attribution experience; is aware of authentication and CSRF for Server Actions

### Component design and reuse patterns
- Ladder: the difference between controlled and uncontrolled components → compound components, render props, extracting logic into Hooks, forwardRef and imperative handles → how to refactor an "everything component" that already has 40 props, how a component library stays customizable without spinning out of control → component API stability, headless components versus style-bound ones
- Signs of a solid answer: compound components plus Context for shared state; separates presentational from container responsibilities; mentions the approach of headless libraries (Radix, React Aria); has practice with ref forwarding and focus management

### Forms and complex interactions
- Ladder: why a controlled input calls setState every time → why react-hook-form uses uncontrolled inputs to reduce renders, validation timing and error display → how to locate input lag in a form with dozens of fields, how to handle races in linked fields and async validation → choosing a form library, consistency between schema validation (zod) and backend validation, combining Server Actions with forms
- Signs of a solid answer: field-level subscription; validation schema shared between frontend and backend; async validation with debounce and cancellation; submit state and error recovery are designed

### Testing strategy
- Ladder: what a unit test should cover, and the problems with snapshot tests → React Testing Library's philosophy of testing by user behavior, mocking the network (MSW), async assertions → how to investigate tests that fail randomly on CI (missing await, timers, shared state, act warnings) → how much to invest in unit tests, component tests and E2E each, and the value and cost of unit-testing Hooks
- Signs of a solid answer: correct use of findBy/waitFor; intercepts with MSW rather than mocking fetch; has concrete root-cause experience with flaky tests; has their own judgment on the ratios in the test pyramid

### Error handling and robustness
- Ladder: what an error boundary can and cannot catch → handling errors in event callbacks and async code, global fallback and reporting → how to investigate a page that occasionally goes fully blank without monitoring capturing a stack (minified stacks, swallowed errors, error boundaries that are too coarse) → designing error-boundary granularity and fallback UI, retry and refresh strategies
- Signs of a solid answer: regional error boundaries with local fallbacks; restores stacks with source maps and error codes; understands how Suspense and error boundaries work together
