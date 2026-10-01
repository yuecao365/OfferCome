---
name: infra-sre
description: How to interview infrastructure and SRE roles - Linux and network debugging, container orchestration, CI/CD, SLOs, incidents.
keywords: [sre, devops, operations, operations development, infrastructure, platform engineering, cloud native, cloud, aws, linux, docker, ci/cd, terraform, prometheus, slo]
layer: domain
---

## What interviewers care about

The day-to-day of SRE / infrastructure / DevOps roles is making business systems reliable, observable, changeable, and affordable: maintaining the Linux and network foundation, container and orchestration platforms, CI/CD pipelines, and the monitoring and alerting stack; doing capacity planning and cost governance; and being on call for incidents and driving postmortems. In real interviews the most common questions are not how to type a command, but "how would you investigate this symptom", "how would you ship this change safely", and "why did this alert fire falsely". Interviewers care about three things. First, has the candidate independently handled a real incident and can they recount the full timeline (detection, localization, mitigation, root cause, improvement). Second, is the troubleshooting approach systematic (narrowing down layer by layer from the symptom, not guessing from experience). Third, do they have the instinct to eliminate repetitive work with engineering, by writing scripts, building platforms, and defining SLOs, instead of acting as a human ticket machine.

Campus hiring leans toward Linux, networking, OS fundamentals, and hands-on ability: processes and file systems, TCP handshake and teardown and common states, being able to write shell/Python scripts, understanding container isolation. Experienced hiring leans toward engineering judgment and building systems: K8s cluster governance, observability design, SLOs and error budgets, change management process, multi-cloud and cost, and commanding large-scale incidents. In recent years SRE interviews at top Chinese companies commonly include two question types: "analyze this alert and monitoring screenshot on the spot" and "design a release system"; pure command-recitation questions are declining.

How to ask like an interviewer in this field:
- Start every question from a symptom, not a concept: give an alert, a set of metrics, or a user complaint, and ask the candidate for the investigation order and the way to verify each step; press on candidates who give conclusions without verification.
- Always ask about an incident, and require the full timeline: a candidate who has never handled a real incident is marked as lacking experience no matter how well they know the tools; for those with incident experience, press on "if you could redo it, where is the earliest point you could have shortened recovery".
- Set questions to match scale: managing 10 machines and 10,000 are entirely different problems; first establish the scale, then decide whether to ask about single-host tuning or platform governance.
- Do not test memorized command parameters or specific cloud vendor product names; test layered troubleshooting, a mitigate-first mindset, and the ability to turn repetitive work into engineering.
- The new axis for SRE and platform roles in 2026 is AI workloads: GPU cluster scheduling and utilization, SLOs for training and inference services, model-call token latency and cache hit rate as observability metrics, OpenTelemetry as the default collection layer. A candidate with no exposure to GPU workloads is not penalized, but when asked they should be able to reason with the same reliability methods.

## Probing projects and internships

Where to start and what to press on when the resume contains the following kinds of experience. Keep going until the candidate can describe the mechanism, where the numbers came from, and one real failure or trade-off; if they can only name the framework and the conclusion and cannot describe their own part, record it as a red flag. For the general follow-up method see project-deep-dive.

- Resume says "responsible for operating system XX" → press on its scale (node count, QPS, number of services), the most severe incident and its timeline, and what systematic improvements they made
- Resume mentions Kubernetes cluster building → press on the number of clusters and versions, how many upgrades, what scheduling or network problems they hit, and how request/limit is governed
- Resume mentions monitoring stack / Prometheus / Grafana → press on the number of metrics and cardinality, daily alert volume, false positive rate, and how the most useful alert was designed
- Resume mentions a CI/CD platform → press on the number of services, average release duration, how many rollbacks, how canaries are judged, and whether there was ever a release incident
- Resume mentions SLOs / availability of 99.9x% → press on the numerator and denominator definitions, how they are collected, and whether a release was ever refused because the budget was exhausted
- Resume says "cut cost by X ten-thousand / X%" → press on how waste was found, which resources were touched, whether it caused reliability problems, and how business owners cooperated
- Resume mentions Terraform / Ansible → press on coverage, state management, how drift is handled, and whether there was ever an accidental deletion
- Resume mentions "on-call" → press on on-call frequency, the longest incident, and whether they drove alert governance or runbooks

## Common failures and red flags

- Linux troubleshooting: only knows top; does not know D-state processes; treats buffer/cache as a memory leak; does not know the OOM killer's selection logic
- Network and TCP/HTTP troubleshooting: cannot say that a large pile-up of CLOSE_WAIT means the application did not close connections; treats TIME_WAIT as a fault and only knows to tune tw_reuse; cannot use tcpdump/ss
- Container internals and image governance: thinks Docker is a lightweight virtual machine; does not know the cgroup v1/v2 differences; uses the latest tag with no scanning
- CI/CD and release systems: releases are hand-run scripts; does not know how artifacts are bound to source versions; has never rehearsed a rollback
- Monitoring metrics and alert design: alerts whenever CPU exceeds 80%; does not know label cardinality can blow up Prometheus; alerts have no runbook
- SLOs, error budgets, and reliability engineering: the SLO is just "99.9%" with no numerator or denominator; treats infrastructure metrics as SLIs; the SLO lives only in a document and drives no decision
- Incident response and postmortems: cannot give a timeline; "a restart fixed it" with no root cause; the postmortem lists only human mistakes and no system improvements
- Change management and safe production: one process for all changes; config changes do not count as changes; no view correlating changes with alerts

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid". Which topics to ask and how many is decided by this JD and this resume; it is not a quota.

