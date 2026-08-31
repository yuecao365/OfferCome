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
}> = [
  { companyName: "云帆科技", jobTitle: "后端开发工程师", source: "boss_zhipin", stage: "first_interview", appliedDaysAgo: 3, note: "一面约在下周三，重点准备缓存一致性。" },
  { companyName: "星野网络", jobTitle: "前端开发工程师", source: "boss_zhipin", stage: "applied", appliedDaysAgo: 1 },
  { companyName: "深澜智能", jobTitle: "大模型应用开发工程师", source: "company_site", stage: "assessment", appliedDaysAgo: 5, note: "笔试截止本周五。" },
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
        jobDescription: "",
        note: sample.note ?? "",
        createdAt: appliedAt,
        updatedAt: daysAgo(Math.max(0, sample.appliedDaysAgo - 1), 15),
      };
    }),
  };
}
