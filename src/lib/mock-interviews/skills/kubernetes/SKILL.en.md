---
name: kubernetes
description: Interviewing on Kubernetes across scheduling, networking, storage, troubleshooting, and multi-cluster governance.
keywords: [kubernetes, k8s, cloud-native, container platform, container orchestration, pod, deployment, ingress, helm, operator, cni, etcd, kubelet, hpa, istio]
layer: detail
domains: [infra-sre, ai-infra, backend]
---

## What interviewers care about

Kubernetes roles fall into two kinds. One is the "people who use K8s" (SRE, ops-dev, platform operations): day to day they maintain clusters, troubleshoot Pod and network problems, govern resources and cost, and run cluster upgrades. The other is the "people who build K8s platforms" (container platform engineers, Operator developers): they write controllers, extend the scheduler, and wrap a PaaS on top. Both interviews start by testing understanding of the core objects and the control loop, then dig in different directions: the former is pressed on troubleshooting and cluster governance, the latter on API extension, how Informers work, and controller idempotency. Interviewers care about three things most. First, can the candidate explain the "declarative + control loop" mental model and use it to account for what they observe. Second, when a Pod won't start, the network is down, or a node misbehaves, do they have a layered troubleshooting path rather than guessing one thing at a time. Third, do they have production-scale experience: node counts, Pod counts, number of upgrades, the pitfalls they have hit.

For new-grad candidates, focus on fundamentals: the Pod lifecycle, the scheduling flow, how a Service is implemented, container isolation mechanisms; for hands-on ability, see whether they can write out a Deployment and explain every field. For experienced candidates, focus on production governance: resource quotas and QoS, probes and graceful shutdown, CNI/storage selection, cluster upgrades, multi-cluster and cost, Operator design. In the last couple of years, K8s interviews at top companies increasingly hand the candidate `describe` output and events to judge on the spot, and questions that just recite kubectl commands have become rarer.

How to ask like an interviewer in this field:
- First establish whether the role is "using K8s" or "building a K8s platform". Press the former on troubleshooting and governance, the latter on controllers and API extension. Do not stump an ops candidate with Operator internals, and do not quiz a platform engineer on kubectl tricks.
- Start from `describe` output, events, or a symptom, and ask for a layered troubleshooting path with verification commands. If the candidate only says "check the logs", press on which component's logs, and what exactly to look for.
- Always press on the side effects of any governance plan: tuning limits, adding probes, adopting a mesh, enabling overcommit all have costs. A candidate who cannot name the cost has not really done it.
- Do not test version trivia (which field was added in which version) or distribution-specific features. Test the control-loop mental model, networking and scheduling principles, and the pitfalls of running at production scale.
- In 2026, K8s interviews gained an AI-workload axis: GPU device plugins and topology-aware scheduling, gang scheduling, dynamic resource allocation, GPU utilization as an SLO; observability defaults to OpenTelemetry collection. A candidate who has never run GPU workloads is not marked down, but when asked they should be able to reason about it with the same scheduling and resource model.

## Probing projects and internships

When the resume shows experience like the items below, this says where to start and what to press on. An answer is solid once the candidate can state the mechanism, where their numbers came from, and one real failure or tradeoff; if they can only give framework names and conclusions and cannot describe their own part, record it as a red flag. For the general follow-up method, see project-deep-dive.

- Resume says "maintained K8s clusters" → probe cluster count, node count, Pod count, version, how many upgrades, and the worst cluster-level incident
- Resume says a self-built Operator / controller → probe which CRDs it manages, how Reconcile guarantees idempotency, leader election, and whether they ever had a controller storm
- Resume says service mesh / Istio → probe why they adopted it, the latency and resource overhead of the sidecar, which mTLS and traffic-governance features they used, and what they regret
- Resume says CNI / network solution migration → probe what they migrated from and to, how they did the gradual rollout, MTU and Policy compatibility issues, and whether anything went wrong during migration
- Resume says Helm / Kustomize / GitOps (ArgoCD) → probe how multiple environments are managed, whether secrets ended up in values, how sync failures are handled, and how drift is detected
- Resume says improved resource utilization / cost reduction → probe utilization from what to what, which techniques (VPA, overcommit, co-location), and whether it caused evictions or instability
- Resume says cluster upgrades → probe the version gap, how they scanned for deprecated APIs, the batching strategy, and whether they ever rolled back
- Resume says moved a stateful service to cloud-native → probe which Operator, how backup and failover work, and what happens to the volume when a node fails

## Common failures and red flags