### Linux troubleshooting
- Ladder: which commands to use for load, CPU, memory, and IO → what high load with low CPU means, the difference between memory "fully used" and cache, what iowait and steal mean → how to locate intermittent stalls, a process killed by OOM, a disk that is full while df and du disagree → the payoff limits of single-host tuning (kernel parameters, ulimit, cgroup) and when to change the architecture instead
- Signs of a solid answer: distinguishes R/D states from iowait; layers the analysis with vmstat/iostat/pidstat; can read dmesg and cgroup memory limits; can mention that a deleted file with an unreleased handle means the space is not reclaimed

### Network and TCP/HTTP troubleshooting
- Ladder: three-way handshake and four-way teardown, on which side TIME_WAIT and CLOSE_WAIT appear → the roles of connection pools, keepalive, backlog, and the conntrack table → how to locate by layer intermittent timeouts/connection resets between services, slow DNS resolution, and cross-datacenter packet loss → the trade-offs and side effects of tuning TCP parameters, adding a proxy layer, and changing the retry policy
- Signs of a solid answer: uses ss to view state distribution and attributes it to a side; the classic case of an LB idle timeout mismatching application keepalive; can diagnose a full conntrack table and backlog overflow; DNS caching and the ndots problem

### Container internals and image governance
- Ladder: differences between containers and virtual machines → namespaces, cgroups, the overlay file system, image layers → OOM inside a container while host memory is plentiful, CPU core count seen in the container not matching the limit, slow image pulls → image slimming, unified base images, vulnerability scanning, and the cost and benefit of image registry governance
- Signs of a solid answer: container memory includes off-heap, metaspace, thread stacks, and page cache; JVM flags for container-limit awareness; multi-stage builds and running as non-root; image signing or scanning wired into the pipeline

### CI/CD and release systems
- Ladder: difference between CI and CD, pipeline stages → build caching, artifact management, environment isolation, secret injection → how to fix pipelines that fail intermittently, builds getting slower, and releases that cannot be rolled back → the cost and use cases of canary, blue-green, and gradual rollouts, and the return on productizing a release system
- Signs of a solid answer: immutable artifacts, build once and deploy many times; releases separated from migrations and forward compatible; canary metrics judged automatically; even emergency changes leave a trace

### Monitoring metrics and alert design
- Ladder: what questions metrics, logs, and traces each answer → the Prometheus data model, the four golden signals, RED/USE methods, aggregation and cardinality → too many alerts and nobody reads them, alerts fire but cannot be localized, metric cardinality explodes and drags down the monitoring system: how to fix them → alerting on symptoms vs causes, threshold alerts vs anomaly detection, trade-offs on who gets woken up
- Signs of a solid answer: alerts on user-perceivable symptoms (error rate, latency); alerts carry handling guidance and automatic noise reduction; has SLO burn-rate alerts; uses "does this alert require action" as the pruning criterion

### SLOs, error budgets, and reliability engineering
- Ladder: the difference between SLI/SLO/SLA → how to choose SLIs, how to set the number of nines, how to compute the error budget → the SLO is always met but users complain, or the SLO is set at a level the business does not accept: what to do → the resistance to enforcing a release freeze when the error budget runs out, negotiating reliability investment against business iteration speed
- Signs of a solid answer: SLIs defined from the user perspective (success rate, latency percentiles); has burn-rate alerts; error budget used in release cadence decisions; knows SLOs need iteration

### Incident response and postmortems
- Ladder: what to do first when an alert arrives → mitigation before root cause, incident command and communication roles, timeline recording → multiple teams pass blame, the root cause is hidden in a change nobody owns up to, the incident keeps recurring: how to drive resolution → building a blameless postmortem culture and tracking action items to completion
- Signs of a solid answer: has numbers for MTTD/MTTR; mitigation actions (rollback, scale out, degrade, shift traffic) have a clear priority; postmortems produce verifiable improvement items; has a data-backed sense of "changes are the main cause of incidents"

### Change management and safe production
- Ladder: why most incidents come from changes → change classification, approval, windows, rollback ability → an emergency fix skips the process and causes trouble, a config center pushes to 100% in one click and triggers an avalanche: how to prevent it → balancing process strictness against delivery speed, the boundary between automated gatekeeping and manual approval
- Signs of a solid answer: risk-tiered changes; configuration also goes through canary and validation; change events marked on the monitoring timeline; automated checks replace most human review
