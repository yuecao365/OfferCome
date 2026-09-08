---
name: mobile-ios
description: iOS 栈特有出题：Swift 与内存管理、UIKit/SwiftUI、并发与 Combine、Runtime、性能与卡顿、生命周期与发布。岗位或简历出现 iOS/Swift 时加载；通用题在 parent 包 mobile 里。
keywords: [ios, swift, objective-c, swiftui, uikit, combine, swift concurrency, async await, runtime, arc, xcode, cocoapods, spm, ios开发, 苹果]
layer: stack
parent: mobile
---

## 岗位职责与考察重点

iOS 工程师的日常是在 Swift（老项目里还有大量 Objective-C）和 Apple 的框架体系里写业务：UIKit 或 SwiftUI 页面、ViewModel 与状态流、用 async/await 或 Combine 管异步、Core Data/SQLite/文件做存储、Xcode 工程与依赖管理（SPM/CocoaPods）、走 App Store 审核与 TestFlight 灰度。真实面试里 iOS 题的分水岭在内存与运行时：能背出 ARC 是引用计数的人很多，能解释为什么某个闭包会泄漏、weak 和 unowned 在什么场景下会崩、Swift 的值类型写时复制怎么影响性能的人少；能说 SwiftUI 是声明式的人很多，能解释 @State 与 @StateObject 的存储位置差异、为什么视图会意外重建的人少。面试官最在意三件事：一是对内存与运行时的真实理解（ARC、循环引用、autoreleasepool、方法派发、Runtime 消息转发），二是并发模型的正确心智（GCD 的队列语义、Swift Concurrency 的 actor 隔离与结构化取消、主线程约束），三是线上问题的排查闭环（卡顿、崩溃、OOM、启动、包体各自的 Instruments 用法与归因）。

校招侧重 Swift 语言特性、ARC 与循环引用、UIKit 基础（视图层级、AutoLayout、UITableView 复用）、GCD 基本用法、Runtime 基本概念；社招侧重 SwiftUI 落地与混编、Swift Concurrency 的迁移与坑、性能归因（Instruments 各模板）、启动与包体的量化治理、模块化与依赖管理、App Store 审核与灰度实践、Objective-C 与 Swift 混编的边界。一线大厂的 iOS 面试常有"手撕算法 + 语言与运行时 + 项目深挖"结构，这个包负责语言、运行时与项目深挖里的 iOS 特有部分。

## 主题

### ARC、循环引用与内存语义
- 阶梯：ARC 是什么、strong/weak/unowned 的区别 → 引用计数在 Swift 里的实现（side table、弱引用归零）、闭包捕获列表的语义、autoreleasepool 在 Swift 里什么时候还需要 → 页面 pop 后 deinit 不调用怎么用 Memory Graph Debugger 或 Instruments Leaks 找到持有环，Timer、NotificationCenter 闭包、delegate 强引用各自的泄漏形态 → weak 与 unowned 的性能与安全取舍，什么情况下值得用 unowned，闭包捕获 self 的规范怎么在团队落地
- 好题：一个 ViewController 里用 `Timer.scheduledTimer(withTimeInterval:repeats:) { _ in self.tick() }` 后页面关闭 deinit 不调用，请解释持有链；改成 `[weak self]` 后还需要做什么？为什么有些场景用 `[unowned self]` 会崩？
- 危险信号：只会说"闭包里加 weak self"却说不出持有环是谁持有谁；不知道 Timer 被 RunLoop 持有；认为 Swift 不需要 autoreleasepool；把 weak 加在所有闭包上包括非逃逸的
- 期望信号：能画出完整持有链（RunLoop → Timer → 闭包 → self）；知道 invalidate 才能解除；理解 unowned 在对象释放后访问会崩；有 Memory Graph 或 Leaks 的实际定位经验；知道循环里创建大量临时对象要用 autoreleasepool

