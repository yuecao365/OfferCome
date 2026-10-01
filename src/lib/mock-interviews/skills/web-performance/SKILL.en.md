---
name: web-performance
description: Frontend performance deep dive covering metrics, rendering strategy, loading and caching, long tasks and INP, visual stability, WebView.
keywords: [frontend performance, web performance, lcp, inp, cls, core web vitals, first screen load, ssr, csr, ssg, hydration, resource loading, code splitting, long tasks, webview, monitoring, rum, lighthouse]
layer: detail
domains: [frontend]
---

## What interviewers care about

Performance is the part of a frontend interview where it is easiest to tell real experience from fake: when a candidate says "I optimized the first screen", the interviewer presses on the metric name, the measurement tool, the sample, the before-and-after numbers, and the single biggest change. The 2026 metric set is LCP, INP, and CLS; since INP replaced FID, "long tasks and interaction latency" has become a new line of follow-up. On rendering strategy, server components and streaming rendering turn "SSR or CSR" into a per-page, per-component decision. This pack breaks these into ladders that can be probed step by step.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows "first screen optimized by X%" → probe the metric name (LCP or FCP), the measurement tool and sample, the single biggest change, whether there was a regression
- Resume shows "bundle size reduced by X%" → probe the analysis tool, the biggest thing cut, the split granularity, whether the loading waterfall got worse after release
- Resume shows SSR / Next.js / Nuxt → probe which pages are SSR and which CSR, what hydration errors were hit, TTFB and server cost
- Resume shows frontend monitoring → probe which metrics are collected, the sampling rate, source map restoration, SDK overhead, what problems it found
- Resume shows jank / interaction latency optimization → probe where the long tasks came from, how they were split, INP numbers before and after
- Resume shows H5 / WebView → probe how compatibility problems were located, low-end device data, the offline package mechanism

## Common failures and red flags

- Performance metrics and production monitoring: knows only Lighthouse scores; does not know what INP replaced; reporting has neither sampling nor batching
- Rendering strategy: thinks SSR is always faster; does not know how hydration errors arise; uses one mode for every page
- Resource loading and caching: thinks "add a timestamp parameter" is cache governance; does not know why HTML must not be strongly cached; knows only splitChunks for code splitting
- Long tasks and interaction latency: treats "add a debounce" as the cure for all jank; does not know microtasks can block rendering
- CSS and visual stability: cannot say why transform animations are cheap; adds will-change everywhere; does not know where CLS comes from
- Images and fonts: images have no dimensions set; font swapping causes flicker and the candidate does not know font-display
- Cross-platform and WebView: attributes every problem to "compatibility" without locating it; does not know how JSBridge communicates
- Performance budgets and regression: has no performance budget; optimizes once and forgets it

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Performance measurement and production monitoring
- Ladder: what each Core Web Vitals metric means → how lab data differs from real user data (RUM), how PerformanceObserver and the web-vitals library collect it → production LCP P75 suddenly rises from 2.1s to 3.5s; how to drill down by version, region, device model, and page to attribute it → sampling rate, reporting timing (sendBeacon, visibilitychange), the performance overhead of the monitoring SDK itself
- Signs of a solid answer: distinguishes lab from field data; knows INP replaced FID; mentions source map upload and access control; has experience drilling down by dimension

### CSS layout and visual stability
- Ladder: where Flex and Grid each apply, BFC → stacking contexts, the conditions and cost of compositing layers and GPU acceleration → a page with high CLS: images without placeholders, font swapping, dynamically inserted banners; how to locate and fix it → choosing a CSS approach (atomic CSS, CSS Modules, the runtime cost of CSS-in-JS) and the trade-offs at team scale
- Signs of a solid answer: can locate issues with the Layout Shift panel; mentions container queries and logical properties; knows the runtime overhead and SSR compatibility of CSS-in-JS

### Cross-platform and WebView compatibility
- Ladder: mobile adaptation units and viewport, the 1px problem → differences between WebView and a browser (engine version, caching, JSBridge) → how to investigate a page that shows a blank screen on low-end Android phones of one brand but works on other models (syntax downleveling, unsupported APIs, killed for memory) → the basis for choosing among H5, mini-programs, native, and cross-platform frameworks, and their maintenance cost
- Signs of a solid answer: has remote debugging experience (chrome://inspect, vConsole); knows differential bundling (modern/legacy); understands WebView caching and the offline package mechanism

### Rendering strategy: SSR / CSR / SSG / streaming
- Ladder: differences between SSR and CSR and each one's first-screen metrics → what hydration does and why it can mismatch (time, random numbers, user state) → how to investigate high TTFB on an SSR page, server CPU maxed out, cache stampede → choosing a rendering mode by page type, the trade-off among SEO, personalization, and cost
- Signs of a solid answer: distinguishes which of TTFB/FCP/LCP/TTI is affected; the idea of a static shell plus dynamic islands; CDN caching and stale-while-revalidate; knows the concurrency and memory cost of server rendering

### Resource loading and caching strategy
- Ladder: what the first screen must download and in what order → split granularity, preload and prefetch, critical CSS, what HTTP cache headers and filename hashing each solve → users still using old assets after a release, cache stampede on the CDN, third-party scripts slowing the first screen, and how to locate and govern each → the cost of splitting too fine or too coarse; the CDN and edge caching trade-off
- Signs of a solid answer: can read a loading waterfall; knows the combination of not strongly caching HTML and caching assets for a long time; has before-and-after numbers from one code splitting or preload change

### Long tasks and interaction latency
- Ladder: what INP measures and why it replaced FID → where long tasks come from (large JS, synchronous layout, heavy event handling); what happens on the main thread in one frame → how to use the Performance panel to trace a 300ms-stalled interaction to a function → what task-splitting approaches (time slicing, schedulers, Web Workers) each suit; how to guard against regression after optimizing
- Signs of a solid answer: knows how INP is computed; can read the Performance panel; has a case of breaking up a long task

### Images, fonts and media
- Ladder: what image formats, sizing, lazy loading, and responsive images each save → flicker and layout shift from font loading; font-display and subsetting → what to do about poor LCP from a large hero image (preload, priority, CDN processing) → the cost of media assets versus the experience trade-off
- Signs of a solid answer: images have a size and format strategy; knows the three behaviors of font loading; has experience locating the LCP element

### Performance budgets and regression
- Ladder: why have a performance budget and which metrics to set it on → running Lighthouse or a custom script in CI, how to set thresholds → how to explain production RUM diverging from lab data → the process when a budget is broken; negotiating between performance and feature iteration
- Signs of a solid answer: has a performance budget and gating; knows the difference between lab and real user data; has a case where a budget blocked a change