- Core architecture and the control loop: cannot explain the division of labor between kubelet and controller-manager; does not know about the Informer cache and watch; treats etcd as an ordinary database
- Pod lifecycle and probes: configures liveness and readiness identically; does not know traffic can still arrive after SIGTERM; copies probe timeouts from a template
- Scheduling and resource management: believes a limit means "uses at most this much, with no side effects"; does not know the three QoS classes and the OOM order; for Pending can only say "not enough resources"
- Workload types and release strategy: uses Deployment for everything; sets no concurrency policy or deadline on a CronJob; does not know StatefulSet updates go one Pod at a time
- Service, kube-proxy, and DNS: thinks a Service is a single process forwarding traffic; does not know ndots causes multiple lookups; cannot explain why long-lived connections are unbalanced behind a Service
- Ingress, gateway, and traffic governance: thinks an Ingress is just "configure a domain name"; cannot tell a gateway 502 from a 504; has not considered the impact of reloads
- CNI and network policy: does not know which CNI mode their cluster uses; NetworkPolicy is allow-all by default and they do not realize it; has never heard of MTU problems
- Storage and stateful services: uses hostPath for all storage; does not know RWO versus RWX; assumes a database on K8s is naturally fine
- ConfigMap, Secret, and config governance: thinks Secrets are encrypted; mounts with subPath and still expects hot reload; commits secrets directly in Helm values
- RBAC, multi-tenancy, and cluster security: every Pod uses the default ServiceAccount and it has cluster permissions; does not know what admission controllers can block; treats a namespace as a security boundary
- Observability and troubleshooting: only looks at Pod CPU and memory; does not know events expire after an hour by default; for node problems can only restart
- Cluster upgrades and lifecycle management: has never done an upgrade; does not know PDBs; drains all nodes at once
- Operators and API extension: does non-idempotent work inside Reconcile; does not know leader election; adds finalizers but never removes them
- Autoscaling and cost governance: HPA on CPU only; does not know inflated requests are the main cause of low utilization; scales down without considering PDBs

## Frequently tested topics

Only names, ladders, and signs of a solid answer are listed, as a reference for "how deep counts as solid"; which topics to ask and how many is decided by this JD and this resume, not a quota.

### Core architecture and the control loop
- Ladder: what each control-plane component does → declarative API, desired versus actual state, Informer and List-Watch, how controllers reconcile → apiserver is slow, etcd latency is high, controller backlog means a Deployment change takes forever to take effect, how to troubleshoot → what determines cluster scale limits, governing etcd data volume and object counts
- Signs of a solid answer: the "eventual consistency" mental model of the control loop; apiserver request latency and etcd fsync metrics; controller workqueue depth; the effect of object counts and label queries on performance

### Pod lifecycle and probes
- Ladder: what each Pod state means, initContainer, Sidecar → what liveness/readiness/startup probes each control, graceful shutdown and preStop, terminationGracePeriod → 502s during a release, a Pod restarting repeatedly while its logs look normal, a rolling update stuck, how to locate the cause → tradeoffs between probe parameters and smooth traffic, handling slow-starting services
- Signs of a solid answer: readiness removing the Pod from traffic and the propagation delay of Endpoints; preStop sleep or actively draining; startupProbe protecting slow starts; the effect of maxSurge/maxUnavailable on release pace

### Scheduling and resource management
- Ladder: the difference between request and limit → scheduler filtering and scoring, affinity/anti-affinity, taints and tolerations, topology spread, QoS classes and eviction order → a Pod stays Pending although resources look sufficient, node CPU is idle but the Pod is throttled, node memory pressure evicted a critical service, how to investigate → overcommit ratio, request governance, the payoff and risk of priority and preemption
- Signs of a solid answer: the relationship between CFS quota and throttling; the eviction differences among Guaranteed/Burstable/BestEffort; reading the FailedScheduling reason in describe (affinity, taints, PVC topology, ports); ways to close the gap between request and actual usage

### Workload types and release strategy
- Ladder: where Deployment/StatefulSet/DaemonSet/Job/CronJob each fit → rolling update parameters, revisions and rollback, StatefulSet ordering and stable network identity → data corruption after scaling a stateful service, CronJob running twice or being skipped, Job failure retries overwhelming downstream, how to handle → native rolling versus Argo Rollouts/canary, where to draw the line on platformizing release strategy
- Signs of a solid answer: choosing the type by state, identity, and ordering needs; how rolling parameters interact with consumer groups; concurrencyPolicy and idempotent design; canaries need metric-based judgment, not just batching

### Service, kube-proxy, and DNS
- Ladder: the differences among ClusterIP/NodePort/LoadBalancer/Headless → how kube-proxy implements iptables versus IPVS, Endpoints/EndpointSlice, the CoreDNS resolution path → occasional resolution failures or 5-second delays, Service works but direct Pod access does not (or the reverse), unbalanced long-lived connections, how to troubleshoot → the migration cost of IPVS and eBPF data planes, tradeoffs in DNS caching and ndots tuning
- Signs of a solid answer: iptables rule count versus IPVS at scale; NodeLocal DNSCache; EndpointSlice propagation; long-lived connections using Headless plus client-side load balancing

