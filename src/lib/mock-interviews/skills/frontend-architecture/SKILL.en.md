---
name: frontend-architecture
description: Frontend architecture deep dive - state and data flow, server components, BFF, contracts, micro-frontends, design systems, testing.
keywords: [frontend architecture, state management, data flow, server components, rsc, data fetching, bff, contract, openapi, type sharing, monorepo, micro-frontend, design system, component library, frontend testing, accessibility, a11y, internationalization]
layer: detail
domains: [frontend]
---

## What interviewers care about

This pack is the deep dive for frontend candidates moving toward engineering and architecture: how a frontend system maintained by many people and reused across platforms should be organized. The interviewer looks at whether trade-offs map to team size: whether a BFF should exist, which layer state lives in, how types are shared, micro-frontend or monorepo, how a component library upgrades without breaking business code. The new 2026 follow-up: once server components move data fetching to the server, what is left for client-side state management, and who owns caching and invalidation.

## Probing projects and internships

Where to start and what to press on when the resume contains the following kinds of experience. Keep going until the candidate can describe the mechanism, where the numbers came from, and one real failure or trade-off; if they can only name the framework and the conclusion and cannot describe their own part, record it as a red flag. For the general follow-up method see project-deep-dive.

- Resume mentions a state management approach → press on why they chose it, how server state and UI state are separated, whether the URL is a source of state, and what state inconsistencies occurred
- Resume mentions Server Components / Actions → press on which components are on the server, how data fetching and caching are done, and what client state remains
- Resume mentions BFF → press on how many downstream services it aggregates, timeouts and circuit breaking, the slowest API, and why the frontend does not call them directly
- Resume mentions monorepo / shared types / micro-frontends → press on what is shared, how the blast radius of a change is controlled, build time, how isolation is done, and what it solves beyond the alternative
- Resume mentions a component library / design system → press on on-demand loading, theming, accessibility, and how upgrades avoid breaking changes
- Resume mentions frontend testing → press on which layers are tested, coverage numbers, how flaky tests are handled, and one issue that testing caught

## Common failures and red flags

- State management and data flow: throws all state into a global store; cannot tell server state from UI state; does not realize the URL is also a source of state
- Server components and data fetching: thinks RSC is just SSR; does not know server components cannot use hooks; cannot say who owns caching and invalidation
- BFF and data aggregation layer: treats the BFF as a catch-all layer for business logic; awaits multiple downstream calls serially without realizing it
- Frontend-backend contracts and type sharing: API agreed only verbally; exposes backend entities directly to the frontend; a monorepo is just "putting things in one repo"
- Micro-frontends and monorepo: adopts micro-frontends for "independent deployment" without any team boundary; does no style or global-variable isolation
- Design systems and component libraries: on-demand loading works by luck; theming by overriding styles; upgrades break business code
- Testing strategy: only unit tests or only E2E; handles flaky tests by rerunning; does not know which layer to test
- Accessibility and internationalization: thinks accessibility means "add alt to images"; uses div as a button; does not know the Intl API

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid". Which topics to ask and how many is decided by this JD and this resume; it is not a quota.

### State management and data flow (framework-agnostic)
- Ladder: why extract state out of components → one-way data flow, immutable updates, the relationship between derived state and caching → the same data is inconsistent in several places on a page (list vs detail, cache vs server): how to locate it and design around it (separate server state from client state) → what global store, URL state, and a server-cache library each own, and the cost of over-globalizing
- Signs of a solid answer: distinguishes server state / client state / URL state; mentions request deduplication, cache invalidation, optimistic updates; can explain selective subscription to avoid unrelated re-renders

### Accessibility and internationalization
- Ladder: the role of semantic tags, alt, and label → ARIA roles and states, keyboard operability, focus management → a custom dropdown/modal is unusable in a screen reader: how to fix it, how to build a focus trap → the trade-off between accessibility investment and compliance requirements (overseas, government and enterprise projects); i18n pitfalls with text length, RTL, and date/number formats
- Signs of a solid answer: focus management, Esc to close, aria-modal, inert background; mentions prefers-reduced-motion; uses ICU message format for i18n instead of string concatenation

### BFF and data aggregation layer
- Ladder: what a BFF is and how it differs from a gateway → which of aggregation, trimming, caching, and auth belong in the BFF and which do not → the BFF becomes a "fat middle layer", logic is duplicated, one page change touches three layers: how to govern it → one BFF for multiple platforms (Web/mini-program/App) or one per platform, where to draw the team boundary
- Signs of a solid answer: parallel requests with timeouts and circuit breaking; a reasoned boundary for splitting the BFF per platform; uses traces to see serial vs parallel calls; has a notion of monitoring Node event-loop lag

### Frontend-backend contracts and type sharing
- Ladder: who writes the API docs and when they are settled → OpenAPI/TypeScript type sharing, how mocks and contract tests let both sides work in parallel; what GraphQL's N+1 and over-fetching solved and what it brought → after release the frontend finds the field semantics differ from the docs: how to prevent it from recurring; when one change to a shared package rebuilds the whole site, version hell, circular dependencies: how to handle them → the cost of contract-first vs flexibility, weighed by team size; what should be shared and what must never be shared
- Signs of a solid answer: a schema (zod/OpenAPI) as the single source of truth that generates types; versioning, defaults, and field deprecation policy; a clear judgment on when GraphQL applies; fields optional during the compatibility window

### Server components and data fetching
- Ladder: what server components solve (data fetching close to the data, less JS shipped) and what they cost → how to draw the boundary between server and client components, where hooks and interactivity go → how to manage data-fetching caching, invalidation, and the pending and error states of Actions → what kind of application justifies them, migration cost, and the trade-off against pure CSR
- Signs of a solid answer: can state the basis for the server/client component boundary; knows who owns caching and invalidation; has a judgment from migration or comparison experience

### Micro-frontends and monorepo
- Ladder: what problems call for micro-frontends (team boundaries, independent releases) and what problems a monorepo alone covers → how style and global-variable isolation, shared dependencies, routing, and communication are each handled → how to control the blast radius of a change, how to tame build time (caching, affected detection), how to find circular dependencies → long-term maintenance cost of the two approaches
- Signs of a solid answer: has an approach judgment matched to team size; concrete means for isolation and sharing; numbers on build time or blast radius

### Design systems and component libraries
- Ladder: what a component library solves and when not to build one yourself → how to guarantee on-demand loading and tree shaking, theming approach, token system → how upgrades avoid breaking business code (compatibility window, codemods, changelog) → how far accessibility goes; the boundary between the component library and business code
- Signs of a solid answer: has a way to verify on-demand loading; upgrades have a compatibility strategy; knows the maintenance cost of a component library

### Testing strategy
- Ladder: what unit, component, and E2E tests each cover and how to set the ratio → what to test and what not to: logic, interaction, visual regression → causes of flaky tests (timing, network, environment) and how to handle them → test duration and payoff in CI; one issue caught by tests
- Signs of a solid answer: has layers and ratios; has ways to handle flaky tests; can name a concrete issue that tests caught
