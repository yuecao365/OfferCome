---
name: vue
description: Interviewing on Vue reactivity internals, Composition API, component communication, Router and Pinia, Nuxt. Read when the JD names Vue.
keywords: [vue, vue3, vue2, nuxt, pinia, vuex, vue router, composition api, element plus, ant design vue, uni-app, vite, vue development]
layer: detail
domains: [frontend]
---

## What interviewers care about

The base of Vue frontend roles in China is huge: admin consoles, enterprise applications, H5 campaign pages, and mini-program and uni-app cross-platform projects all lean heavily on Vue, and experienced-hire resumes often mix Vue2 legacy maintenance with Vue3 migration experience. Day-to-day work is organizing business logic with SFCs and the Composition API, managing state with Pinia, doing permissions and routing with Vue Router, building wrappers on top of component libraries like Element Plus, and using Nuxt for SSR when needed. In real interviews, the place where Vue questions best separate candidates is reactivity: many have memorized "Proxy replaces defineProperty", far fewer can explain why destructuring props loses reactivity, why ref needs .value, or why a watch on an object did not fire. Interviewers care about three things above all. First, a real understanding of the reactivity and render-update chain (dependency tracking, scheduling, batched updates, nextTick). Second, the ability to organize with the Composition API (how to split composables, how to share state, how it differs from mixins). Third, hands-on experience in admin-console engineering (permission routes, large-table performance, form and component library wrapping, Vue2-to-Vue3 migration).

For campus hires, focus on reactivity internals, lifecycle, component communication methods, basics like v-if/v-show/key, and small hand-written implementations. For experienced hires, focus on performance attribution (large lists, deeply nested reactivity, frequent watches), Pinia design, route permissions and dynamic routes, Nuxt data fetching and caching, and the pitfalls of migration and component library wrapping. Top companies often hand the candidate a problematic SFC to debug live (lost reactivity, a watch that does not fire, a memory leak), or ask the candidate to describe verbally the component breakdown and state ownership of an admin-console module.

How to ask like an interviewer in this field:
- Start reactivity questions from the two real symptoms of "lost reactivity" and "jank", and have the candidate explain the chain rather than recite the difference between Proxy and defineProperty.
- A large share of Vue roles are admin consoles and enterprise applications, so questions should fit those scenarios: permission routes, large tables, dynamic forms, component library wrapping; press on maintainability and team collaboration, not on showing off.
- For experienced hires, always press on migration and pitfalls: Vue2 to Vue3, Vuex to Pinia, Webpack to Vite; ask about the migration plan and the real difficulties, and flag anyone who says only "it went smoothly" as a red flag.
- Do not test API recency: do not ask "what did Vue 3.5 add"; test the reactivity model, component design, and engineering judgment; generic browser and build questions go to the parent pack frontend.
- In 2026, Vue interviews press on changes after 3.5: memory and performance differences from the rewritten reactivity system, defineModel and props destructuring, and the applicable boundary of Vapor mode (compilation without a virtual DOM). A candidate who can only recite the Vue2 Object.defineProperty versus Vue3 Proxy difference is treated as shallow.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows "Vue2 to Vue3 migration" → probe project size, the migration plan, the hardest category of code (mixins, filters, third-party components), how the business was kept running during migration, what the gain was afterward
- Resume shows Pinia / Vuex → probe how stores were split by domain, whether server data went into the store, how the destructuring reactivity problem was handled, whether persistence and hydration issues came up
- Resume shows "large table / 10,000-row rendering optimization" → probe what tool was used to locate the problem, frame rate or update time before and after, how reactivity depth was handled, defects after virtual scrolling landed
- Resume shows permission routes / dynamic menus → probe how routes are restored after a refresh, how duplicate requests are avoided in guards, how button-level permissions work, where backend validation draws the line
- Resume shows component library wrapping → probe how props/slots/events are passed through, how types are preserved, how component library upgrades avoid breaking the business
- Resume shows Nuxt / SSR → probe how data fetching is written, what hydration mismatches were hit, TTFB and LCP numbers, server memory and caching strategy
- Resume shows a custom composable / hooks library → probe what the most complex one solves, how side effects are cleaned up, how shared state is handled, how it is tested
- Resume shows uni-app / mini-programs → probe how differences across platforms are handled, performance bottlenecks and optimizations on the mini-program side, the scope of conditional compilation

## Common failures and red flags

