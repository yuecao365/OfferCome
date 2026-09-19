---
name: backend-python
description: Python 后端怎么面：asyncio 与 GIL 并发模型、Django/FastAPI/Flask、ORM、Celery 任务队列、性能与部署。岗位或简历出现 Python/Django/FastAPI/Flask 后端时加载。
keywords: [python, django, fastapi, flask, asyncio, celery, gunicorn, uvicorn, sqlalchemy, pydantic, gil, python后端, python开发, 服务端开发, backend]
layer: stack
parent: backend
---

## 面试官在意什么

Python 后端集中在 AI 应用与算法服务、数据平台、SaaS、内容与工具类产品，以及大量创业公司与外企。日常是用 Django/FastAPI/Flask 写 API、用 SQLAlchemy 或 Django ORM 访问数据库、用 Celery 或 asyncio 处理异步任务、跑在 Gunicorn/Uvicorn 后面、部署到容器。Python 面试有一个显著特点：语言太好上手，所以"会写 Python"不值钱，面试官真正在意三件事：一是并发模型是否理解透——GIL 到底限制了什么、asyncio 与线程与进程各解决什么问题、同步代码混进异步框架会怎样；二是对框架"魔法"的理解——Django ORM 的惰性求值与 N+1、FastAPI 的依赖注入与 Pydantic 校验、中间件与生命周期；三是有没有把 Python 服务真正跑稳过——worker 数怎么定、内存为什么涨、Celery 任务丢了怎么办、慢在哪里怎么测。

校招侧重语言与基础：装饰器、生成器、上下文管理器、GIL 与多线程、可变默认参数这类语言陷阱、能否用框架写一个带鉴权与分页的 CRUD 并解释每一步。社招侧重生产问题与设计：异步服务里的阻塞调用排查、Celery 的可靠性与幂等、ORM 性能优化、Python 服务的内存与部署模型、什么时候该把热点换成 Rust/Go 扩展或独立服务。AI 公司会额外关注模型推理服务的封装（批处理、流式响应、GPU 资源隔离）与 Python 类型系统的工程化使用。

怎么问才像这个方向的面试官：
- 架构与方法论（缓存一致性、消息队列语义、限流降级）交给 backend 包，本包专注 Python 运行时、框架机制与生产运维。
- 并发模型是必考：任何 Python 后端候选人都要被问到 GIL、线程/进程/协程的选择依据，并给一个具体场景验证是否真懂。
- 框架题必须落到"魔法失效"场景：ORM 的 N+1、依赖注入的资源泄漏、Celery 的 ack 语义，而不是"介绍一下框架特点"。
- 结合项目规模与公司类型：小团队项目追工程化（类型、测试、依赖管理）；AI 公司追模型服务封装；高流量项目追部署模型与内存治理。

## 项目 / 实习怎么深挖

简历上出现下面这类经历时从哪里切、追什么。追到候选人能说出机制、数字的来源与一次真实的故障或取舍才算实；只有框架名与结论、说不出自己那一段的，记为危险信号。通用的追问方法见 project-deep-dive。

- 简历出现 FastAPI → 追 def 与 async def 怎么选、依赖注入里管了什么资源、Pydantic 版本与校验性能、部署用几个 worker
- 简历出现 Django → 追 N+1 怎么发现与解决、迁移在线上怎么跑、用了哪些 Django 自带能力而不是自己造、异步视图有没有用
- 简历出现 Celery / 任务队列 → 追 acks 策略、幂等怎么做、堆积过没有、队列怎么拆、beat 怎么防重复
- 简历出现 asyncio / aiohttp / httpx → 追阻塞调用怎么排查、并发上限怎么控、异常怎么收集、有没有 Task 丢失的坑
- 简历出现 SQLAlchemy → 追 Session 作用域、连接池与 worker 数的账、1.x 还是 2.0 风格、异步引擎的懒加载问题
- 简历出现"性能优化" → 追用 py-spy 还是 cProfile、热点是什么、换库还是改算法、前后数字
- 简历出现模型服务 / LLM API 封装 → 追流式与取消、批处理、显存与 worker 模型、超时怎么传递
- 简历出现 Gunicorn / Uvicorn / Docker 部署 → 追 worker 类型与数量依据、内存增长怎么处理、优雅重启怎么做

## 常见失守与危险信号

