---
name: infra-k8s
description: Kubernetes 怎么面：工作负载与调度、Service/Ingress 网络、存储与配置密钥、可观测与故障排查、多集群与成本治理。岗位或简历出现 Kubernetes/K8s、云原生平台、容器平台开发、Operator 开发时加载。
keywords: [kubernetes, k8s, 云原生, 容器平台, 容器编排, pod, deployment, ingress, helm, operator, cni, etcd, kubelet, hpa, istio]
layer: stack
parent: infra-sre
---

## 面试官在意什么

Kubernetes 相关岗位分两类：一类是"用 K8s 的人"（SRE、运维开发、平台运维），日常是维护集群、排查 Pod 与网络问题、治理资源与成本、做集群升级；另一类是"造 K8s 平台的人"（容器平台研发、Operator 开发），日常是写控制器、扩展调度器、封装 PaaS。两类面试都会先考核心对象与控制循环的理解，再往各自方向深挖：前者追故障排查与集群治理，后者追 API 扩展、Informer 机制与控制器的幂等性。面试官最在意三件事：一是能否说清"声明式 + 控制循环"这个心智模型并用它解释各种现象，二是遇到 Pod 起不来、网络不通、节点异常时有没有一套分层的排查路径而不是逐个猜，三是有没有生产规模的经验——节点数、Pod 数、升级次数、踩过的坑。

校招侧重原理：Pod 生命周期、调度流程、Service 的实现方式、容器的隔离机制，动手能力看能否写清一个 Deployment 并解释每个字段；社招侧重生产治理：资源配额与 QoS、探针与优雅退出、CNI/存储选型、集群升级、多集群与成本、Operator 设计。近两年一线厂的 K8s 面试越来越多地给"describe 输出与事件"让候选人现场判断，纯背 kubectl 命令的题减少。

怎么问才像这个方向的面试官：
- 先问清角色是"用 K8s"还是"造 K8s 平台"，前者追排查与治理，后者追控制器与 API 扩展，不要拿 Operator 内部机制去为难运维岗、也不要拿 kubectl 技巧去考平台研发。
- 从 describe 输出、事件或一段现象切入，要求给分层排查路径与验证命令，只会说"看日志"的要追具体看哪一个组件的什么日志。
- 每个治理方案必追副作用：调 limit、加探针、上网格、开超卖都有代价，说不出代价的当作没做过。
- 不考版本时效（某版本新增字段）与某发行版专属特性，考的是控制循环心智、网络与调度原理、生产规模的踩坑经验。

## 项目 / 实习怎么深挖

简历上出现下面这类经历时从哪里切、追什么。追到候选人能说出机制、数字的来源与一次真实的故障或取舍才算实；只有框架名与结论、说不出自己那一段的，记为危险信号。通用的追问方法见 project-deep-dive。

- 简历出现"维护 K8s 集群" → 追集群数、节点数、Pod 数、版本、升级过几次、最严重的一次集群级故障
- 简历出现自研 Operator / 控制器 → 追管理的 CRD 是什么、Reconcile 怎么保证幂等、leader election、出过控制器风暴没有
- 简历出现服务网格 / Istio → 追为什么上、sidecar 带来的延迟与资源开销、mTLS 与流量治理用了哪些、后悔的地方
- 简历出现 CNI / 网络方案迁移 → 追从什么迁到什么、怎么灰度、MTU 与 Policy 兼容问题、迁移期间出过事吗
- 简历出现 Helm / Kustomize / GitOps（ArgoCD） → 追多环境怎么管、values 里有没有密钥、同步失败怎么处理、drift 怎么发现
- 简历出现资源利用率提升 / 降本 → 追利用率从多少到多少、用了什么手段（VPA、超卖、混部）、引发过驱逐或抖动吗
- 简历出现集群升级 → 追版本跨度、废弃 API 怎么扫、分批策略、有没有回退过
- 简历出现有状态服务上云原生 → 追用的什么 Operator、备份与切主怎么做、节点故障时卷怎么处理

## 常见失守与危险信号

