---
name: test-qa
description: Interviewing on testing and quality covering case design, automation, performance, test platforms, quality metrics, AI testing.
keywords: [test development, test engineer, qa, quality assurance, test automation, api testing, performance testing, load testing, test cases, test platform, quality metrics, pytest, playwright, jmeter, sdet]
layer: domain
---

## What interviewers care about

At top Chinese internet companies (Meituan, ByteDance, Baidu, JD, Pinduoduo and others), the test development role has shifted from "executing test cases" to "using engineering to guarantee quality and efficiency": taking part in requirement and design reviews, designing test plans and cases, building API and UI automation, doing performance and stability testing, developing test platforms and efficiency tools, and running quality metrics and driving improvement. SDET roles at multinationals are closer to development: they must be able to read and review business code and write maintainable test frameworks.

Campus interviews usually cover: test case design (classic scenarios such as login, search, payment, elevator), programming ability (writing Python or Java by hand, SQL, Linux commands), CS fundamentals (HTTP, TCP, databases), understanding of automation frameworks, and a check of the motivation for "why choose testing". Experienced-hire interviews focus on the design of the automation framework and its results in practice, the complete performance testing process and bottleneck localization, the architecture and user count of the test platform, quality metric data and real cases of driving improvement, and understanding of AI-assisted testing and testing AI products.

Interviewers care about three things above all. First, whether the testing mindset is structured: can the candidate break a problem down systematically across functionality, boundaries, exceptions, security, performance, compatibility, and experience, rather than saying whatever comes to mind. Second, whether the engineering ability is real: how many automated cases they wrote, how stable they were, what the maintenance cost was, how many real defects they found. Third, quality awareness and drive: how to trade off when time before release is short, how to run a postmortem after a defect escapes, how to use data to persuade developers and product to improve the process.

How to ask like an interviewer in this field:
- A test case design question must require dividing into dimensions first and then expanding, and press on priority and trade-offs; a candidate who can only list cases lacks structured thinking.
- Automation and platform questions must press on real data (case count, failure rate, user count, defects found); a project with no data is assessed as not landed.
- For campus candidates, focus on testing mindset, programming fundamentals, and motivation, and do not demand platform-building experience; experienced candidates must have real cases of locating performance bottlenecks, postmortems of escaped defects, and driving process improvement.
- Do not test tool names or the latest models on AI topics; test the review mechanism for generated test cases and designing AI products to be testable.
- In 2026, test development JDs commonly added hard requirements: "understanding and practical experience with AI agents", "familiar with MCP and evaluation pipelines". The center of gravity in interviews has moved from "is the function correct" to "is the AI's behavior trustworthy": hallucination, RAG retrieval quality, agent decision chains, and adversarial security must each have a test design. Traditional automation is just the entry bar; the ability to evaluate AI applications is the dividing line.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows "automated testing framework" → probe layered design, case count, failure rate, maintenance cost, number of real defects found.
- Resume shows "performance testing" or "load testing" → probe the scenario model, how the bottleneck was located, the capacity conclusion, differences from production.
- Resume shows a test platform or tool → probe user count, adoption rate, efficiency data, the biggest design mistake.
- Resume shows "quality improved X%" or "defects reduced" → probe how the metric is defined, the baseline, whether other factors contributed.
- Resume shows CI/CD → probe how tests are layered in the pipeline, gate criteria, how environments are isolated.
- Resume shows AI-related testing → probe how assertions are made on non-deterministic output, how the evaluation set was built, human calibration.
- Resume shows functional testing experience → probe the postmortem and process improvement from one defect that escaped to production.
- Resume shows a developer moving into testing → probe the motivation and understanding of what testing is worth, and whether they can read code to find defects.

## Common failures and red flags

- Test case design methods: starts listing "empty input, special characters" with no structure; only positive cases; cannot state the basis for priority.
- Requirement review and shift-left testing: reviews are just "sitting in"; cannot name a single specific question they raised; knows shift-left only as a term.
- API testing and automation frameworks: the framework is just a pile of scripts of requests plus assert; does not know how to classify sources of flakiness; cases share mutable data.
- UI automation and end-to-end testing: locates elements entirely by absolute XPath; uses sleep for every wait; thinks UI automation should cover all functionality.
- Complete performance testing process: only knows how to tune thread counts in JMeter; uses the same user for all load test data; does not know the load generator can become the bottleneck first.
- Stability and chaos engineering: knows chaos engineering only as a term; answers stability with just "run it for 24 hours"; does not know fault injection needs a stop-loss switch.
- Test platforms and efficiency tools: the platform was built to "have a platform" and cannot state a user count; lists many features but none verified as useful; does not know how it integrates with CI.
- Precision testing and code coverage: treats coverage as a quality metric; does not know incremental coverage; knows precision testing only as a term.
- Quality metrics and defect analysis: only recites metric names; does not know differing definitions can distort a metric; answers improvement with just "strengthen testing".
- Defect management and driving collaboration: requires every defect to be fixed before release, or defers entirely to developers; does not know to decide by blast radius and rollback-ability.
- Test environments, data and CI/CD: does not know how environments are isolated; builds test data entirely by hand; does not know how tests are layered in CI.
- Programming and engineering fundamentals: cannot write the hand-coded problems at all; cannot use grep or awk; cannot find boundary problems when reading code.

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Test case design methods
- Ladder: where equivalence classes, boundary values, decision tables, state transitions, and orthogonal arrays each apply → break a feature down across several dimensions (functionality, boundaries, exceptions, security, performance, compatibility, experience) → when there is time to run only a third of the cases, how to choose and how to explain the risk to the team → the trade-off between case count and confidence in coverage, when to replace scripted cases with exploratory testing
- Signs of a solid answer: divides into dimensions before expanding; each dimension has targeted cases; priorities based on risk and user volume; can state the expected result of each case.

