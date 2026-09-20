---
name: go
description: Go 后端怎么面：goroutine 调度、channel、GC 与逃逸、pprof、gRPC。JD 点名 Go 时读。
keywords: [go, golang, goroutine, channel, gin, grpc, go-zero, kratos, pprof, gmp, go后端, 云原生, kubernetes, 微服务, 服务端开发]
layer: detail
domains: [backend, infra-sre]
---

## 面试官在意什么

Go 后端在国内主要分布在云原生基础设施、中间件、高并发业务（IM、直播、游戏、广告）与出海公司，日常是用 Gin/Kratos/go-zero 或标准库写服务、用 gRPC 做内部通信、跑在 Kubernetes 上、靠 pprof 与 trace 排查性能。Go 面试有一条清晰主线：goroutine 与 GMP 调度、channel 与 sync 包、GC 与内存分配、逃逸分析、接口与反射的底层、常见并发 bug（泄漏、竞态、死锁）。语言本身简单，所以面试官不太考"语法知不知道"，而在意三件事：一是并发代码写得对不对——能否指出一段代码里的 goroutine 泄漏或数据竞争、知不知道 context 应该怎么传；二是有没有用 pprof 真实定位过 CPU、内存、阻塞问题；三是工程习惯——错误处理、依赖注入、包组织、测试、优雅退出这些在 Go 社区有强约定的东西是否内化。

校招侧重语言基础与并发模型：slice 与 map 的底层、defer 的执行顺序与坑、goroutine 与线程的差别、channel 的阻塞语义、手写 worker pool 或带超时的并发请求。社招侧重线上问题与设计：goroutine 数量涨到十万怎么排查、GC 频繁怎么优化、gRPC 连接与超时怎么管、如何设计一个可控的并发访问下游的组件。近两年一线公司会直接给代码片段问"这段有什么问题"，并追 Go 1.21+ 的新特性（泛型实践、结构化日志、PGO）是否用过。

怎么问才像这个方向的面试官：
- 架构与方法论（缓存一致性、消息队列、限流降级）交给 backend 包，本包专注 Go 运行时、并发原语与工程实践。
- 并发题优先给代码：让候选人现场写或找 bug，追每个 goroutine 的生命周期、每个 channel 的关闭方，不接受"大概是这样"。
- 性能题必须落到 pprof：候选人说了任何"优化"，追用的哪个 profile、看到了什么、benchmark 前后数字。
- 结合项目规模：几百 QPS 的服务不追 GOMEMLIMIT 与 PGO，但必须会写正确的 context 传递与优雅退出；基础设施类项目要追调度器与内存分配细节。
- 2026 年 Go 面试的新追问：GreenTea 一类新 GC 与容器感知的 GOMAXPROCS 改变了老的调优结论，要能说清默认值为什么变、什么场景还要手调；Go 作为云原生与 Agent 网关的主力语言，会追 context 取消如何贯穿到下游模型调用与流式转发。

## 项目 / 实习怎么深挖

简历上出现下面这类经历时从哪里切、追什么。追到候选人能说出机制、数字的来源与一次真实的故障或取舍才算实；只有框架名与结论、说不出自己那一段的，记为危险信号。通用的追问方法见 project-deep-dive。

- 简历出现"高并发" / worker pool → 追并发上限怎么定、goroutine 泄漏怎么防、有没有用 pprof 看过 goroutine 数
- 简历出现 gRPC / 微服务 → 追超时与重试在哪一层、连接怎么复用与负载均衡、拦截器里做了什么、proto 兼容怎么管
- 简历出现 Gin / Kratos / go-zero → 追为什么选这个、框架里哪部分被自己替换或封装了、中间件链怎么组织
- 简历出现性能优化 → 追用什么 profile 发现的、优化了分配还是锁还是 IO、benchmark 数据、上线后指标
- 简历出现 Kubernetes / 云原生 / Operator → 追 client-go 的 informer 与 workqueue 用法、优雅退出与探针怎么配、GOMAXPROCS 与内存限制怎么设
- 简历出现 Redis / Kafka 客户端 → 追连接池参数、消费的并发模型、消息处理失败与重平衡怎么处理
- 简历出现泛型 / Go 1.2x 新特性 → 追具体用在哪、解决了什么重复、有没有遇到约束或性能问题
- 简历出现自研中间件 / 网关 → 追连接管理、内存池与零拷贝、热更新配置、压测数据

## 常见失守与危险信号