### Swift 语言特性与性能
- 阶梯：值类型与引用类型、struct 与 class 的选择 → 写时复制（COW）的实现与触发、协议与泛型的派发（存在容器、见证表、特化）、方法派发方式（静态、表、消息）→ 一个数组在循环里被反复修改导致大量拷贝、协议类型数组性能远差于泛型怎么归因 → 值语义带来的安全与拷贝成本的权衡，什么时候该用 final/private 帮助编译器优化，泛型特化与二进制体积的关系
- 好题：一个函数接收 `[any Shape]` 并遍历计算面积，性能比接收泛型 `[T: Shape]` 差很多，请解释原因；把 struct 数组传给函数后在函数内修改会发生什么？怎么避免不必要的拷贝？
- 危险信号：只会背"struct 在栈上 class 在堆上"；不知道存在容器（existential container）的开销；说不出 final 对派发的影响
- 期望信号：能说出 COW 在 isKnownUniquelyReferenced 上的判断；理解存在容器的间接层与内联缓冲区；知道 @inlinable 与模块边界对优化的限制；对 Swift 6 的严格并发检查对值类型的影响有认识

### UIKit 视图体系与布局
- 阶梯：视图层级、frame 与 bounds、AutoLayout 基本用法 → 布局引擎的约束求解与 layoutSubviews 时机、UITableView/UICollectionView 的复用与自适应高度、Compositional Layout 与 Diffable Data Source → 列表滚动掉帧怎么用 Instruments 的 Core Animation 或 Time Profiler 定位（约束过多、离屏渲染、主线程解码、自动高度反复计算），cell 复用导致内容错乱怎么修 → 手写 frame 与 AutoLayout 的取舍，预计算高度的收益与维护成本，Diffable 与手动 reload 的选择
- 好题：一个图文信息流在 iPhone SE 上滚动明显掉帧，Time Profiler 显示主线程在约束求解上花了很多时间，你有哪几层修法？为什么圆角加阴影会导致离屏渲染、怎么避免？
- 危险信号：不知道 layoutSubviews 与 setNeedsLayout 的关系；cell 复用不 prepareForReuse；把所有卡顿归结为"图片太大"
- 期望信号：能读 Core Animation 模板的离屏渲染与颜色混合标记；有预计算布局或缓存高度的经验；知道 Diffable 的 hash 与 identity 要求；理解自动高度的估算与真实高度的关系

### SwiftUI 状态与视图更新
- 阶梯：SwiftUI 与 UIKit 的根本区别、@State 是什么 → 属性包装器各自的存储位置与生命周期（@State/@StateObject 由 SwiftUI 持有、@ObservedObject 由外部持有）、视图身份（identity）与 body 重新计算、Observation 框架带来的变化 → 视图在父视图刷新时被意外重建导致状态丢失、@ObservedObject 传参导致对象反复创建、列表滚动时全部行重新计算怎么定位（Self._printChanges、Instruments SwiftUI 模板）→ SwiftUI 与 UIKit 混编的边界（UIViewRepresentable 的坐标与生命周期），什么页面不适合 SwiftUI，最低系统版本对 API 可用性的限制
- 好题：一个子视图用 `@ObservedObject var vm = ViewModel()` 初始化，每次父视图刷新它的数据就被重置，请解释原因与正确写法；@State、@StateObject、@ObservedObject 分别由谁持有？Observation 框架（@Observable）解决了什么问题？
- 危险信号：分不清 @StateObject 与 @ObservedObject；认为 body 重新计算等于重新渲染整棵视图树；不知道视图身份的概念
- 期望信号：能说出 SwiftUI 的视图是值、状态存在框架的存储里；知道结构化身份与显式 id 对动画和状态的影响；有 _printChanges 或 Instruments 定位过度更新的经验；对 @Observable 的按属性依赖追踪有认识

### GCD、锁与线程安全
- 阶梯：串行与并发队列、sync 与 async、主队列 → 死锁的形成（主队列 sync）、DispatchGroup/Semaphore/barrier、QoS 与优先级反转、常用锁（os_unfair_lock、NSLock、读写锁）的性能与语义 → 偶现崩溃在多线程访问数组或字典、数据竞争导致数据错乱怎么用 Thread Sanitizer 定位，并发队列里大量任务导致线程爆炸怎么处理 → 全局并发队列与自建队列的取舍，锁的粒度与性能，什么时候该转向 actor
- 好题：一个缓存类用并发队列 + barrier 实现读写，线上仍然偶现崩溃在读取处，你会怀疑哪些原因？Thread Sanitizer 怎么用？为什么"Swift 的 Array 不是线程安全的"这个说法在写时复制下尤其危险？
- 危险信号：认为 async 就一定开新线程；不知道 QoS 与优先级反转；把 semaphore 当万能同步工具并在主线程 wait
- 期望信号：理解队列与线程的关系（队列不等于线程）；知道 barrier 只在自建并发队列有效；有 TSan 的实际使用；能说出线程爆炸的原因（并发队列上大量阻塞任务）