- 核心架构与控制循环：说不清 kubelet 与 controller-manager 的分工；不知道 Informer 缓存与 watch；把 etcd 当普通数据库
- Pod 生命周期与探针：liveness 和 readiness 配成一样；不知道 SIGTERM 后仍会有流量进来；探针超时照抄模板
- 调度与资源管理：认为 limit 是"最多用这么多不会有副作用"；不知道 QoS 三级与 OOM 顺序；Pending 只会看"资源不够"
- 工作负载类型与发布策略：所有东西都用 Deployment；CronJob 不设并发策略与 deadline；不知道 StatefulSet 更新是逐个的
- Service、kube-proxy 与 DNS：认为 Service 是一个进程在转发；不知道 ndots 会产生多次查询；长连接经过 Service 后不均衡说不出原因
- Ingress、网关与流量治理：Ingress 就是"配个域名"；分不清网关的 502 与 504；没考虑过 reload 的影响
- CNI 与网络策略：不知道自己集群用的 CNI 是什么模式；NetworkPolicy 默认全放行且没意识；MTU 问题没听过
- 存储与有状态服务：所有存储都用 hostPath；不知道 RWO 与 RWX；认为数据库放 K8s 天然没问题
- ConfigMap、Secret 与配置治理：认为 Secret 是加密的；用 subPath 挂载还期待热更新；密钥直接写在 Helm values 里提交
- RBAC、多租户与集群安全：所有 Pod 用 default ServiceAccount 且有集群权限；不知道准入控制器能拦什么；把 namespace 当安全边界
- 可观测性与故障排查体系：只看 Pod 的 CPU 内存；不知道事件默认一小时就没了；节点问题只会重启
- 集群升级与生命周期管理：从没升过级；不知道 PDB；直接 drain 所有节点
- Operator 与 API 扩展：Reconcile 里做不幂等的操作；不知道 leader election；finalizer 只加不删
- 弹性伸缩与成本治理：HPA 只按 CPU；不知道 request 虚高是利用率低的主因；缩容不考虑 PDB

## 常考主题清单

只列名字、阶梯与答实的标志，作"问到哪一层算实"的参考；问哪些、问几道由这份 JD 与这份简历定，不是配额。

### 核心架构与控制循环
- 阶梯：控制平面各组件做什么 → 声明式 API、期望状态与实际状态、Informer 与 List-Watch、控制器如何协调 → apiserver 慢、etcd 延迟高、控制器堆积导致 Deployment 变更迟迟不生效怎么排查 → 集群规模上限由什么决定，etcd 数据量与对象数量的治理
- 答实的标志：控制循环的"最终一致"心智；apiserver 请求延迟与 etcd fsync 指标；控制器 workqueue 深度；对象数量与 label 查询对性能的影响

### Pod 生命周期与探针
- 阶梯：Pod 各状态含义、initContainer、Sidecar → liveness/readiness/startup 探针分别控制什么、优雅退出与 preStop、terminationGracePeriod → 发布时出现 502、Pod 反复重启但日志正常、滚动更新卡住，怎么定位 → 探针参数与流量平滑的取舍，慢启动服务的处理
- 答实的标志：readiness 摘流与 Endpoints 传播延迟；preStop sleep 或主动摘流；startupProbe 保护慢启动；maxSurge/maxUnavailable 对发布节奏的影响

### 调度与资源管理
- 阶梯：request 与 limit 的区别 → 调度过滤与打分、亲和/反亲和、污点容忍、拓扑分布、QoS 等级与驱逐顺序 → Pod Pending 却显示资源充足、节点 CPU 空闲但 Pod 被 throttle、节点内存压力驱逐了关键服务，怎么查 → 超卖比例、request 治理、优先级与抢占的收益风险
- 答实的标志：CFS 配额与 throttling 的关系；Guaranteed/Burstable/BestEffort 的驱逐差异；describe 看 FailedScheduling 原因（亲和、污点、PVC 拓扑、端口）；request 与实际用量差距的治理手段

### 工作负载类型与发布策略
- 阶梯：Deployment/StatefulSet/DaemonSet/Job/CronJob 各用在哪 → 滚动更新参数、revision 与回滚、StatefulSet 的有序性与稳定网络标识 → 有状态服务扩缩容后数据错乱、CronJob 重复执行或漏执行、Job 失败重试打爆下游，怎么处理 → 原生滚动与 Argo Rollouts/金丝雀的选择，发布策略平台化的边界
- 答实的标志：按状态、身份、顺序需求选类型；滚动参数与消费者组的配合；concurrencyPolicy 与幂等设计；金丝雀需要指标判定而不只是分批

### Service、kube-proxy 与 DNS
- 阶梯：ClusterIP/NodePort/LoadBalancer/Headless 的区别 → kube-proxy iptables 与 IPVS 的实现、Endpoints/EndpointSlice、CoreDNS 解析链路 → 服务偶发解析失败或 5 秒延迟、Service 通但直连 Pod 不通（或反之）、长连接不均衡，怎么排查 → IPVS 与 eBPF 数据面的迁移代价，DNS 缓存与 ndots 的调优取舍
- 答实的标志：iptables 规则数量与 IPVS 的规模差异；NodeLocal DNSCache；EndpointSlice 传播；长连接用 Headless + 客户端负载均衡

### Ingress、网关与流量治理
- 阶梯：Ingress 与 Service 的关系 → Ingress Controller 的实现、Gateway API、TLS 终结、路径与主机路由 → 网关 502/504 归因、大量 Ingress 导致 Nginx reload 抖动、gRPC 与 WebSocket 穿透问题 → 统一网关与各业务自建网关的边界，服务网格（Istio）的收益与运维代价
- 答实的标志：动态配置更新 vs reload；网关的连接排空；分层网关（边缘/业务）；网格 sidecar 的资源与延迟成本