- Reactivity internals and common loss scenarios: says only "Proxy can observe added properties"; cannot say why ref needs .value; does not know what toRefs solves; thinks all data should be reactive
- Render updates and scheduling: thinks the DOM changes the instant data changes; says nextTick is just "wait a moment"; does not know the Vue3 template compiler marks dynamic nodes
- Composition API and composable design: writes composables as "god functions" that take everything; returns a reactive so callers lose reactivity on destructuring; does not know module-level state is shared across requests in SSR
- Component communication and design: uses an event bus or global store for all cross-level communication; does not know provided values are not reactive by default; manually rewrites props one by one when wrapping a component
- Vue Router and permission routes: puts all permissions on the frontend and thinks it is secure; does not know you must navigate again after addRoute; keep-alive caching leaves data stale and the candidate does not know about activated
- Pinia and state management: piles the store up like a global variable; destructures a store without storeToRefs and then says "Pinia has a bug"; creates a store instance at module top level for SSR
- Performance optimization and large lists: the only optimization known is "use a virtual list"; does not know the component is Vue's update boundary; has never used the DevTools performance recording
- watch, watchEffect and side effect management: uses watch everywhere to sync two copies of state; does not know the watch cleanup function onCleanup; cannot say when flush: 'post' is needed
- Nuxt and server-side rendering: treats SSR as a cure-all for SEO; does not know useFetch reuses the server result on the client; accesses window on the server without a check
- Vue2 migration and ecosystem compatibility: cannot name any specific breaking change; thinks "just change the syntax"; did not consider third-party ecosystem compatibility
- Forms and component library wrapping: runs all validation in full at submit; field linkage is a pile of watches triggering each other; does not know the component library's Form validation trigger timing is configurable
- uni-app / mini-program cross-platform: does not know the mini-program dual-thread architecture; thinks cross-platform costs nothing; has no conditional compilation practice

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Reactivity internals and common loss scenarios
- Ladder: why Vue3 uses Proxy and the essential difference from Vue2's defineProperty → dependency tracking by track/trigger, effect and ReactiveEffect, implementation differences between ref and reactive, what shallowRef/markRaw are for → how to explain and fix the view not updating after destructuring props or a reactive, losing reactivity after replacing a whole reactive object, array index assignment not working in Vue2 → the performance cost of deep reactivity on big data, which data should be markRaw or shallowRef, the trade-off between reactivity and immutable data
- Signs of a solid answer: can describe dependency tracking happening in the getter and triggering in the setter; knows Proxy is a lazy deep proxy; understands computed caching and dirty checking; has practice downgrading large objects to shallow reactivity

### Render updates and scheduling
- Ladder: when the view updates after data changes, what nextTick is → updates are asynchronous and batched, the scheduler queue deduplicates, component-level update granularity and the patch process, compile-time optimizations (PatchFlag, static hoisting, Block Tree) → how to explain reading DOM size right after a data change and getting the old value, how to use DevTools to locate one action triggering updates across the whole page's components → trade-off between template compile optimizations and hand-written JSX/render functions, in which scenarios Vue's compile-time optimizations stop working
- Signs of a solid answer: can draw the chain "reactive trigger → scheduler queue → microtask flush → patch"; knows key in v-for affects the patch strategy; understands Block Tree lets static nodes be skipped; knows that hand-written render functions lose compile optimizations

### Composition API and composable design
- Ladder: differences between setup and the Options API, why the Composition API → input/output conventions of a composable, how lifecycle hooks behave inside a composable, choosing ref versus reactive for return values → how to investigate multiple composables sharing one state that turns into "each component has its own copy" or "still updating after unmount" → composable granularity and reuse boundaries, comparison with the implicit dependency problem of mixins, when to extract a composable and when a Pinia store
- Signs of a solid answer: composables return refs or the result of toRefs; side effects are cleaned up in onUnmounted or onScopeDispose; can state what effectScope is for; has a clear judgment on the split between composables and stores

### Component communication and design
- Ladder: what props/emit, v-model, provide/inject, and slots are each used for → how scoped slots work, how v-model compiles and multiple v-models, attrs passthrough and inheritAttrs → how to locate and standardize a case where a provided value changes deep in a nested tree but the child does not update, or a child modifies an injected value and the data flow becomes confused → the approach to passing props/slots/events through when wrapping a component library, the cost of generic components and TS type inference
- Signs of a solid answer: provide passes a ref or a readonly wrapper; passthrough with $attrs and useSlots; defineModel or the modelValue convention; aware of the difference between defineProps generics and runtime validation

