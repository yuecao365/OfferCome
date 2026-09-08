---
name: mobile-android
description: Android 栈特有出题：生命周期、Jetpack 与 Compose、Kotlin 协程与 Flow、性能与内存、启动与构建发布。岗位或简历出现 Android/Kotlin 时加载；通用题在 parent 包 mobile 里。
keywords: [android, 安卓, kotlin, jetpack, compose, coroutines, 协程, flow, viewmodel, hilt, gradle, art, binder, recyclerview, android开发]
layer: stack
parent: mobile
---

## 岗位职责与考察重点

Android 工程师的日常是在 Kotlin 与 Jetpack 体系里写业务页面与架构层：Activity/Fragment 或 Compose 页面、ViewModel 与状态流、协程管理异步、Room/DataStore 存储、Hilt 注入、Gradle 多模块构建、适配从 Android 8 到最新版本以及各家厂商 ROM 的差异。真实面试里 Android 题的分水岭在"系统为什么这样设计"：能背出生命周期回调顺序的人很多，能解释配置变更时 ViewModel 为什么能活下来、Fragment 的 viewLifecycleOwner 为什么存在、协程作用域为什么和生命周期绑定的人少。面试官最在意三件事：一是对系统机制的真实理解（生命周期与进程、消息循环与主线程、Binder 与四大组件、ART 与内存），二是协程与 Compose 这两套新范式的心智模型是否正确（结构化并发、异常传播、重组与稳定性），三是线上问题的排查闭环（ANR、OOM、卡顿、启动、包体各自的工具与归因方法）。

校招侧重四大组件、生命周期、Handler 机制、View 绘制与事件分发、Kotlin 语言特性、协程基本用法与 RecyclerView；社招侧重架构分层与模块化、Compose 落地经验与性能坑、协程异常与取消的工程实践、启动与包体的量化治理、ANR 与 OOM 的归因、Gradle 构建提速、以及厂商 ROM 与新版本适配的踩坑。一线大厂通常还有"手撕算法 + 系统原理 + 项目深挖"的固定结构，这个包负责系统原理与项目深挖里的 Android 特有部分。

## 主题

### Activity 与 Fragment 生命周期
- 阶梯：Activity 生命周期回调顺序、A 跳 B 时两者的回调交错 → 配置变更（旋转、语言、深色模式）时的重建流程与 onSaveInstanceState、Fragment 的两套生命周期（自身与 View）、启动模式与任务栈 → 旋转后数据丢失或页面重复、Fragment 里 LiveData 观察导致多次回调、进程被杀后重建时 Intent 里的大对象崩溃怎么定位 → 用 ViewModel 还是 savedStateHandle 保存状态的取舍，单 Activity 多 Fragment 架构的收益与导航复杂度
- 好题：一个 Fragment 在 onCreateView 里用 `this` 观察 LiveData，切换 tab 再回来后同一个更新回调触发了两次，请解释原因与正确写法；为什么 Android 要给 Fragment 单独设计 viewLifecycleOwner？
- 危险信号：只背回调顺序说不出配置变更时哪些对象被销毁；不知道 ViewModel 在配置变更时是怎么存活的；把 Fragment 生命周期与其 View 生命周期混为一谈
- 期望信号：能说出 ViewModelStore 通过 NonConfigurationInstances 传递；区分 ViewModel 与 savedStateHandle 各自能扛住什么（配置变更 vs 进程被杀）；知道 TransactionTooLargeException 的来源；对 launchMode 与 Intent flag 有实际场景