### Ingress, gateway, and traffic governance
- Ladder: the relationship between Ingress and Service → how an Ingress Controller is implemented, Gateway API, TLS termination, path and host routing → attributing gateway 502/504, Nginx reload jitter from a large number of Ingresses, gRPC and WebSocket passthrough problems → boundary between a unified gateway and per-business gateways, benefits versus operational cost of a service mesh (Istio)
- Signs of a solid answer: dynamic config updates versus reload; gateway connection draining; layered gateways (edge/business); the resource and latency cost of mesh sidecars

### CNI and network policy
- Ladder: why Pods can talk to each other directly → Overlay versus Underlay, mode differences among Calico/Cilium/Flannel, how NetworkPolicy is implemented → cross-node traffic fails but same-node works, MTU causing large-packet loss, a dependency wrongly blocked after adding NetworkPolicy, how to investigate → performance and operational cost of CNI selection, migration risk of an eBPF data plane
- Signs of a solid answer: layered verification (node connectivity, tunnel, tcpdump inside the Pod); BGP versus VXLAN differences; how to roll out default-deny Policy; making use of Cilium observability

### Storage and stateful services
- Ladder: the relationship among Volume/PV/PVC/StorageClass → dynamic provisioning, access modes, CSI drivers, topology awareness → PVC Pending, Pod stuck mounting, PV cannot move after a node failure, disk full causing eviction, how to handle → judging whether a database belongs on K8s, performance and cost tradeoffs between cloud disks and distributed storage
- Signs of a solid answer: the timing of node failure versus volume detach; the risk of multi-attach; the capabilities an Operator managing a database must have (backup, failover, scaling); when local disks versus cloud disks fit

### ConfigMap, Secret, and config governance
- Ladder: differences between ConfigMap and Secret and how they are mounted → hot-reload mechanics (subPath does not update, environment variables do not update), base64 in a Secret is not encryption → config changed but the Pod did not pick it up, secrets leaked in an image or logs, a bad config pushed to every cluster at once, how to prevent → complexity and payoff of integrating an external secret system (Vault, cloud KMS, External Secrets), review process for config as code
- Signs of a solid answer: etcd encryption at rest and KMS; least-privilege RBAC; External Secrets or a CSI secrets driver; config changes also go through canary and validation

### RBAC, multi-tenancy, and cluster security
- Ladder: the relationship among ServiceAccount, Role, and ClusterRole → Pod security standards, admission control (Webhook, OPA/Kyverno), the boundary of namespace isolation → one team's Pods overwhelm a node and hurt others, deleting someone else's namespace resources by mistake, privileged container escape, how to prevent → choosing between soft multi-tenancy (namespace) and hard multi-tenancy (multi-cluster/virtual cluster)
- Signs of a solid answer: ResourceQuota and LimitRange; admission policies forbidding privileged and hostPath; node-level isolation via taints or node pools; familiarity with virtual cluster approaches

### Observability and troubleshooting
- Ladder: what to look at for cluster health → the division of labor among kube-state-metrics, cAdvisor, node metrics, events, and audit logs → a Pod was evicted and left no trace, a node flaps NotReady, overall cluster latency rises, how to connect the clues → how monitoring data volume relates to cluster size, the cost of metric cardinality and retention policy
- Signs of a solid answer: persisting events; node-pressure eviction thresholds and PLEG; correlating kubelet and containerd logs; awareness of underlying maintenance events from the cloud provider

### Cluster upgrades and lifecycle management
- Ladder: why upgrade, version skew policy → phased upgrade of control plane and nodes, API deprecation and migration, node draining and PDBs → Pod migration during an upgrade interrupts the business, a deprecated API prevents resource creation, CNI/CSI version incompatibility, how to avoid → cost comparison of in-place upgrade versus blue-green new cluster, balancing upgrade frequency and stability
- Signs of a solid answer: deprecated API scanning; PDB and drain working together; batches plus observation windows; validating critical components (CNI, Ingress, monitoring) first; a blue-green cluster migration approach

### Operators and API extension
- Ladder: what CRDs and Operators solve → the Reconcile loop, Informer cache, OwnerReference and finalizer, status writeback → a controller in an infinite loop updating constantly, multiple controller replicas processing the same item, deletion stuck on a finalizer, how to troubleshoot → maintenance cost of a custom Operator versus a community one, what logic should not go into a controller
- Signs of a solid answer: compare before updating, resync period and event filtering; workqueue backoff; leader election; separating status from spec; backoff strategy for failed retries

### Autoscaling and cost governance
- Ladder: how HPA works → metric sources (metrics-server, custom metrics), VPA, node scaling with Cluster Autoscaler/Karpenter → HPA flapping, Pods scaled up but nodes insufficient so they go Pending, scale-down evicted Pods that should not have been touched, how to tune → the tension between higher utilization and stability, risk boundaries of co-location and spot instances
- Signs of a solid answer: scaling on business metrics; scaling cooldowns and stabilization windows; tiered node pools and fault tolerance for spot instances; cost visible per namespace with a mechanism to drive action