### Requirement review and shift-left testing
- Ladder: what testing can do at the requirements stage → how to find ambiguities, missing scenarios, and untestable items in a requirements document → a requirement has a problem after release, tracing it to questions that were not asked at the requirements stage, and how to change the process → the trade-off between shift-left investment and iteration speed, which projects do not justify a heavy process
- Signs of a solid answer: has a checklist for examining requirements (boundaries, exception flows, compatibility, data, rollback); has an example of driving a requirement change; knows the requirements of designing for testability.

### API testing and automation frameworks
- Ladder: what API testing verifies and how it divides work with UI automation → framework layering (cases, business encapsulation, request and assertion, data, configuration, reporting), data-driven testing and parameterization → how to govern unstable (flaky) automated cases, how to speed up slow runs, how to isolate test data → the trade-off between automation coverage and maintenance cost, which scenarios should not be automated
- Signs of a solid answer: has layered design and dependency injection; has failure-cause classification and a retry strategy; has a data factory or mocks; can state the number of real defects the automation found.

### UI automation and end-to-end testing
- Ladder: positioning and choice among Selenium, Playwright, and Appium → element locating strategies, explicit waits, Page Object and layered encapsulation → what to do when UI cases fail en masse after a redesign, differences across browsers or device models, fragile record-and-replay → the return-on-investment boundary of UI automation, what should be pushed down to the API layer
- Signs of a solid answer: has a stable locating strategy and semantic attributes; has layered encapsulation; knows end-to-end covers only core paths; can describe collaborating with developers to add test hooks.

### Complete performance testing process
- Ladder: types of performance testing (load, stress, stability, capacity) and their purposes → load test plan design (scenarios, model, data, environment, monitoring), the relationship among TPS, response time, and error rate → how to locate the bottleneck when results miss the target (application, database, middleware, network, the load generator itself) → differences between the load test environment and production, cost and risk of full-chain load testing
- Signs of a solid answer: has a scenario model based on production traffic; links resource metrics to application metrics; knows database connection pools, thread pools, and GC are common bottlenecks; can give a capacity conclusion.

### Stability and chaos engineering
- Ladder: how stability testing differs from performance testing → how long-running tests find memory leaks, connection leaks, and handle exhaustion → how to design fault injection (dependency timeouts, node crashes, network partitions) and verify degradation and alerting work → blast radius control in chaos experiments, whether to run them in production or pre-production
- Signs of a solid answer: has a fault scenario list with priorities; has observation metrics and stop-loss conditions; can define degradation expectations together with developers.

### Test platforms and efficiency tools
- Ladder: why build a test platform and which pain points it solves → module design for case management, execution scheduling, environment management, reporting and metrics → what to do when nobody uses the platform, execution resources run short, or CI integration goes poorly → the trade-off between building and using open source, how to prioritize platform features
- Signs of a solid answer: starts from pain points; has adoption rate and efficiency data; has iteration trade-offs; can explain the reasons for technology choices.

### Precision testing and code coverage
- Ladder: what code coverage can and cannot tell you → how line and branch coverage are collected, incremental coverage → how recommending affected cases from code changes works, how to explain high coverage with escaped defects → what coverage target is reasonable, the cost and benefit of building precision testing
- Signs of a solid answer: can say coverage is a flashlight for finding blind spots; has an approach to change impact analysis; can design a cross analysis of coverage and defect distribution.

### Quality metrics and defect analysis
- Ladder: common quality metrics (defect density, escape rate, defects per thousand lines of code, regression pass rate, automation coverage, production incident count) → how metrics are defined and collected and the risk of gaming → using data to locate weak spots in quality, root-cause classification of defects (requirements, design, coding, testing, environment) → how metrics relate to team behavior, which metrics cause side effects
- Signs of a solid answer: has root-cause classification and trend analysis; can spot a metric's side effects (for example, pressuring developers to under-report defects); has an example of a closed improvement loop.

### Defect management and driving collaboration
- Ladder: what a defect report should contain → the difference between defect priority and severity, how to handle disputes with developers → how to decide when a serious defect is found before release and time is short, who makes the call → the boundary of responsibility between testing and development, whose responsibility quality is
- Signs of a solid answer: has risk assessment dimensions (number of users affected, whether it can be worked around, whether it can be rolled back, fix risk); is aware of escalating upward; has a feature flag or canary plan.

### Test environments, data and CI/CD
- Ladder: types of test environments and how they are isolated → constructing, masking, and cleaning up test data, common causes of unstable environments → environment conflicts when testing multiple branches in parallel, containerized environments, traffic replay → the trade-off between environment cost and stability, how tests are layered and gated in the pipeline
- Signs of a solid answer: has an isolation scheme based on containers or traffic tagging; has a data factory and snapshot restore; has a split between gating and non-gating tests.

### Programming and engineering fundamentals
- Ladder: hand-coding common problems (strings, arrays, simple algorithms) and SQL queries → Python or Java language features (decorators, generators, exception handling, concurrency) → reading a piece of business code to find potential defects, Linux log analysis commands → maintainability standards for test code and how they differ from application code
- Signs of a solid answer: clean code with boundary handling; can read code and spot null values, concurrency issues, and missed states; fluent with Linux text processing.