### Handler、Looper 与主线程模型
- 阶梯：为什么子线程不能更新 UI、Handler 的基本用法 → MessageQueue 的阻塞与唤醒（epoll）、同步屏障与异步消息、IdleHandler、主线程 Looper 与 ActivityThread 的关系 → 主线程卡住导致 ANR 怎么用 trace 找到哪条消息耗时，Handler 内存泄漏的根因 → 用 Handler 做延迟任务与协程 delay 的取舍，消息调度框架（如启动阶段插队渲染消息）的收益与侵入性
- 好题：ANR trace 显示主线程正在执行一个看起来很轻的方法，但 ANR 是超过 5 秒才发生的，为什么堆栈可能具有误导性？你会怎么找到真正堆积在消息队列里的耗时任务？
- 危险信号：说 Looper.loop 是死循环所以会卡；不知道同步屏障；ANR 只会看最后堆栈
- 期望信号：理解 loop 阻塞在 nativePollOnce 不耗 CPU；知道 Choreographer 通过异步消息保证渲染优先；有主线程消息监控（打印 dispatch 耗时）的经验；能说出 ANR 的多种根因（主线程忙、锁等待、Binder 调用、CPU 抢占）

### View 绘制、事件分发与自定义 View
- 阶梯：measure/layout/draw 三步与 MeasureSpec → ViewRootImpl 与 vsync 的驱动、硬件加速与 RenderThread、事件分发的 dispatch/intercept/onTouch 链条 → 嵌套滑动冲突（ViewPager 里的 RecyclerView、下拉刷新与列表）怎么定位与解决，自定义 View 在 wrap_content 下显示异常的原因 → 自定义 View 与组合现有控件的取舍，过度绘制与层级优化的收益衰减点
- 好题：横向 ViewPager2 里嵌套竖向 RecyclerView，用户斜着滑动时页面经常"抢方向"，你会在哪一层处理？内部拦截和外部拦截各自适合什么场景？NestedScrolling 机制能帮上忙吗？
- 危险信号：只能背"事件先到 Activity 再到 ViewGroup"；不知道 requestDisallowInterceptTouchEvent；自定义 View 不处理 wrap_content
- 期望信号：能画出一次触摸从 InputDispatcher 到 View 的路径；区分内外拦截法并知道各自缺陷；知道 invalidate 与 requestLayout 触发的范围差异；对 Layout Inspector 与过度绘制工具有实践

### Jetpack Compose 心智模型与性能
- 阶梯：Compose 与 View 体系的根本区别、声明式 UI 是什么 → 重组（recomposition）的触发条件与跳过机制、状态提升、remember 与 rememberSaveable、稳定性（Stable/Immutable）与 lambda 捕获 → 列表滑动时整个页面反复重组怎么用 Layout Inspector 或编译器报告定位（不稳定参数、读状态位置过高、lambda 每次新建）→ Compose 与 View 混用的迁移策略，Compose 的首帧与包体代价，什么页面暂时不适合迁
- 好题：一个 Compose 列表页每次滚动时 Layout Inspector 显示顶部标题栏也在重组，可能的原因有哪几类？把列表数据类型从 List 改成 ImmutableList 或加 @Immutable 分别解决什么？什么情况下你会选择不修？
- 危险信号：把重组当成"整个页面重新画"；不知道稳定性推断规则；在 Composable 里直接做耗时计算或创建对象；用 Compose 却仍然用 View 的思路存状态在组件里
- 期望信号：区分组合、布局、绘制三个阶段并知道状态读取延迟到哪一阶段能减少重组；知道 derivedStateOf 与 key 的用途；有编译器稳定性报告或强跳过模式的实践；对 LazyColumn 的 key 与 contentType 有认识

### Kotlin 协程与结构化并发
- 阶梯：协程和线程的区别、suspend 函数是什么 → 协程作用域与 Job 树、异常传播规则（普通 Job 与 SupervisorJob、CoroutineExceptionHandler 生效位置）、取消是协作式的、Dispatchers 的选择 → 子协程抛异常导致整个页面所有请求被取消，或者协程取消后网络请求还在跑、withContext 里捕获了 CancellationException 导致取消失效怎么排查 → viewModelScope/lifecycleScope 的边界，全局作用域的适用场景，协程与 RxJava/线程池混用时的取舍
- 好题：ViewModel 里 `viewModelScope.launch` 同时发三个请求，其中一个抛了异常，另外两个也被取消了，请解释原因；用 async + try/catch 为什么可能不够？你会怎么设计让部分失败不影响整体？
- 危险信号：认为 try/catch 包住 launch 就能捕获异常；不知道 SupervisorJob；在协程里捕获所有异常包括 CancellationException；到处 GlobalScope
- 期望信号：能画出 Job 树与异常向上传播路径；知道 coroutineScope 与 supervisorScope 的区别；理解取消需要挂起点检查（ensureActive、isActive）；有把回调式 API 转协程（suspendCancellableCoroutine）并处理取消的经验

