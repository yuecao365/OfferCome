import type { ApplicationStage } from "@/lib/applications/types";

import type { TrialWorkspace } from "./workspace";
import { TRIAL_WORKSPACE_VERSION } from "./workspace";

/**
 * 体验版首次访问时载入的示例数据。
 *
 * 空工作台太劝退——访客看不出各页面长什么样就走了。示例刻意做小
 * （几条投递，不含面试与简历），让"清空后自己填"依然轻松。
 * 日期相对今天生成，图表和"最近 7 天"统计才不会随时间失真。
 */

/**
 * 三条示例投递自带完整 JD（超过自动补全阈值且信息齐全），访客在投递行点
 * "模拟面试"即可直接开场，不会撞上"JD 太薄要求补充"的暂停。
 */
const SAMPLE_JD_BACKEND = `岗位职责：
1. 负责核心交易链路的服务端设计与开发，保障高并发场景下的稳定性与数据一致性；
2. 参与微服务架构演进，包括服务拆分、接口设计、消息队列与缓存方案的落地；
3. 排查线上性能瓶颈与故障，推动慢查询、缓存命中率、超时重试等问题的治理；
4. 与产品、前端协作完成需求评审与接口联调，输出设计文档。

任职要求：
1. 计算机相关专业，扎实的数据结构、操作系统与网络基础；
2. 熟悉 Java 或 Go，理解 JVM/GC 或 Goroutine 调度机制者优先；
3. 熟悉 MySQL 索引与事务、Redis 常见数据结构与缓存一致性方案；
4. 了解 Kafka/RocketMQ 等消息中间件，理解至少一次语义与幂等设计；
5. 有高并发系统设计或线上故障排查经验者优先。`;

const SAMPLE_JD_FRONTEND = `岗位职责：
1. 负责核心业务的 Web 前端开发，构建高质量、可维护的组件与页面；
2. 参与前端工程化建设：构建优化、代码规范、监控与错误上报；
3. 优化首屏加载与交互性能，改善核心页面的 LCP、CLS 等指标；
4. 与设计师、后端协作，推动组件库与接口规范的统一。

任职要求：
1. 熟练掌握 JavaScript/TypeScript、HTML/CSS，理解浏览器渲染原理与事件循环；
2. 熟悉 React 或 Vue 及其状态管理方案，理解虚拟 DOM 与响应式原理；
3. 了解 Webpack/Vite 构建流程，有性能优化实践（懒加载、代码分割、缓存策略）；
4. 了解 HTTP 缓存、跨域、鉴权等网络知识；
5. 有大型单页应用、微前端或可视化项目经验者优先。`;

const SAMPLE_JD_AI = `岗位职责：
1. 负责基于大语言模型的应用与 Agent 系统开发：提示词工程、工具调用、多轮对话管理；
2. 建设 RAG 检索增强链路：文档切分、向量化、召回与重排、结果注入；
3. 设计与实施模型输出的结构化校验、降级与重试策略，保障线上链路稳定；
4. 搭建评测体系：构建评测集、自动化回归、A/B 对比，持续优化效果与成本。

任职要求：
1. 熟悉 Python 或 TypeScript，有 LLM 应用开发经验（OpenAI/开源模型均可）；
2. 理解提示词工程、Function Calling、Agent 编排（ReAct、计划-执行等模式）；
3. 了解向量数据库与 Embedding 检索，有 RAG 项目实践者优先；
4. 理解大模型的局限（幻觉、上下文窗口、注入攻击）及常见工程对策；
5. 有模型评测、微调或推理优化经验者优先。`;

function daysAgo(days: number, hour = 10): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 30, 0, 0);
  return date.toISOString();
}

