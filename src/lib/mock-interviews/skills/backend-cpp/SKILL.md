---
name: backend-cpp
description: C++ 后端出题：内存模型与对象生命周期、智能指针与 RAII、STL 与容器性能、多线程与原子操作、网络编程与 IO 模型、性能优化、现代 C++。岗位或简历出现 C++ 服务端、基础架构、存储、网络、游戏服务器时加载。
keywords: [c++, cpp, c++后端, 服务端开发, 基础架构, 智能指针, raii, stl, 多线程, 原子操作, epoll, 网络编程, 性能优化, 现代c++, 游戏服务器]
layer: stack
parent: backend
---

## 岗位职责与考察重点

C++ 后端主要出现在基础架构（存储、数据库内核、RPC 框架、消息队列）、网络与网关、游戏服务器、量化交易、音视频与推荐引擎在线服务。日常是在多线程、高性能、资源受限的场景里写服务，直接面对内存、锁、系统调用与 CPU 缓存。C++ 面试的主线非常稳定：对象生命周期与内存模型、智能指针与 RAII、STL 容器与算法的底层、多线程与原子操作、网络 IO 模型（epoll、Reactor）、性能剖析与优化、现代 C++（11 到 23）的实际使用。语言复杂度高，所以面试官最在意三件事：一是候选人能否写出不崩、不泄漏、无未定义行为的代码，并指出一段代码里的悬垂引用、数据竞争或异常不安全；二是对性能的直觉是否建立在测量之上——知道 cache line、分支预测、内存分配的代价，用过 perf 和 sanitizer；三是对系统层的理解——进程与线程模型、IO 多路复用、内存分配器、锁的代价。

校招侧重语言基础与手写能力：虚函数与多态的实现、拷贝与移动语义、智能指针的实现原理、STL 容器的复杂度与失效规则、手写线程安全队列或简单 Reactor。社招侧重工程与排查：core dump 分析、内存泄漏与碎片、锁竞争与伪共享、epoll 的边缘触发与惊群、零拷贝与批处理、编译期优化与构建系统。基础架构团队会深入到内存序、无锁结构、协程与异步框架（brpc、seastar、asio）的设计，游戏公司会多问帧同步、对象池与热更新。

## 主题

### 对象生命周期与内存模型
- 阶梯：栈、堆、静态存储与对象的构造析构顺序 → 拷贝构造、移动构造、RVO/NRVO、临时对象与引用延长 → 悬垂引用、返回局部变量引用、迭代器失效、use-after-free 的排查手段（ASan、Valgrind）→ 值语义与引用语义的设计选择，什么时候拷贝比共享更安全
- 好题：一个函数返回 const std::string& 指向局部变量，为什么有时候能"正常"运行？怎么用工具稳定复现？把返回类型改成值类型后性能会差多少、为什么通常不差？
- 危险信号：不知道 RVO 存在而到处 std::move 返回值；分不清悬垂引用与野指针；没用过 AddressSanitizer
- 期望信号：能说出构造/析构顺序与异常安全；知道移动后对象处于"有效但未定义"状态；ASan/UBSan 在 CI 常开；提到 std::string_view 与 std::span 的生命周期陷阱

### 智能指针与 RAII
- 阶梯：为什么用智能指针 → unique_ptr 零开销、shared_ptr 的控制块与原子引用计数、weak_ptr 打破循环、enable_shared_from_this → shared_ptr 循环引用泄漏、多线程下 shared_ptr 本身的竞态、裸指针与智能指针混用导致 double free 的排查 → 所有权设计：什么该 unique、什么该 shared、什么该裸指针/引用观察，shared_ptr 的性能代价在热路径上值不值
- 好题：一个网络库里 Connection 持有 shared_ptr<Session>，Session 又持有 shared_ptr<Connection>，连接关闭后内存不释放。怎么定位、怎么改？改成 weak_ptr 之后 lock 失败的时序怎么处理？
- 危险信号：认为 shared_ptr 线程安全所以指向的对象也线程安全；用 new 而不是 make_shared 却说不出区别；手写的智能指针没处理自赋值
- 期望信号：解释 make_shared 一次分配与 weak_ptr 延长内存释放的副作用；所有权用 unique_ptr 表达、借用用引用或裸指针；RAII 管理锁、文件、socket 而不只是内存；自定义 deleter 的用法