- GIL 与并发模型选择：认为 GIL 让 Python 完全不能并行；不知道 numpy/IO 调用会释放 GIL；把 asyncio 当成能加速 CPU 计算
- asyncio 原理与阻塞排查：async def 里直接调 requests；不知道 asyncio.create_task 需要持有引用；认为异步一定比同步快
- FastAPI 与 Pydantic：不知道 def handler 跑在线程池里；Pydantic v1 与 v2 的差别说不出；依赖注入只当参数传递用
- Django 生态与 ORM 深度：不知道 QuerySet 什么时候真正执行；for 循环里访问外键属性；迁移直接在线上跑大表加索引不看锁
- SQLAlchemy 与数据库访问：全局一个 Session 到处用；不知道 pool_pre_ping；异步 session 里访问关系属性报错不知道为什么
- Celery 与任务队列可靠性：不知道默认是 acks_early；任务参数传大对象；所有任务共用一个队列一个 worker 池
- 部署模型：Gunicorn / Uvicorn 与 worker：不知道 sync worker 一次只处理一个请求；fork 前打开了数据库连接；容器里不知道内存限制怎么和 worker 数匹配
- 性能定位与优化：只会加 print 计时；没用过 py-spy；优化不做 benchmark
- 内存管理与泄漏：认为有 GC 就不会泄漏；不知道 lru_cache 无界；不知道 C 扩展的内存不在 tracemalloc 里
- 语言特性与常见陷阱：只会背"装饰器是语法糖"；不知道 functools.wraps；类型标注写了但从不跑检查器
- 测试与项目工程化：没有锁文件；测试直接连生产数据库；不知道 fixture 的作用域
- AI / 模型服务封装（可选，AI 公司常问）：每个 worker 各加载一份模型；流式用轮询；不知道客户端断开怎么感知

## 常考主题清单

只列名字、阶梯与答实的标志，作"问到哪一层算实"的参考；问哪些、问几道由这份 JD 与这份简历定，不是配额。

### GIL 与并发模型选择
- 阶梯：GIL 是什么、限制了什么 → IO 密集与 CPU 密集下多线程、多进程、asyncio 各自的表现，GIL 切换与 C 扩展释放 GIL → 服务加了线程池吞吐反而不涨、多进程共享状态与内存拷贝问题的排查 → 什么任务该外包给进程池、C 扩展、独立服务，Python 3.13 的自由线程（free-threaded）与子解释器意味着什么
- 答实的标志：区分 IO 密集用线程/协程、CPU 密集用进程或 C 扩展；知道 fork 后共享只读内存的写时复制；提到 ProcessPoolExecutor 的序列化开销；对 3.12+ 的 per-interpreter GIL 与 3.13 实验性 no-GIL 有基本认识但不迷信

### asyncio 原理与阻塞排查
- 阶梯：协程与事件循环怎么工作 → await 的让出点、Task 与 Future、gather 与 TaskGroup、异步 IO 库（aiohttp、asyncpg、httpx）→ 异步服务里混入同步数据库驱动或 time.sleep 导致整个 loop 卡住、Task 被垃圾回收静默消失、异常没被 await 到的排查 → 什么时候该 run_in_executor、异步的收益边界与调试代价
- 答实的标志：用 loop.slow_callback_duration 或 PYTHONASYNCIODEBUG 抓阻塞；同步调用放 run_in_executor 或 anyio.to_thread；用 TaskGroup（3.11）或 gather 的 return_exceptions 管理异常；知道 uvloop 的收益与限制

### FastAPI 与 Pydantic
- 阶梯：FastAPI 与 Flask/Django 的定位差别 → 依赖注入的作用域与缓存、Pydantic v2 的校验与序列化、def 与 async def handler 的线程池行为 → 请求量上来后 Pydantic 校验成为瓶颈、依赖里打开数据库会话没关、后台任务丢失的排查 → FastAPI 适合什么规模的项目，缺少"电池"（ORM、admin、迁移）怎么补
- 答实的标志：解释 anyio 线程池的默认容量（40）；Pydantic v2 的 Rust 核心与 model_validate 性能；依赖 yield 做资源清理；BackgroundTasks 与 Celery 的适用边界；OpenAPI 自动生成与契约测试

### Django 生态与 ORM 深度
- 阶梯：Django 的请求生命周期与中间件 → QuerySet 的惰性求值、select_related/prefetch_related、事务与 atomic、信号的代价 → N+1、大表分页慢、迁移锁表、ORM 生成的 SQL 与预期不符的排查 → Django 的"全家桶"什么时候是资产什么时候是负担，DRF 与 Django Ninja 的选择，异步视图的现状
- 答实的标志：select_related 走 JOIN、prefetch_related 走 IN 查询各自的内存与 SQL 代价；only/defer 与 values 减少字段；iterator 处理大结果集；知道 Django 4.2+ 的异步 ORM 边界；迁移分离 schema 与数据、用 RunSQL 并发建索引