### Swift Concurrency 与 actor
- 阶梯：async/await 相比闭包回调解决什么、Task 是什么 → 结构化并发（子任务与取消传播）、actor 的隔离与重入、MainActor、Sendable 与数据竞争检查、协作式线程池 → 用 Task 发请求后页面关闭请求还在跑、actor 方法里 await 之后状态被别人改了（重入）、把同步阻塞代码放进 async 导致线程池饿死怎么排查 → 从 GCD/闭包迁移到 Swift Concurrency 的策略，Swift 6 严格并发检查的迁移成本，何时保留 GCD
- 好题：一个 actor 管理账户余额，方法里先 `await` 查询汇率再扣款，并发调用后余额出现负数，请解释 actor 重入是怎么导致的、怎么修？为什么 actor 不等于锁？
- 危险信号：认为 actor 就是自动加锁；不知道 await 是潜在挂起点、actor 状态在挂起期间可能变化；在 async 函数里调用 semaphore.wait 或 sleep；Task 没有取消处理
- 期望信号：能说出 actor 重入的语义与防护（挂起前检查状态或用状态机）；理解结构化并发的取消是协作式的（Task.checkCancellation）；知道协作式线程池数量约等于核数、阻塞会饿死；有把 delegate/闭包 API 桥接为 async（withCheckedContinuation）并处理取消的经验

### Combine 与响应式数据流
- 阶梯：Publisher/Subscriber/Operator 的基本关系 → 背压与 demand、Subject 的种类、订阅生命周期与 AnyCancellable、调度器与线程切换 → 页面 pop 后订阅还在回调、@Published 在 willSet 时机导致读到旧值、Combine 链里错误导致整条流终止怎么排查 → Combine 与 async/await 的分工，什么场景 Combine 仍然值得用（多源合并、去抖），迁移成本
- 好题：一个搜索框用 Combine 做去抖与请求，快速输入后结果顺序错乱且偶尔请求失败后整个搜索功能失效，分别是什么原因、怎么修？为什么很多人建议用 switchToLatest？
- 危险信号：不知道 Cancellable 要持有；认为 @Published 是在 didSet 发送；错误处理靠 catch 后就不管流终止了
- 期望信号：知道 flatMap 与 switchToLatest 在竞态上的差异；错误用 replaceError 或 catch 后重启流；理解 receive(on:) 与 subscribe(on:) 的区别；对 Combine 与 AsyncSequence 的选择有判断

### Runtime、方法派发与 Objective-C 互操作
- 阶梯：Objective-C 的消息发送与 Swift 的派发差异 → objc_msgSend、方法缓存、消息转发三阶段、KVO 的 isa-swizzling 原理、@objc dynamic 的作用 → Method Swizzling 导致的偶现崩溃或行为异常怎么排查（多次交换、分类冲突、hook 系统方法的兼容），Swift 类被 OC 调用时找不到方法的原因 → Swizzling 用于埋点与无痕修复的收益与维护风险，混编项目里桥接头与模块化的取舍，OC 老代码迁 Swift 的策略
- 好题：你用 Method Swizzling 给所有 ViewController 的 viewDidAppear 加埋点，上线后某些页面埋点重复或崩溃，可能的原因有哪几类？为什么建议在 +load 里用 dispatch_once 做交换？Swift 的纯类方法能不能被 swizzle？
- 危险信号：能背消息转发三阶段但说不出实际用途；不知道 Swift 方法默认不走消息机制；swizzle 时不处理"方法只在父类实现"的情况
- 期望信号：理解 class_addMethod 与 method_exchangeImplementations 的组合；知道 KVO 派生子类的原理与 Swift 的 KVO 限制；对 Swizzling 的替代方案（子类、协议扩展、AOP 库）有判断

