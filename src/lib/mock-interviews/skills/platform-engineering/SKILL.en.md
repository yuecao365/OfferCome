---
name: platform-engineering
description: Platform engineering deep dive on IaC, K8s ops, capacity and cost, disaster recovery, IDPs, GPU clusters, multi-cloud.
keywords: [platform engineering, iac, terraform, gitops, internal developer platform, idp, capacity planning, cost governance, finops, disaster recovery, active-active, gpu cluster, ai workloads, multi-cloud, kubernetes operations]
layer: detail
domains: [infra-sre]
---

## What interviewers care about

This pack is the deep dive for SREs moving toward platform work: turning infrastructure into a product that dozens of teams use. The interviewer looks at scale and cost: how IaC drift is handled, how capacity is planned, how cost is attributed to teams, whether disaster recovery has ever been drilled, and what the platform's abstractions leak. In 2026 GPU clusters and AI workloads have been added: scheduling, utilization, quotas and cost have become new KPIs for platform teams.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows Terraform / IaC / GitOps → probe how drift is detected, how state is managed, an incident caused by an apply, and the approval process
- Resume shows capacity / cost → probe the level cost is attributed to, how much was saved, how rebound is prevented, and the utilization numbers
- Resume shows disaster recovery / active-active → probe RPO / RTO, drill frequency, and what the last drill uncovered
- Resume shows an internal platform / developer portal → probe who the users are, adoption rate, what the abstraction leaks, and how the platform team takes in requests
- Resume shows a GPU cluster → probe scheduling policy, utilization, quotas and preemption, and failure rate
- Resume shows multi-cloud / hybrid cloud → probe why multi-cloud, which layer the abstraction sits at, and the cost and complexity

## Common failures and red flags

- Infrastructure as code and configuration management: edits production by hand and back-fills the code later; does not know about state drift; no approval or plan preview
- Capacity planning and cost governance: capacity is a guess; cost is looked at only as a total with no attribution; saves cost by cutting resources without looking at utilization
- High availability and disaster recovery architecture: only says "two sites, three centers"; has never run a drill; RPO / RTO have no numbers
- Automation and platform thinking: piles scripts up and calls it a platform; no user perspective; a lot of leaky abstractions
- Orchestration platform operations: upgrades on hope; does not know how control-plane and data-plane failures differ
- Internal developer platform: nobody uses the platform; interface design ignores self-service; documentation is missing
- GPU clusters and AI workloads: GPU utilization is not monitored; scheduling still follows CPU thinking; no policy for quotas and preemption
- Multi-cloud and vendor lock-in: multi-cloud for its own sake; the abstraction layer costs more than it returns

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for how deep a solid answer goes; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Orchestration platform operations (Kubernetes perspective)
- Ladder: what Pod, Deployment and Service each solve → the mechanics of scheduling, probes, resource request/limit and HPA → how to investigate Pod Pending / CrashLoopBackOff / Evicted and how to handle a NotReady node → trade-offs in cluster scale, multi-cluster, upgrade strategy and how autonomous the platform is (details go to the infra-k8s pack)
- Signs of a solid answer: stop-the-bleeding instinct of rolling back first and investigating after; uses describe to read events and compares by node/version; how probes and graceful shutdown work together; awareness of the risks of a cluster upgrade

### Infrastructure as code and configuration management
- Ladder: why IaC → Terraform state file, plan/apply, modularization, Ansible idempotency → state drift, concurrent apply conflicts, how to prevent and recover from accidentally deleted resources → IaC coverage (everything or only the core), the permission boundary between the platform team and product teams
- Signs of a solid answer: remote state with locking; lifecycle protection on critical resources; plan goes into PR review; drift detection runs on a schedule

### Capacity planning and cost governance
- Ladder: how do you know it is time to scale out → load-testing method, watermarks, peak estimation, autoscaling → resource utilization is only 15% yet the business says there is not enough, the cloud bill grows 30% a month and nobody can explain it, how do you investigate → reserved vs on-demand, overcommit, co-location, their risks and benefits, and how cost responsibility is shared out to the business
- Signs of a solid answer: per-service ratio of usage to request; VPA or recommendation-value governance; off-peak scheduling and elasticity; cost visible down to the team and tied to evaluation

### High availability and disaster recovery architecture
- Ladder: where are the single points → multiple availability zones, active-active vs primary-standby, consistency of data replication → one availability zone goes down and the whole business goes with it, failover drills have never succeeded, how to fix it → cost and complexity of active-active, how RPO/RTO targets are aligned with the business
- Signs of a solid answer: dependency mapping and a single-point list; regular drills (chaos engineering); the consistency cost of switching over the data layer; disaster recovery targets tiered by business criticality

### Automation and platform thinking
- Ladder: which repetitive work should be automated → the evolution path from scripts to tools to a platform → the automation script itself becomes a source of incidents, or nobody uses the platform, what then → the boundary of platform engineering: self-service vs security constraints, how much abstraction is right
- Signs of a solid answer: ranks automation by frequency and risk; self-service with guardrails and audit; measures by ticket reduction and lead time; can describe one lesson from "automation gone wrong"

### Internal developer platform
- Ladder: how platform engineering differs from traditional ops: turning infrastructure into a self-service product → what the platform should abstract and what it should expose (templates, portal, API); golden path → what to do when adoption is low; how to handle abstraction leaks (users still have to understand the layer below) → the boundary between the platform team and product teams; the platform's SLO and feedback mechanism
- Signs of a solid answer: has an adoption rate or user count; can name one abstraction leak and how it was handled; the platform has its own SLO

### GPU clusters and AI workloads
- Ladder: how GPU workloads differ from ordinary services (exclusive use, long-running jobs, communication-heavy) → scheduling: topology awareness, gang scheduling, quotas and preemption, fragmentation → how GPU utilization is measured (SM, memory, bandwidth), why it is often low, how to raise it → the SLOs for training and inference services respectively; failure rate and automatic replacement; cost attribution to teams
- Signs of a solid answer: knows what gang scheduling and topology awareness solve; has utilization numbers and the means used to improve them; can describe the GPU failure handling process

### Multi-cloud and vendor lock-in
- Ladder: why multi-cloud happens (compliance, cost, disaster recovery, acquisitions) → which layer the abstraction sits at (K8s, IaC modules, in-house platform) and the cost of each → cross-cloud networking, identity and data synchronization problems → the real cost of lock-in and of migration; when to accept lock-in
- Signs of a solid answer: has a clear reason for multi-cloud; knows what the abstraction layer costs; can describe how one cross-cloud problem was handled