### 多态、虚函数与对象布局
- 阶梯：虚函数怎么实现 → 虚表与虚指针的布局、多重继承与虚继承、构造函数里调用虚函数的行为 → 虚函数调用的间接跳转与内联失效、对象大小与对齐导致的缓存不友好的排查 → 运行时多态与编译期多态（模板、CRTP、std::variant + visit）的选择
- 好题：一个高频调用的接口有 5 个实现，用虚函数调用后 perf 显示分支预测失败很多，你会考虑哪些改法？各自对扩展性的影响？
- 危险信号：只会背"虚表"；不知道析构函数要 virtual；不知道 final 与 devirtualization
- 期望信号：sizeof 与对齐的计算；用 final 帮助编译器去虚化；variant + visit 或 CRTP 在封闭类型集合下的收益；能说出 dynamic_cast 的代价

### STL 容器与算法的底层
- 阶梯：vector、deque、list、map、unordered_map 各自适用场景 → vector 扩容与迭代器失效、unordered_map 的桶与 rehash、map 的红黑树与缓存不友好 → 大量小对象插入删除导致的分配开销、哈希冲突退化、erase 时迭代器失效引发的崩溃排查 → 什么时候用 flat_map、absl 的 swiss table、自定义分配器或 pmr
- 好题：一个每秒百万次查找的 unordered_map<string, Obj>，perf 显示 30% 在哈希与字符串比较上，你会怎么优化？换成什么结构？key 改成 string_view 有什么风险？
- 危险信号：所有场景都用 map；不知道 reserve；erase 后用旧迭代器；不知道 emplace 与 push 的区别
- 期望信号：预分配与 reserve；异构查找（transparent comparator）避免构造临时 string；flat 结构在小集合上的优势；知道 std::pmr 与内存池；algorithm 与 ranges 的使用

### 多线程、锁与线程安全设计
- 阶梯：std::thread 与线程池 → mutex、condition_variable 的虚假唤醒、lock_guard/unique_lock/scoped_lock、shared_mutex → 死锁定位（gdb 看线程栈）、锁竞争导致吞吐不涨、伪共享（false sharing）的排查与验证 → 锁粒度、分片、读写分离、线程局部存储与无锁结构的适用边界
- 好题：写一个线程安全的有界阻塞队列，然后回答：为什么 wait 要用 while 而不是 if？两个条件变量比一个好在哪？在 64 核机器上这个队列成为瓶颈时你怎么改？
- 危险信号：condition_variable 不配谓词；持锁做 IO；用 volatile 做线程同步；不知道 thread_local
- 期望信号：谓词循环处理虚假唤醒；notify 在锁外还是锁内的权衡；alignas(64) 避免伪共享；多生产者多消费者用分片队列或 per-thread 队列；能用 perf 或 ThreadSanitizer 验证

### 内存序与原子操作
- 阶梯：std::atomic 解决什么问题 → memory_order 的六种取值、acquire/release 配对、顺序一致性的代价 → 用 relaxed 写计数器却在别处依赖它的可见性、双重检查锁在弱内存模型 CPU 上出错、ABA 问题的排查 → 无锁结构的正确性验证成本，什么场景值得写无锁
- 好题：一个生产者写数据后设置 atomic<bool> ready，消费者看到 ready 为 true 后读数据。用 relaxed 能保证读到正确数据吗？在 x86 和 ARM 上表现有区别吗？怎么写才是对的？
- 危险信号：认为 atomic 默认就是 relaxed；不知道 x86 是强内存模型所以"测过没问题"不代表对；无锁队列没考虑 ABA
- 期望信号：解释 release-acquire 建立的 happens-before；知道 x86 TSO 与 ARM 弱序的差别；compare_exchange_weak 与 strong 的区别；提到 hazard pointer 或 epoch 回收；TSan 无法完全验证内存序问题