### 性能分析与卡顿监控
- 阶梯：Instruments 常用模板各看什么（Time Profiler、Allocations、Leaks、Core Animation、Hangs）→ 主线程 RunLoop 的观察点与卡顿检测原理（RunLoop 状态超时 + 抓栈）、离屏渲染与图层混合、MetricKit 的能力 → 线上卡顿率高但本地跑不出来怎么用 MetricKit 与自研卡顿监控的堆栈归因，App Hang 的常见根因（主线程 IO、锁、同步网络、大量 AutoLayout）→ 卡顿监控的采样开销与堆栈聚合策略，修哪些卡顿的 ROI 最高
- 好题：线上卡顿监控显示某页面 Hang 率高，堆栈大多停在 CoreData 的 fetch 上，你会怎么确认是主线程查库还是锁等待？修法有哪几层？MetricKit 的 hang 诊断和自研监控各有什么优缺点？
- 危险信号：只会 Time Profiler 不会 Core Animation 模板；不知道 RunLoop 观察者可以做卡顿监控；线上没有任何卡顿数据
- 期望信号：能说出基于 RunLoop 的卡顿检测原理与误报处理；知道 MetricKit 的采集延迟与采样限制；有 Time Profiler 火焰图归因经验；理解主线程 IO 与锁等待在堆栈里的表现差异

### 崩溃、符号化与线上稳定性
- 阶梯：崩溃类型（Objective-C 异常、信号、watchdog、OOM）与采集方式 → 符号化流程（dSYM、UUID 匹配）、Mach 异常与 Unix 信号的关系、崩溃收集 SDK 的原理与多 SDK 冲突 → 崩溃堆栈符号化失败、堆栈在系统库里、OOM 无堆栈怎么归因（内存水位采集、前台 OOM 判定），watchdog 超时（0x8badf00d）在启动阶段怎么查 → 崩溃率与业务迭代的博弈，热修复在 iOS 的可行性与审核风险，崩溃防护（NSException 兜底、数组越界拦截）的副作用
- 好题：新版本上线后 OOM 类崩溃占比明显上升但没有堆栈，你怎么判定是前台 OOM 并定位到具体页面？为什么多个崩溃收集 SDK 同时存在会导致部分崩溃丢失？
- 危险信号：不知道 dSYM 与 UUID 的对应；认为 OOM 可以像普通崩溃一样抓堆栈；用"崩溃防护"库吞掉所有异常并引以为豪
- 期望信号：能说出 FOOM 的判定方法（排除法）；理解信号处理器链的先后关系；有 watchdog 与启动超时的处理经验；对崩溃防护的适用范围有克制的判断

### App 生命周期、后台与系统交互
- 阶梯：App 状态（active/inactive/background/suspended）与 AppDelegate/SceneDelegate 回调 → 后台执行时间、Background Tasks 框架、推送与静默推送、状态保存与恢复、多 Scene → 用户切后台再回来页面白屏或数据错乱、后台任务被系统终止、推送不到达怎么排查 → 后台能力的申请与审核，保活的边界与用户信任，Scene 支持的改造成本
- 好题：App 需要在后台完成一批照片上传，iOS 上你有哪些手段？各自能拿到多长时间、什么条件下会被终止？被终止后怎么续传？
- 危险信号：认为后台可以随便跑任务；不知道 beginBackgroundTask 有超时；对 BGTaskScheduler 的调度不确定性没概念
- 期望信号：区分短时后台任务与 BGProcessingTask；知道 URLSession 后台会话可以跨进程续传；理解 suspended 与被杀的差异；对 SceneDelegate 与多窗口有认识

### 启动优化与包体积
- 阶梯：冷启动阶段划分（pre-main 与 main 之后）、pre-main 里有什么（dyld 加载、rebase/bind、+load、静态初始化）→ dyld 3/4 的闭包缓存、动态库数量的影响、Order File 与二进制重排（Page Fault）、Link Map 分析包体 → 启动时间涨了 300ms 怎么用 DYLD_PRINT_STATISTICS 或 Instruments App Launch 归因，包体涨了 20MB 怎么用 Link Map 归因到模块与 SDK → 动态库合并为静态库的收益与工程改造成本，二进制重排的收益衰减，资源按需加载（On-Demand Resources）的运维代价
- 好题：App Launch 模板显示 pre-main 阶段占了 800ms，你会怀疑哪些原因？动态库从 30 个合并到 5 个能省多少、代价是什么？二进制重排的原理与验证方法是什么？
- 危险信号：不知道 pre-main 阶段存在；启动优化只会"把初始化放到后面"；没有 Link Map 分析经验
- 期望信号：能说出 dyld 加载流程与各阶段耗时来源；知道 +load 与静态初始化的代价；有 Link Map 或第三方工具分析包体的经验；对 App Thinning、资源压缩、Swift 泛型特化对体积的影响有认识