- goroutine 与 GMP 调度：认为 goroutine 无限开没有代价；不知道 P 的数量默认等于 CPU 数、容器里可能拿到宿主机核数；说不出 runtime.Gosched 与抢占的区别
- channel 与并发模式：在接收方关闭 channel；不知道 for-range channel 什么时候退出；用 time.Sleep 等 goroutine 结束；所有并发问题都上 channel
- sync 包与数据竞争：认为 sync.Map 万能；不知道 -race 参数；复制含 Mutex 的结构体；RWMutex 在写多场景反而更慢却不知道
- context 与超时取消：context.Background 到处用；不知道 defer cancel；把 context 存进结构体字段
- GC 与内存分配：只知道"Go 有 GC 不用管"；不知道 GOGC 默认 100 意味着什么；认为堆小 GC 就少
- 逃逸分析与性能细节：不知道逃逸分析存在；认为指针一定比值快；过度优化冷路径
- slice、map、接口的底层与陷阱：不知道 slice 是引用底层数组；不知道 nil 指针放进接口不等于 nil；map 需要 make 才能写
- 错误处理与工程规范：到处 panic；错误只 log 不返回；用字符串比较判断错误类型
- Web 框架与 gRPC：不知道 http.Client 应复用、Transport 有连接池；不 close resp.Body；不知道 gRPC 长连接与 K8s Service 的 L4 负载问题
- pprof 与性能剖析：只用过 CPU profile；不知道 inuse 与 alloc 的区别；没用过 go tool trace
- 优雅退出、配置与部署：直接 os.Exit；不知道 SIGTERM 与 preStop 的时序；健康检查只返回 200
- 测试与代码组织：没写过测试；包名叫 utils/common 放一切；接口定义在实现方而不是使用方

## 常考主题清单

只列名字、阶梯与答实的标志，作"问到哪一层算实"的参考；问哪些、问几道由这份 JD 与这份简历定，不是配额。

### goroutine 与 GMP 调度
- 阶梯：goroutine 与线程的差别在哪 → G/M/P 的关系、本地队列与全局队列、work stealing、系统调用时 M 与 P 的解绑 → goroutine 数量暴涨、CPU 打满但吞吐不涨、某个 goroutine 长期得不到调度的排查 → GOMAXPROCS 在容器里怎么设，抢占式调度解决了什么、没解决什么
- 答实的标志：会用 pprof 的 goroutine profile 按栈聚合看泄漏点；知道用 automaxprocs 或 GOMAXPROCS 适配 cgroup 限制；对下游访问加并发限制（semaphore、worker pool）；提到 Go 1.14 的异步抢占解决了紧循环饿死问题

### channel 与并发模式
- 阶梯：有缓冲与无缓冲 channel 的语义 → 关闭 channel 的规则、nil channel 的用法、select 的随机性与 default → 死锁、发送到已关闭 channel 的 panic、消费者退出后生产者永久阻塞的排查 → channel 与 mutex 怎么选，pipeline、fan-in/fan-out、errgroup 的适用场景
- 答实的标志：谁生产谁关闭；errgroup.WithContext 或手写 semaphore；select 加 ctx.Done 分支防阻塞；能说出"共享内存用 mutex，传递所有权用 channel"的判断依据

### sync 包与数据竞争
- 阶梯：Mutex 与 RWMutex 什么时候用 → sync.Once、WaitGroup 的正确用法、atomic 的适用范围、Mutex 的饥饿模式 → 用 -race 发现的竞态怎么定位、map 并发写 panic、WaitGroup Add 与 Wait 顺序错误的现象 → sync.Map 的适用场景与代价、锁分片、无锁结构值不值得
- 答实的标志：LoadOrStore/atomic 或分片锁；CI 里跑 -race；知道 sync.Map 适合读多写少或 key 集合稳定的场景；能解释 Mutex 不可重入与 go vet 的 copylocks 检查

### context 与超时取消
- 阶梯：context 解决什么问题 → 派生链、Done 与 Err、WithTimeout 的资源释放（cancel 必须调用）→ 请求已经取消但下游仍在跑、context 里塞了业务参数导致的耦合、超时没有层层传递的排查 → 每层超时怎么分配、什么信息该放 context 什么不该
- 答实的标志：context 作为第一个参数贯穿；数据库、HTTP、gRPC 调用都用带 ctx 的 API；知道 context.WithoutCancel 与 AfterFunc（1.21）；提到超时预算与 deadline 传播

