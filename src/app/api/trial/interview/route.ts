import { randomUUID } from "node:crypto";

import { analyzeMockInterviewJob } from "@/lib/mock-interviews/job-analysis-agent";
import { generateMockInterviewPlan } from "@/lib/mock-interviews/question-generation-agent";
import {
  buildTrialContext,
  createTrialInterview,
  TRIAL_QUESTION_COUNT,
  type TrialJobInput,
  type TrialResumeInput,
} from "@/lib/trial/interview";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
/** 出题要跑岗位分析 + 出题两轮模型调用，给足预算。 */
export const maxDuration = 120;

type Body = { job: TrialJobInput; resume: TrialResumeInput };

/** 开一场体验面试：分析岗位 → 出题（含每题 rubric）→ 把完整会话交给浏览器保管。 */
export const POST = withTrialAi<Body>(async (body) => {
  const context = buildTrialContext(body);
  const generationId = randomUUID();

  // analyzeMockInterviewJob 自带四级降级，不会抛"没有蓝图"这种终态。
  const blueprint = await analyzeMockInterviewJob({
    generationId,
    jobTitle: body.job.jobTitle,
    jobDescription: body.job.jobDescription,
  });

  const generated = await generateMockInterviewPlan({
    generationId,
    context,
    blueprint,
    jobTitle: body.job.jobTitle,
    questionCount: TRIAL_QUESTION_COUNT,
    difficulty: "standard",
    round: null,
  });

  return {
    interview: createTrialInterview({
      job: body.job,
      resume: body.resume,
      blueprint: generated.blueprint,
      plan: generated.plan,
    }),
  };
});