### SQLAlchemy 与数据库访问
- 阶梯：Core 与 ORM 的区别 → Session 的生命周期与 identity map、2.0 风格的 select、autoflush 与 expire_on_commit → 连接池耗尽、Session 跨线程共享、DetachedInstanceError、异步引擎下的懒加载报错的排查 → ORM 与原生 SQL 的边界，连接池大小怎么与 worker 数匹配
- 答实的标志：请求作用域的 Session；连接总数 = worker × (pool_size + max_overflow) 的账；异步下用 selectinload 显式加载；Alembic 迁移与版本管理；慢查询用 echo 或数据库侧日志定位

### Celery 与任务队列可靠性
- 阶梯：为什么用 Celery、Broker 与 Backend 各是什么 → acks_late、prefetch、visibility timeout、任务重试与幂等 → 任务丢失、重复执行、worker 内存持续增长、队列堆积、定时任务重复触发的排查 → Celery 与 RQ/Dramatiq/arq 或直接用 Kafka 的取舍，长任务与短任务是否该分队列
- 答实的标志：acks_late + 幂等键；Redis broker 的 visibility_timeout 与长任务的关系；按优先级与时长拆队列；worker 用 max_tasks_per_child 防内存泄漏；beat 单实例或加锁；任务结果不用 backend 存大数据

### 部署模型：Gunicorn / Uvicorn 与 worker
- 阶梯：WSGI 与 ASGI 的区别 → Gunicorn 的 pre-fork 模型、worker 类型（sync/gthread/uvicorn worker）、worker 数与超时 → 请求被 worker timeout 杀掉、内存随时间增长、fork 后数据库连接共享导致的诡异错误的排查 → 单进程多 worker 还是多容器单进程，与 Kubernetes 的资源配合
- 答实的标志：按 IO/CPU 特征选 worker 类型；preload_app 与 post_fork 钩子处理连接；max_requests 与 jitter 轮换 worker；容器里一个进程 + 水平扩容的简单模型；优雅重启与 graceful_timeout

### 性能定位与优化
- 阶梯：Python 慢在哪里 → cProfile、py-spy、Scalene、memray 各看什么，采样与插桩的区别 → 线上 CPU 高、内存缓慢增长、接口 P99 高的定位步骤，常见热点（JSON 序列化、ORM 对象构造、正则、日志）→ 什么时候优化 Python 代码、什么时候换库（orjson、pydantic v2）、什么时候上 Cython/Rust 扩展或拆服务
- 答实的标志：py-spy dump/record 直接附加到线上进程；memray 或 tracemalloc 定位内存；减少对象构造、流式响应、缓存序列化结果；用 timeit/pytest-benchmark 验证

### 内存管理与泄漏
- 阶梯：引用计数与分代 GC 的关系 → 循环引用、__del__ 的坑、内存碎片与 arena 不归还操作系统 → worker 内存持续增长但 GC 统计正常、大对象释放后 RSS 不降、缓存无上限的排查 → 是否关掉分代 GC、用 max_requests 轮换 worker 还是修根因
- 答实的标志：区分 Python 堆与 C 层内存（numpy、driver）；memray 的 native 追踪；gc.freeze 与 fork 场景；缓存加上限与 TTL；用 objgraph 或 gc.get_referrers 找循环引用

### 语言特性与常见陷阱
- 阶梯：装饰器、生成器、上下文管理器的用途 → 描述符、元类、__slots__、dataclass 与 attrs 的底层 → 可变默认参数、闭包晚绑定、浅拷贝、is 与 == 的线上 bug 排查 → 类型标注（typing、mypy/pyright）在大项目里的收益与推进成本
- 答实的标志：能写出带参数的装饰器并保留元信息；生成器做流式处理省内存；用 Protocol 做结构化类型；mypy strict 分阶段推进；提到 3.10+ 的模式匹配与 3.12 的类型参数语法

### 测试与项目工程化
- 阶梯：pytest 的 fixture 与参数化 → mock 与依赖注入、数据库测试的事务回滚、异步测试 → 测试慢、flaky、与外部服务耦合的治理 → 依赖管理（poetry/uv/pip-tools）、锁文件、镜像构建与可重复环境
- 答实的标志：单元与集成分层；testcontainers 或 factory_boy；pytest-xdist 并行；ruff + mypy + pre-commit；多阶段 Docker 构建与非 root 运行

### AI / 模型服务封装（可选，AI 公司常问）
- 阶梯：把模型封装成 API 要注意什么 → 请求批处理、流式响应（SSE）、GPU 内存与进程模型 → 单个大请求阻塞全部请求、模型加载在每个 worker 重复占显存、超时与取消不传递到推理的排查 → 自己封装还是用推理框架（vLLM、Triton、Ray Serve）
- 答实的标志：StreamingResponse 与 request.is_disconnected；单进程加载 + 队列批处理；异步推理与线程池隔离；对成熟推理框架有认识并知道自建的边界