### CNI 与网络策略
- 阶梯：Pod 之间为什么能直接通信 → Overlay 与 Underlay、Calico/Cilium/Flannel 的模式差异、NetworkPolicy 的实现 → 跨节点不通但同节点通、MTU 导致大包丢失、NetworkPolicy 加上后依赖服务被误拦，怎么查 → CNI 选型的性能与运维成本，eBPF 数据面的迁移风险
- 答实的标志：分层验证（节点互通、隧道、Pod 内 tcpdump）；BGP 与 VXLAN 的差异；Policy 默认拒绝的推进方式；Cilium 可观测能力的利用

### 存储与有状态服务
- 阶梯：Volume/PV/PVC/StorageClass 的关系 → 动态供给、访问模式、CSI 驱动、拓扑感知 → PVC Pending、Pod 挂载卡住、节点故障后 PV 无法迁移、磁盘满导致驱逐，怎么处理 → 数据库上不上 K8s 的判断，云盘与分布式存储的性能成本取舍
- 答实的标志：节点故障与卷 detach 的时序；多重挂载的风险；Operator 管理数据库的必要能力（备份、切主、扩容）；本地盘与云盘的适用场景

### ConfigMap、Secret 与配置治理
- 阶梯：ConfigMap 与 Secret 的差别与挂载方式 → 热更新机制（subPath 不更新、环境变量不更新）、Secret 的 base64 不是加密 → 配置改了 Pod 没生效、密钥泄露在镜像或日志里、配置错误一键推到所有集群，怎么防 → 外部密钥系统（Vault、云 KMS、External Secrets）接入的复杂度与收益，配置即代码的审核流程
- 答实的标志：etcd 静态加密与 KMS；最小权限 RBAC；External Secrets 或 CSI 密钥驱动；配置变更也走灰度与校验

### RBAC、多租户与集群安全
- 阶梯：ServiceAccount、Role、ClusterRole 的关系 → Pod 安全标准、准入控制（Webhook、OPA/Kyverno）、namespace 隔离的边界 → 一个团队的 Pod 打爆节点影响别人、误删别人 namespace 的资源、特权容器逃逸，怎么防 → 软多租户（namespace）与硬多租户（多集群/虚拟集群）的选择
- 答实的标志：ResourceQuota 与 LimitRange；准入策略禁止特权与 hostPath；节点级隔离用污点或节点池；对虚拟集群方案有了解

### 可观测性与故障排查体系
- 阶梯：集群健康看什么 → kube-state-metrics、cAdvisor、节点指标、事件与审计日志的分工 → Pod 被驱逐没留下线索、节点 NotReady 反复、集群整体延迟升高，怎么串起线索 → 监控数据量与集群规模的关系，指标基数与保留策略的成本
- 答实的标志：事件持久化；节点压力驱逐阈值与 PLEG；kubelet 与 containerd 日志关联；对云厂商底层维护事件的感知

### 集群升级与生命周期管理
- 阶梯：为什么要升级、版本偏差策略 → 控制平面与节点分步升级、API 废弃与迁移、节点排空与 PDB → 升级时 Pod 迁移导致业务中断、废弃 API 导致资源无法创建、CNI/CSI 版本不兼容，怎么规避 → 就地升级与蓝绿建新集群的成本对比，升级频率与稳定性的平衡
- 答实的标志：废弃 API 扫描；PDB 与 drain 的配合；分批 + 观察窗口；关键组件（CNI、Ingress、监控）先验证；有蓝绿集群迁移的思路

### Operator 与 API 扩展
- 阶梯：CRD 与 Operator 解决什么 → Reconcile 循环、Informer 缓存、OwnerReference 与 finalizer、状态回写 → 控制器死循环频繁更新、多副本控制器重复处理、删除卡在 finalizer，怎么排查 → 自研 Operator 与用社区 Operator 的维护成本，什么逻辑不该塞进控制器
- 答实的标志：先比较再更新、resync 周期与事件过滤；workqueue 退避；leader election；status 与 spec 分离；对失败重试的退避策略

### 弹性伸缩与成本治理
- 阶梯：HPA 怎么工作 → 指标来源（metrics-server、自定义指标）、VPA、Cluster Autoscaler/Karpenter 的节点伸缩 → HPA 抖动扩缩、扩容了 Pod 但节点不够 Pending、缩容驱逐了不该动的 Pod，怎么调 → 利用率提升与稳定性的矛盾，混部与竞价实例的风险边界
- 答实的标志：按业务指标扩缩；扩缩冷却与稳定窗口；节点池分层与竞价实例的容错；成本按 namespace 可视化并有推动机制