### 网络编程与 IO 模型
- 阶梯：阻塞、非阻塞、IO 多路复用的区别 → epoll 的 LT/ET、Reactor 与 Proactor、one loop per thread → 边缘触发下读不完导致饿死、惊群、大量 TIME_WAIT、连接泄漏、TCP 粘包处理错误的排查 → 单 Reactor 多线程还是多 Reactor、io_uring 的收益、自研还是用 asio/brpc/muduo
- 好题：ET 模式下一个连接偶发收不到后续数据，代码看起来"读了一次"，为什么？改成读到 EAGAIN 后又出现一个慢连接拖垮整个线程，怎么解决？
- 危险信号：分不清 LT/ET；不知道 SO_REUSEPORT；把 TCP 当成有消息边界；不处理 EINTR
- 期望信号：ET 必须循环读到 EAGAIN；每次事件限制处理字节数或用 LT；多 Reactor 用 SO_REUSEPORT 或 accept 后分发；应用层帧协议与缓冲区管理；知道 io_uring 与 epoll 的差别与内核版本要求

### 性能剖析与优化
- 阶梯：怎么找到性能瓶颈 → perf 的采样与火焰图、cache miss 与分支预测的观测（perf stat）、内存分配的代价 → 热点在 malloc、锁、系统调用、内存拷贝各自的优化手段，抖动（tail latency）的定位 → 换分配器（jemalloc/tcmalloc）、对象池、零拷贝、批处理、编译选项（LTO、PGO）的收益边界与维护成本
- 好题：服务 P99 偶发 20ms 尖刺而平均只有 1ms，你怎么抓到尖刺发生时在做什么？如果是 malloc 里的 page fault，有哪些改法？
- 危险信号：优化靠猜；不知道 perf record 与 perf stat 的区别；从没换过分配器
- 期望信号：perf 火焰图与 off-CPU 分析；perf stat 看 IPC、cache-misses、branch-misses；预分配与 mlock、大页；jemalloc 的 arena 与线程缓存；用 benchmark（google benchmark）验证并防止编译器优化掉

### 内存分配、泄漏与碎片
- 阶梯：new/delete 与 malloc/free 的关系 → 分配器的层次（线程缓存、arena、页）、内存对齐与 padding → 内存缓慢增长但 ASan 无泄漏（碎片或缓存无上限）、RSS 不下降、core dump 分析内存被谁占 → 对象池、arena 分配器、pmr 的适用场景，与 GC 语言相比的运维差别
- 好题：长期运行的服务 RSS 持续增长，ASan/LeakSanitizer 报告无泄漏，你怀疑什么？怎么验证碎片？怎么改？
- 危险信号：认为没报泄漏就没问题；不知道 jemalloc 的 stats 与 heap profiling；用 memset 清零"释放内存"
- 期望信号：jemalloc/tcmalloc 的 heap profile 与碎片统计；固定大小对象走池；大对象直接 mmap；malloc_trim 的作用与限制；gdb 加载 core 看堆栈与容器内容

### 现代 C++ 与工程实践
- 阶梯：C++11/14/17/20 各带来了什么关键特性 → 移动语义与完美转发、constexpr、结构化绑定、optional/variant/string_view、concepts、ranges、协程 → 万能引用与 std::forward 用错、lambda 捕获悬垂、模板报错难读、编译时间爆炸的排查 → 团队的 C++ 标准与代码规范怎么定，模板元编程与可读性的边界
- 好题：C++20 协程在你的项目里怎么用？与线程池、回调、future 相比在异步 IO 上收益是什么？协程帧的分配与生命周期怎么管理？
- 危险信号：还在用裸 new/delete 与 C 风格数组；不知道 auto&& 与完美转发；把所有东西都写成模板
- 期望信号：按值传递 + move 的接口设计；constexpr 与 if constexpr 减少运行期开销；concepts 改善模板错误信息；模块与预编译头缩短编译时间；用 clang-tidy 与格式化统一风格

### 异常、错误处理与安全
- 阶梯：异常与错误码怎么选 → 异常安全的三个级别、noexcept 与移动、栈展开的代价 → 析构函数抛异常、异常穿越 C 接口或线程边界导致 terminate 的排查 → 基础设施项目禁用异常的理由，std::expected（C++23）与 outcome 的实践，整数溢出、缓冲区越界的防御
- 好题：你的团队禁用异常，那构造函数失败怎么表达？用 std::expected 之后深层调用链的错误传播怎么写得不啰嗦？
- 危险信号：不知道 noexcept 影响 vector 扩容是否用移动；catch(...) 吞掉一切；析构里抛异常
- 期望信号：工厂函数返回 optional/expected；RAII 保证异常安全；-fno-exceptions 的影响范围；UBSan 与 fuzz 测试；边界检查与安全整数运算