### Flow、StateFlow 与 UI 状态
- 阶梯：Flow 与 LiveData 的差别、冷流与热流 → StateFlow 与 SharedFlow 的语义（replay、粘性、去重）、collect 与生命周期（repeatOnLifecycle）、操作符与背压 → 从后台回到前台事件被重复消费或丢失、StateFlow 相同值不触发更新导致刷新失效、collect 在后台仍然消耗资源怎么定位 → 单一 UiState 与多流拆分的取舍，事件（一次性）与状态（可重放）的建模方式与各自的坑
- 好题：页面用 SharedFlow 发"跳转到登录页"事件，用户旋转屏幕后又跳了一次，或者在后台时事件丢了，分别是什么原因？你会怎么建模一次性事件，Channel、SharedFlow(replay=0)、把事件放进 UiState 各有什么问题？
- 危险信号：分不清冷流热流；在 onCreate 里直接 lifecycleScope.launch { collect }；认为 StateFlow 是 LiveData 的替代品就完了
- 期望信号：知道 repeatOnLifecycle 与 flowWithLifecycle 的用途；理解 StateFlow 的 distinctUntilChanged 语义；对一次性事件的建模有明确主张与理由；知道 stateIn 的 WhileSubscribed 超时含义

### 内存、GC 与 OOM 排查
- 阶梯：Java 堆、Native 堆与虚拟内存的区别、OOM 常见触发 → ART 的 GC 类型与触发时机、Bitmap 内存的位置演变、大对象与内存抖动、LeakCanary 的原理（弱引用 + GC 后检查）→ 线上 OOM 堆栈在 Bitmap 分配处但真正原因是泄漏累积怎么归因、Native 内存涨（如 WebView、图片库、SO）用什么工具 → 图片缓存池大小与显示质量的取舍，Hprof 线上采集的代价，内存监控的采样策略
- 好题：线上 OOM 堆栈全部指向图片库解码处，但本地复现不了，你会怎么设计线上采集与归因？怎么区分是泄漏累积、图片尺寸过大还是虚拟内存耗尽（32 位）？
- 危险信号：认为 OOM 堆栈处就是元凶；不知道 Bitmap 内存在 Native 还是 Java 堆；只会说"用 LeakCanary"不会读 Hprof
- 期望信号：能读 MAT/Profiler 的支配树与 GC Root 路径；知道线程数、FD 数也会导致 OOM；有线上 Hprof 裁剪上传的经验；理解 inSampleSize 与显示尺寸匹配

### ANR 与卡顿治理
- 阶梯：ANR 的触发条件与类型（输入、广播、Service）→ ANR 的采集机制（traces、SIGQUIT）、系统负载与 CPU 抢占的影响、Choreographer 帧回调与掉帧统计 → 线上 ANR 率高但 trace 大多在 nativePollOnce 或者堆栈五花八门怎么归因（历史消息、锁竞争、Binder 阻塞、低端机 CPU）→ 卡顿监控的采样开销与精度，ANR 治理的 ROI 与业务优先级
- 好题：ANR 平台显示 40% 的 ANR 主线程堆栈停在 nativePollOnce，这说明什么？你会怎么补充采集才能找到真正的根因？主线程 Binder 调用被卡在 system_server 里该怎么办？
- 危险信号：只会看 ANR 时刻堆栈；不知道 ANR 有类型区分；认为所有卡顿都是主线程做耗时操作
- 期望信号：区分主线程忙碌与主线程等待；有慢消息、锁等待、Binder 耗时的监控；知道 ApplicationExitInfo 可以拿到 ANR trace；对厂商 ROM 差异有认识

