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

export function createSampleWorkspace(): TrialWorkspace {
  const seededAt = new Date().toISOString();
  return {
    version: TRIAL_WORKSPACE_VERSION,
    seededAt,
    resume: null,
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