### 构建、依赖与调试工具链
- 阶梯：CMake 的 target 模型 → 静态链接与动态链接的差别、符号可见性、ODR 违规 → 链接错误、ABI 不兼容、debug 与 release 行为不一致、core dump 定位的排查 → 包管理（vcpkg/conan/bazel）、编译缓存、单体仓库与构建时间治理
- 好题：release 版本崩溃但 debug 正常，可能的原因有哪些？没有符号的 core 怎么分析？怎么让线上二进制既有符号又不影响体积？
- 危险信号：不知道 -O2 会暴露未定义行为；没看过 core dump；不知道 separate debug info
- 期望信号：UB 与未初始化变量是首要怀疑；objcopy 分离符号与 debuginfo 服务；gdb 的 bt/frame/print 与反向调试；sanitizer 版本在测试环境常开；ccache 与分布式编译

## 好题 / 坏题对比

- 坏：说说 shared_ptr 和 unique_ptr 的区别。
- 好：网络库里 Connection 与 Session 互相持有 shared_ptr，连接关闭后内存不释放。说你怎么定位（用什么工具、看什么数据），怎么决定哪一边改成 weak_ptr，以及 lock 失败时的时序怎么处理。

- 坏：什么是 epoll？ET 和 LT 有什么区别？
- 好：ET 模式下某个连接偶发收不到后续数据，代码是"每次事件读一次"。解释为什么，改成"读到 EAGAIN"之后又出现一个慢连接拖垮整个事件循环，再怎么解决？

- 坏：C++ 的六种内存序分别是什么？
- 好：生产者写完数据后设置 atomic<bool> ready，消费者看到 ready 为 true 后读数据。用 relaxed 正确吗？为什么在 x86 上测试总是通过？给出正确写法并解释建立了什么 happens-before 关系。

## 项目结合钩子

- 简历出现自研网络框架 / RPC → 追线程模型（几个 Reactor、怎么分发）、缓冲区与帧协议、连接管理与超时、压测数据与对比对象
- 简历出现"高性能" / "低延迟" → 追怎么测的（perf、benchmark）、优化了什么（分配、锁、拷贝、缓存）、P99 从多少到多少
- 简历出现多线程 / 无锁 → 追锁粒度怎么定、有没有出过死锁或竞态、怎么验证正确性（TSan、压测）、无锁结构的 ABA 与内存回收
- 简历出现智能指针改造 / 内存治理 → 追泄漏怎么发现、所有权怎么梳理、shared_ptr 在热路径上的开销有没有测过
- 简历出现 C++17/20 迁移 → 追用了哪些特性解决了什么问题、协程或 ranges 有没有真正落地、编译时间怎么变化
- 简历出现存储引擎 / 数据库内核 → 追页管理与缓存、并发控制、WAL 与崩溃恢复、内存分配器的选择
- 简历出现游戏服务器 → 追帧同步与状态同步、对象池与内存布局、热更新机制、单线程逻辑与多线程 IO 的划分
- 简历出现 core dump / 线上崩溃处理 → 追怎么拿到符号、根因是什么类型的 UB 或竞态、事后加了什么工具或检查

## 出题原则

- 架构与方法论（缓存一致性、消息队列、限流降级）交给 backend 包，本包专注 C++ 语言机制、系统层与性能工程。
- 代码优先：内存、并发、STL 相关主题尽量给一段十行以内的代码让候选人找 bug 或补全，追每个对象的生命周期与每个线程的可见性。
- 性能题必须有测量：候选人说的任何优化都要追怎么测、用什么工具、前后数字，"理论上更快"不算数。
- 按方向调整深度：基础架构与存储岗位追内存序、分配器、IO 模型细节；业务服务岗位重点在正确性（RAII、异常安全、线程安全）与排查工具。