### GC 与内存分配
- 阶梯：Go GC 是什么类型 → 三色标记、写屏障、GC 触发条件（GOGC、GOMEMLIMIT）、mcache/mcentral/mheap 分配层次 → GC 频繁导致 CPU 高、堆内存不释放给操作系统、RSS 远大于堆的排查 → GOGC 与 GOMEMLIMIT 怎么配合，对象池与减少分配的收益边界
- 答实的标志：分配速率比堆大小更决定 GC 频率；用 pprof alloc_objects 找高频分配点；sync.Pool 复用、预分配 slice、避免小对象逃逸；容器内用 GOMEMLIMIT 防 OOM；知道 Go 1.19 后的软内存限制机制

### 逃逸分析与性能细节
- 阶梯：栈分配与堆分配的区别 → 逃逸的常见原因（返回指针、接口转换、闭包捕获、slice 扩容不确定）→ 用 -gcflags=-m 看逃逸，热点路径上的接口调用与反射开销 → 什么时候值得为逃逸优化代码，可读性与性能的边界
- 答实的标志：会看逃逸分析输出；知道接口方法调用与 fmt.Sprintf 的分配代价；strings.Builder、预分配、避免 []byte 与 string 无谓转换；用 benchmark 与 benchstat 验证

### slice、map、接口的底层与陷阱
- 阶梯：slice 的三元组、append 扩容规则、map 的桶结构 → 子 slice 共享底层数组导致的意外修改、map 遍历无序与迭代中删除、接口的 iface/eface 与 nil 接口陷阱 → 线上因为 slice 共享或 map 并发写引发的 bug 怎么定位 → 泛型（1.18+）在什么场景下比接口更合适
- 答实的标志：三索引切片或 copy；接口的类型与值两部分；map 的扩容与 GC 不回收桶的问题；泛型约束的实际用法与代码膨胀

### 错误处理与工程规范
- 阶梯：为什么 Go 不用异常 → error wrap（%w）、errors.Is/As、sentinel error 与自定义类型 → 错误信息丢失上下文、panic 在 goroutine 里没 recover 导致进程崩溃、错误被吞掉的排查 → 错误分类（可重试/不可重试/业务错误）与日志、指标、返回码的映射
- 答实的标志：wrap 带上下文但不重复；errors.As 判具体类型；panic 只用于不可恢复的编程错误；HTTP/gRPC 中间件统一 recover 与错误映射；提到 go vet、staticcheck、golangci-lint 的配置

### Web 框架与 gRPC
- 阶梯：net/http 的 Handler 模型与中间件链 → Gin/Echo/Chi 的路由与上下文，gRPC 的拦截器、流式调用、连接复用 → HTTP 连接泄漏（body 没 close）、gRPC 连接不均衡、大量 TIME_WAIT 的排查 → 内部通信 gRPC 还是 HTTP JSON，Kratos/go-zero 这类脚手架带来的约束与收益
- 答实的标志：Transport 的 MaxIdleConnsPerHost；读完并 close body；gRPC 用 headless service + 客户端负载均衡或 service mesh；超时与重试在拦截器统一配

### pprof 与性能剖析
- 阶梯：pprof 能看什么 → CPU、heap（inuse/alloc）、goroutine、block、mutex profile 各自回答什么问题，采样原理 → 线上偶发延迟抖动、内存缓慢增长、锁竞争导致吞吐上不去的定位步骤 → 持续 profiling 的成本，trace 与 pprof 的分工，PGO 的收益
- 答实的标志：区分 CPU/内存/阻塞/调度类问题各用什么 profile；trace 看 GC 停顿与调度延迟；benchmark 对比；生产环境开 pprof 端口要鉴权；知道 Go 1.21 的 PGO 可以用生产 profile 优化

### 优雅退出、配置与部署
- 阶梯：为什么要优雅退出 → 信号处理、http.Server.Shutdown、在途请求与后台 goroutine 的收尾顺序 → 滚动发布时报错、健康检查通过但服务未就绪、Kubernetes 提前摘流量的排查 → readiness 与 liveness 的设计，退出超时与数据一致性的取舍
- 答实的标志：signal.NotifyContext → 先置 not ready → 等待摘流 → Shutdown → 等待后台任务；readiness 检查依赖；多阶段构建与静态编译的镜像实践；配置用环境变量与 viper/koanf 之类并支持热加载

### 测试与代码组织
- 阶梯：table-driven test 与 testify → 接口抽象与依赖注入（wire/fx 或手写）、mock 生成、httptest → 测试不稳定（flaky）、并发测试的竞态、集成测试环境的隔离 → 包结构（internal、cmd、pkg）与分层的约定，过度设计与"Go 味"的平衡
- 答实的标志：接口由消费者定义并保持小；testcontainers 或 docker-compose 做集成测试；-race 与 -count 排查 flaky；fuzz testing 的实际使用