### 启动优化与 Application 初始化
- 阶梯：冷启动流程（zygote fork、Application、Activity 首帧）与 reportFullyDrawn → 类加载与验证、ContentProvider 自动初始化的坑、App Startup 库、主线程 IO 与锁 → 启动耗时归因用 Perfetto/Systrace 看主线程时间线，发现是某 SDK 在 ContentProvider 里初始化、或者首页布局 inflate 太慢怎么处理 → 延迟初始化引发"首页某功能第一次点击慢"的风险，Baseline Profile 与 R8 的收益，启动任务框架的维护成本
- 好题：Perfetto 显示冷启动主线程有 600ms 在 Application 之前就耗掉了，可能是什么？你会怎么处理 SDK 塞在 ContentProvider 里的初始化？Baseline Profile 能带来多少收益、怎么验证？
- 危险信号：不知道 ContentProvider 在 Application.onCreate 之前初始化；启动优化只会"把初始化放到子线程"；没有 Perfetto 的实践
- 期望信号：能读 Perfetto 主线程 slice；有启动任务有向图与线程调度框架；知道 Baseline Profile、启动闪屏 API 的用法；启动指标有线上采集与版本对比

### 存储、Room 与数据层
- 阶梯：SharedPreferences/DataStore/Room/文件各存什么、SP 的坑 → Room 的编译期校验、迁移、与 Flow 的集成、事务与线程、WAL → 升级后崩溃在 Migration、SP 在主线程 apply 导致 ANR（commitToMemory 等待）、数据库锁冲突怎么排查 → Room 与手写 SQLite/其他 ORM 的取舍，数据库加密的性能代价，Repository 层的缓存策略
- 好题：应用升级后一批用户在启动时崩溃，堆栈在 Room 打开数据库处，可能是什么原因？你会怎么设计数据库迁移的测试与兜底（fallbackToDestructiveMigration 的代价是什么）？
- 危险信号：所有配置存 SP 且不知道 SP 的 ANR 问题；Room 迁移没有测试；在主线程查库
- 期望信号：知道 SP 的加载与 apply 机制；有 MigrationTestHelper 的实践；理解 WAL 对并发读写的影响；能说出 DataStore 解决了 SP 什么问题

### Binder、四大组件与系统交互
- 阶梯：四大组件各自用途、Intent 显式与隐式 → Binder 的一次拷贝原理与 1MB 限制、AIDL 的 oneway 与线程池、Service 的前台限制、广播的注册方式与后台限制 → 跨进程传大对象崩溃、后台 Service 被系统限制无法启动、进程保活手段失效怎么处理 → 多进程架构的收益与内存/复杂度代价，WorkManager 与前台服务的选择，与厂商白名单的关系
- 好题：你的 App 需要在后台持续上传日志，从 Android 8 到 14 各版本上你的方案要怎么变化？前台服务、WorkManager、JobScheduler 各适合什么？为什么进程保活越来越不可行？
- 危险信号：不知道 Binder 传输大小限制；认为后台 Service 可以随便起；把保活当正当手段
- 期望信号：能说出 Binder 通过 mmap 减少拷贝；知道前台服务类型声明的要求；理解 Doze 与应用待机分组；对多进程的初始化重复与 SP 跨进程问题有认识

### Gradle 构建、混淆与发布
- 阶梯：Gradle 的配置阶段与执行阶段、模块依赖的 api 与 implementation → 构建缓存与增量、KSP 与 kapt 的差异、R8 的混淆与优化、构建变体与 Product Flavor → 全量编译 15 分钟怎么归因（build scan、配置阶段耗时、kapt、模块粒度），混淆后反射崩溃或序列化失败怎么定位 → 单仓多模块的依赖治理与编译隔离，AAB 与动态功能模块的收益与限制，构建脚本迁移到 Kotlin DSL 与版本目录的成本
- 好题：团队反馈全量编译要 15 分钟、改一行代码增量也要 2 分钟，你会怎么用 build scan 归因？把 kapt 迁到 KSP、拆模块、开配置缓存分别能解决什么？
- 危险信号：分不清 api 与 implementation 对重编范围的影响；混淆规则靠"全部 keep"；没看过构建耗时报告
- 期望信号：知道配置缓存与构建缓存的区别；有 kapt 到 KSP 的迁移经验；能读 mapping 文件还原堆栈；对 R8 全模式的优化与风险有认识