const SAMPLES: Array<{
  companyName: string;
  jobTitle: string;
  source: string;
  stage: ApplicationStage;
  appliedDaysAgo: number;
  note?: string;
  /** 完整 JD 的示例投递可以直接点"模拟面试"开场，是体验版的主要入口素材。 */
  jobDescription?: string;
}> = [
  { companyName: "云帆科技", jobTitle: "后端开发工程师", source: "boss_zhipin", stage: "first_interview", appliedDaysAgo: 3, note: "一面约在下周三，重点准备缓存一致性。", jobDescription: SAMPLE_JD_BACKEND },
  { companyName: "星野网络", jobTitle: "前端开发工程师", source: "boss_zhipin", stage: "applied", appliedDaysAgo: 1, jobDescription: SAMPLE_JD_FRONTEND },
  { companyName: "深澜智能", jobTitle: "大模型应用开发工程师", source: "company_site", stage: "assessment", appliedDaysAgo: 5, note: "笔试截止本周五。", jobDescription: SAMPLE_JD_AI },
  { companyName: "青竹信息", jobTitle: "服务端开发实习生", source: "referral", stage: "second_interview", appliedDaysAgo: 9 },
  { companyName: "南山数据", jobTitle: "数据平台工程师", source: "boss_zhipin", stage: "rejected", appliedDaysAgo: 16, note: "一面后无回复。" },
  { companyName: "拾光工作室", jobTitle: "全栈工程师", source: "company_site", stage: "applied", appliedDaysAgo: 0 },
];

const SAMPLE_INTERVIEWS = [
  {
    companyName: "云帆科技",
    jobTitle: "后端开发工程师",
    round: "first_interview",
    daysAgo: 2,
    note: "一面，聊了 40 分钟，整体氛围不错。",
    questions: [
      {
        question: "介绍一下你项目里缓存和数据库的一致性是怎么保证的？",
        answer:
          "用的是先更新数据库再删缓存的策略，配合过期时间兜底。被追问删缓存失败怎么办时答得不够好，只说了重试。",
        category: "technical",
      },
      {
        question: "订单系统的幂等是怎么做的？",
        answer: "业务侧用唯一请求号落库去重，数据库唯一索引兜底。",
        category: "resume_project",
      },
      {
        question: "为什么想换工作？",
        answer: "希望在更大的流量场景下打磨架构能力。",
        category: "general",
      },
    ],
  },
  {
    companyName: "青竹信息",
    jobTitle: "服务端开发实习生",
    round: "second_interview",
    daysAgo: 6,
    note: "二面偏系统设计。",
    questions: [
      {
        question: "设计一个短链服务，要考虑哪些点？",
        answer: "讲了发号器、存储选型和缓存，漏了防刷和统计。",
        category: "technical",
      },
      {
        question: "你在项目里遇到过最难排查的问题是什么？",
        answer: "一个偶发的连接池耗尽问题，最后定位到事务里调了外部接口。",
        category: "resume_project",
      },
    ],
  },
];

export function createSampleWorkspace(): TrialWorkspace {
  const seededAt = new Date().toISOString();
  return {
    version: TRIAL_WORKSPACE_VERSION,
    seededAt,
    resume: null,
    interviews: SAMPLE_INTERVIEWS.map((sample, index) => {
      const interviewedAt = daysAgo(sample.daysAgo, 14);
      return {
        id: `sample-interview-${index}`,
        kind: "real" as const,
        companyName: sample.companyName,
        jobTitle: sample.jobTitle,
        round: sample.round,
        status: "completed",
        interviewedAt,
        note: sample.note,
        questions: sample.questions.map((question, sortOrder) => ({
          id: `sample-question-${index}-${sortOrder}`,
          question: question.question,
          answer: question.answer,
          category: question.category,
          sortOrder,
        })),
        totalScore: null,
        report: null,
        createdAt: interviewedAt,
        updatedAt: interviewedAt,
      };
    }),
    applications: SAMPLES.map((sample, index) => {
      const appliedAt = daysAgo(sample.appliedDaysAgo, 9 + index);
      return {
        id: `sample-${index}`,
        companyName: sample.companyName,
        jobTitle: sample.jobTitle,
        source: sample.source,
        stage: sample.stage,
        appliedAt,
        jobUrl: "",
        jobDescription: sample.jobDescription ?? "",
        note: sample.note ?? "",
        createdAt: appliedAt,
        updatedAt: daysAgo(Math.max(0, sample.appliedDaysAgo - 1), 15),
      };
    }),
  };
}