### Vue Router and permission routes
- Ladder: hash versus history mode, dynamic route params → execution order of navigation guards, lazy-loaded routes and chunks, keep-alive and route caching → how to investigate a 404 after dynamically adding routes post-login, dynamic routes lost after refresh, an infinite loop from async permission fetching in beforeEach → the boundary between frontend route permissions and backend API permissions, the cost of button-level permissions, the trade-off of a backend-delivered versus frontend-maintained route table
- Signs of a solid answer: splits routes into static and dynamic and uses a flag in guards to avoid repeated fetching; knows the catch-all 404 route must be added last; understands keep-alive's include and the component name; mentions backend validation as the real security boundary

### Pinia and state management
- Ladder: differences between Pinia and Vuex, why mutations were dropped → setup stores versus option stores, what storeToRefs solves, getter caching → how to investigate losing reactivity after destructuring a store in a component, circular references among stores, a store polluted across requests in SSR → what state belongs in a store and what stays in a component or composable, whether server data belongs in a store, the boundary of persistence and hydration
- Signs of a solid answer: splits stores by domain; separates UI state from server data; knows $subscribe and $patch; aware of hydration timing and security for persistence plugins

### Performance optimization and large lists
- Ladder: v-if versus v-show, computed versus method → component update granularity, v-once/v-memo, async components and defineAsyncComponent, the Vue DevTools performance panel → how to locate scroll jank in a 10,000-row table or jank in linked inputs (reactivity depth, too many watches, components nested too deep, frequent computed), when virtual scrolling applies → the impact of virtual lists on accessibility and search, the boundary between compile-time and runtime optimization, when to split a component and when to merge
- Signs of a solid answer: first uses DevTools or a Performance recording to see the update scope; understands that splitting components shrinks update granularity; knows the cost of deep watching; has experience landing virtual scrolling and its defects

### watch, watchEffect and side effect management
- Ladder: differences between watch and watchEffect, immediate and deep → watch on a reactive is deep by default, watching a getter that returns an object needs deep, flush timing (pre/post/sync) → how to investigate a watch firing twice or not at all, a request inside a watch causing a race, a watch still running after the component unmounts → the trade-off between syncing state with watch and deriving state with computed, centralizing side effects and testability
- Signs of a solid answer: uses computed instead of watch for anything derivable; cancels or marks requests stale with onCleanup; understands the limits of watchEffect's automatic dependency tracking; knows a watch stops automatically on component unmount while a module-level one does not

### Nuxt and server-side rendering
- Ladder: why Nuxt, file-based routing and auto-imports → server execution and hydration of useFetch/useAsyncData, payload serialization, execution differences between server and client → hydration mismatch (time, random numbers, window access), server memory leaks (module-level state shared across requests), how to investigate high TTFB → the basis for choosing among SSR, SSG, ISR, and CSR in Nuxt, Nitro deployment forms and cost, what products do not justify SSR
- Signs of a solid answer: understands the payload and hydration flow; knows useState is SSR-friendly shared state; has concrete hydration mismatch debugging experience; has a judgment on SSR server cost and caching strategy

### Vue2 migration and ecosystem compatibility
- Ladder: what the breaking changes from Vue2 to Vue3 are → reactivity differences, v-model changes, filters removed, lifecycle renames, global API changes, what the compat build (@vue/compat) does → how to handle third-party components not working after migration, conflicting mixins logic, and leftover `this.$set` code, and the strategy of running two versions in parallel during migration → assessing the return on migration, which legacy projects are not worth migrating, the boundary between migration and refactoring
- Signs of a solid answer: upgrades the build and TS first, then turns on compat mode and migrates in batches; has a plan for turning mixins into composables; can list ecosystem migration risks such as Element UI to Element Plus; has a real judgment on migration benefits

### Forms and component library wrapping
- Ladder: controlled forms, form validation, using a component library's Form → schema-driven dynamic forms, async validation, linked fields → how to investigate input jank in a large form, validation triggering several times, validation state corrupted after fields are dynamically added or removed → flexibility versus debugging cost of schema-driven forms, the trade-off between a home-grown form engine and the component library's Form
- Signs of a solid answer: field-level validation and trigger timing; linkage derived with computed; schema separated from rendering; considers the security and debuggability of an expression engine

### uni-app / mini-program cross-platform
- Ladder: how uni-app relates to native mini-program development → differences in compiling to each platform, conditional compilation, runtime performance bottlenecks (setData and logic-layer to render-layer communication) → how to investigate list scroll jank on the mini-program side when H5 is fine, how to degrade when a platform does not support an API → the benefits of a cross-platform framework versus the cost of differing experience per platform, which businesses do not suit cross-platform
- Signs of a solid answer: understands how setData payload size and frequency matter; optimizes per platform and uses conditional compilation; has a clear view of the cross-platform framework's limits
