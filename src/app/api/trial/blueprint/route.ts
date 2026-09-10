import { randomUUID } from "node:crypto";

import { analyzeMockInterviewJob } from "@/lib/mock-interviews/job-analysis-agent";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { jobTitle: string; jobDescription: string };

/** 备课第一步：只看 JD 的岗位蓝图。analyzeMockInterviewJob 自带降级，不会抛"没有蓝图"这种终态。 */
export const POST = withTrialAi<Body>(async (body) => ({
  blueprint: await analyzeMockInterviewJob({
    generationId: randomUUID(),
    jobTitle: body.jobTitle,
    jobDescription: body.jobDescription,
  }),
}));