### 版本适配与厂商差异
- 阶梯：targetSdk 升级的意义与商店要求 → 近几年主要行为变更（后台限制、权限拆分、通知权限、隐式 Intent 限制、隐私沙盒）、厂商 ROM 的自定义限制 → 升级 targetSdk 后某功能在特定版本失效、某厂商机型崩溃或功能受限怎么排查与兼容 → 新特性与兼容负担的权衡，最低支持版本的决策依据
- 好题：把 targetSdk 从 30 升到 34，你会怎么排查项目里可能受影响的点？照片选择、前台服务类型、精确闹钟、广播接收器导出标志这些变化分别怎么处理？
- 危险信号：不知道 targetSdk 与 compileSdk 的区别；升级 targetSdk 直接改数字不做梳理；对厂商差异只会说"适配一下"
- 期望信号：有行为变更清单与灰度验证流程；知道兼容性框架开关可以提前测试；对厂商差异有具体案例（后台限制、通知、权限）

## 好题 / 坏题对比

- 坏：说说 Activity 的生命周期。
- 好：Fragment 在 onCreateView 里用 this 观察 LiveData，切换 tab 再回来后同一个更新回调触发两次，请解释原因、正确写法，并说明 Android 为什么要给 Fragment 单独设计 viewLifecycleOwner；如果换成 Flow + repeatOnLifecycle 这个问题还存在吗？

- 坏：协程和线程有什么区别？
- 好：viewModelScope.launch 里同时发三个请求，一个抛异常后另外两个也被取消，请解释 Job 树里发生了什么；用 async + try/catch 为什么可能不够？你会怎么让部分失败不影响整体、同时又能在用户离开页面时全部取消？

- 坏：Compose 的重组是什么？
- 好：Compose 列表滚动时顶部标题栏也在重组，可能的原因有哪几类？把数据改成 ImmutableList 或加 @Immutable 分别解决什么？读状态的位置怎么影响重组范围？什么情况下你会选择不修？

## 项目结合钩子

- 简历出现 Compose 迁移 / Compose 项目 → 追迁了哪些页面、没迁的原因、重组性能问题怎么定位、与 View 混用的边界、包体与首帧代价
- 简历出现协程 / Flow 架构 → 追异常处理策略、取消传播、一次性事件怎么建模、有没有出过"部分失败取消全部"或事件丢失的问题
- 简历出现"启动优化 X%" → 追测量点（首帧还是 reportFullyDrawn）、Perfetto 归因过程、启动任务框架怎么调度、延迟初始化引发的风险
- 简历出现"ANR 率 / 崩溃率下降" → 追 top 根因类型、采集补充了什么、厂商机型差异、用了什么开关与灰度
- 简历出现 OOM / 内存优化 → 追 Hprof 分析过程、图片库缓存策略、线程数与 FD 泄漏有没有查过、线上采集方案
- 简历出现模块化 / 组件化 / 构建提速 → 追模块划分、api/implementation 治理、编译时间前后数字、kapt/KSP 迁移
- 简历出现自定义 View / 复杂动画 → 追滑动冲突怎么解决、绘制性能怎么测、硬件加速的限制
- 简历出现 targetSdk 升级 / 厂商适配 → 追具体行为变更清单、灰度验证方式、遇到的最难兼容问题

## 出题原则

- 每个系统机制题都追"系统为什么这么设计"：生命周期、Handler、Binder、后台限制，能背回调但说不出设计动机的要标记。
- 协程与 Compose 是当前最能区分深度的两块：题目从"异常把兄弟协程取消了""不该重组的组件重组了"这类真实 bug 切入，让候选人解释模型。
- 性能题必须落到工具与数字：Perfetto、Layout Inspector、Profiler、build scan 的实际使用经验是社招硬门槛，只说"放子线程""减少嵌套"的要追工具。
- 不考版本时效：不问"Android 15 新增了什么 API"，考的是行为变更的排查方法与兼容思路；平台无关的启动、包体、灰度、跨端题交给 parent 包 mobile。
