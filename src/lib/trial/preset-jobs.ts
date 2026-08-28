/**
 * 体验模式的预置岗位。JD 都超过自动补全阈值（80 字符）且信息完整，
 * 保证访客选一个就能直接开场，不会撞上"JD 太薄要求补充"的暂停。
 */
export type TrialPresetJob = {
  id: string;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
};

export const TRIAL_PRESET_JOBS: TrialPresetJob[] = [
  {
    id: "backend",
    companyName: "云帆科技",
    jobTitle: "后端开发工程师",
    jobDescription: `岗位职责：
1. 负责核心交易链路的服务端设计与开发，保障高并发场景下的稳定性与数据一致性；
2. 参与微服务架构演进，包括服务拆分、接口设计、消息队列与缓存方案的落地；
3. 排查线上性能瓶颈与故障，推动慢查询、缓存命中率、超时重试等问题的治理；
4. 与产品、前端协作完成需求评审与接口联调，输出设计文档。

任职要求：
1. 计算机相关专业，扎实的数据结构、操作系统与网络基础；
2. 熟悉 Java 或 Go，理解 JVM/GC 或 Goroutine 调度机制者优先；
3. 熟悉 MySQL 索引与事务、Redis 常见数据结构与缓存一致性方案；
4. 了解 Kafka/RocketMQ 等消息中间件，理解至少一次语义与幂等设计；
5. 有高并发系统设计或线上故障排查经验者优先。`,
  },
  {
    id: "frontend",
    companyName: "星野网络",
    jobTitle: "前端开发工程师",
    jobDescription: `岗位职责：
1. 负责核心业务的 Web 前端开发，构建高质量、可维护的组件与页面；
2. 参与前端工程化建设：构建优化、代码规范、监控与错误上报；
3. 优化首屏加载与交互性能，改善核心页面的 LCP、CLS 等指标；
4. 与设计师、后端协作，推动组件库与接口规范的统一。

任职要求：
1. 熟练掌握 JavaScript/TypeScript、HTML/CSS，理解浏览器渲染原理与事件循环；
2. 熟悉 React 或 Vue 及其状态管理方案，理解虚拟 DOM 与响应式原理；
3. 了解 Webpack/Vite 构建流程，有性能优化实践（懒加载、代码分割、缓存策略）；
4. 了解 HTTP 缓存、跨域、鉴权等网络知识；
5. 有大型单页应用、微前端或可视化项目经验者优先。`,
  },
  {
    id: "ai",
    companyName: "深澜智能",
    jobTitle: "大模型应用开发工程师",
    jobDescription: `岗位职责：
1. 负责基于大语言模型的应用与 Agent 系统开发：提示词工程、工具调用、多轮对话管理；
2. 建设 RAG 检索增强链路：文档切分、向量化、召回与重排、结果注入；
3. 设计与实施模型输出的结构化校验、降级与重试策略，保障线上链路稳定；
4. 搭建评测体系：构建评测集、自动化回归、A/B 对比，持续优化效果与成本。

任职要求：
1. 熟悉 Python 或 TypeScript，有 LLM 应用开发经验（OpenAI/开源模型均可）；
2. 理解提示词工程、Function Calling、Agent 编排（ReAct、计划-执行等模式）；
3. 了解向量数据库与 Embedding 检索，有 RAG 项目实践者优先；
4. 理解大模型的局限（幻觉、上下文窗口、注入攻击）及常见工程对策；
5. 有模型评测、微调或推理优化经验者优先。`,
  },
];