### 依赖管理、工程化与发布
- 阶梯：CocoaPods 与 SPM 的区别、Xcode 工程与 workspace → 静态库与动态库、模块化（framework 划分、模块间接口）、Xcode 编译耗时归因（-Xfrontend -warn-long-function-bodies、build timeline）、xcconfig 与多环境 → 编译时间 20 分钟怎么归因（Swift 类型推断、模块粒度、依赖图），SPM 依赖版本冲突怎么解决 → 单仓多 framework 与多仓的取舍，CI 上的编译缓存方案，App Store 审核被拒的常见原因与灰度（TestFlight、分阶段发布）的策略
- 好题：全量编译 20 分钟、增量也要几分钟，你会怎么定位是哪些文件或类型推断在耗时？把项目拆成多个 framework 后为什么有时反而更慢？CI 上你怎么做编译缓存？
- 危险信号：分不清静态库与动态库对启动与包体的影响；从没看过 build timeline；SPM 与 CocoaPods 混用不知道会有重复符号
- 期望信号：能读 build timeline 与长函数体警告；知道 Swift 模块的整体编译与增量编译的关系；有 xcconfig 与 CI 缓存的实践；对 App Store 审核规则（隐私清单、第三方 SDK 签名、动态下发限制）有认识

## 好题 / 坏题对比

- 坏：说说 ARC 和循环引用。
- 好：ViewController 里用 Timer.scheduledTimer 的闭包版本调用 self.tick()，页面关闭后 deinit 不调用，请画出完整持有链；改成 [weak self] 后还需要做什么？什么场景 [unowned self] 会崩、什么场景它比 weak 更合适？

- 坏：SwiftUI 的 @State 和 @ObservedObject 有什么区别？
- 好：子视图用 @ObservedObject var vm = ViewModel() 初始化，每次父视图刷新它的数据就被重置，请解释原因与正确写法；@State、@StateObject、@ObservedObject 分别由谁持有、什么时候释放？@Observable 之后这些规则怎么变？

- 坏：actor 是什么？
- 好：一个 actor 管理余额，方法里先 await 查汇率再扣款，并发调用后出现负数，请解释 actor 重入是怎么造成的、怎么修？为什么 actor 不等于锁？如果把汇率查询改成同步阻塞会有什么新问题？

## 项目结合钩子

- 简历出现 SwiftUI 项目 / 迁移 → 追哪些页面用了、最低支持版本、状态管理怎么组织、与 UIKit 混编的边界、遇到的最难的视图更新问题
- 简历出现 Swift Concurrency 迁移 → 追从什么迁的、Sendable 检查怎么处理、actor 重入踩过没有、桥接老 API 时取消怎么处理
- 简历出现"启动时间优化 X%" → 追 pre-main 与 main 后各占多少、归因工具、动态库合并与二进制重排做了没有、验证方法
- 简历出现"包体积减少 X MB" → 追 Link Map 归因、最大的几项来源、资源与 Swift 特化的处理、有没有 CI 卡口
- 简历出现"崩溃率 / 卡顿率下降" → 追 top 根因、OOM 与 watchdog 怎么判定、MetricKit 还是自研、崩溃防护用了没有及其副作用
- 简历出现组件化 / 模块化 / 编译提速 → 追 framework 划分依据、静态还是动态、编译时间前后数字、依赖管理工具迁移
- 简历出现 Objective-C 老项目 / 混编 → 追迁移策略、桥接层的边界、Runtime 相关 hack 有哪些及其风险
- 简历出现审核被拒 / 灰度发布 → 追被拒原因与整改、TestFlight 与分阶段发布怎么用、动态下发的合规边界

## 出题原则

- 内存与运行时是 iOS 面试的硬门槛：从"deinit 不调用""偶现崩溃"这类真实现象切入，让候选人画持有链或解释派发，能背 ARC 定义但画不出持有链的要标记。
- SwiftUI 与 Swift Concurrency 是当前最能区分深度的两块：题目从"状态被重置""actor 出现负数""页面关了请求还在跑"切入，不问"SwiftUI 有哪些属性包装器"这类罗列题。
- 性能题必须落到 Instruments 模板与线上数据：Time Profiler、Core Animation、App Launch、Allocations、MetricKit 的实际使用经验是社招硬门槛。
- 不考版本时效：不问"iOS 18 新增了什么 API"，考的是行为变更的排查与兼容思路；平台无关的启动、包体、灰度、跨端题交给 parent 包 mobile。
