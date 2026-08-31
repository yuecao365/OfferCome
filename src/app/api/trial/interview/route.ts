import { randomUUID } from "node:crypto";

import { analyzeMockInterviewJob } from "@/lib/mock-interviews/job-analysis-agent";
import { generateMockInterviewPlan } from "@/lib/mock-interviews/question-generation-agent";
import {
  buildTrialContext,
  clampTrialOptions,
  createTrialInterview,
  type TrialInterviewOptions,
  type TrialJobInput,
  type TrialResumeInput,
} from "@/lib/trial/interview";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
/** 出题要跑岗位分析 + 出题两轮模型调用，给足预算。 */
export const maxDuration = 120;

type Body = {
  job: TrialJobInput;
  resume: TrialResumeInput;
  options?: Partial<TrialInterviewOptions> & { followUpsEnabled?: boolean };
};

/** 开一场体验面试：分析岗位 → 出题（含每题 rubric）→ 把完整会话交给浏览器保管。 */
export const POST = withTrialAi<Body>(async (body) => {
  const context = buildTrialContext(body);
  const generationId = randomUUID();
  const options = clampTrialOptions(body.options);

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
    questionCount: options.questionCount,
    difficulty: options.difficulty,
    round: options.round,
  });

  return {
    interview: createTrialInterview({
      job: body.job,
      resume: body.resume,
      blueprint: generated.blueprint,
      plan: generated.plan,
      followUpsEnabled: body.options?.followUpsEnabled ?? true,
    }),
  };
});
