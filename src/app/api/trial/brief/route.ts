import { randomUUID } from "node:crypto";

import type { RecentWeakness } from "@/lib/mock-interviews/context";
import { INTERVIEW_PACES, type InterviewPace } from "@/lib/mock-interviews/interviewer/brief";
import { generateInterviewBrief } from "@/lib/mock-interviews/interviewer/brief-agent";
import { emptyMemory } from "@/lib/mock-interviews/interviewer/memory";
import type { MockInterviewJobBlueprint } from "@/lib/mock-interviews/types";
import type { TrialJobInput, TrialResumeInput } from "@/lib/trial/interview";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
/** 备课 agent 最多 5 步（≤4 次加载技能包 + 产出简报），超时 90 s；Hobby 计划要开 Fluid Compute 才有这么长。 */
export const maxDuration = 90;

type Body = {
  job: TrialJobInput;
  resume: TrialResumeInput;
  blueprint: MockInterviewJobBlueprint;
  pace: InterviewPace;
  round: string | null;
  /** 浏览器从工作台里最近的模拟面试短板算好带上（与本地版同一个纯函数）。 */
  recentWeaknesses: RecentWeakness[];
};

/** 备课第二步：蓝图 + 简历 + 技能包 → 简报，连同空的工作记忆一起交给浏览器保管。 */
export const POST = withTrialAi<Body>(async (body) => {
  const pace = INTERVIEW_PACES.includes(body.pace) ? body.pace : "standard";
  const brief = await generateInterviewBrief({
    generationId: randomUUID(),
    jobTitle: body.job.jobTitle,
    blueprint: body.blueprint,
    context: {
      jobDescription: body.job.jobDescription,
      resume: { id: "trial-resume", name: "体验简历", text: body.resume.text },
      projects: body.resume.projects,
      recentWeaknesses: Array.isArray(body.recentWeaknesses) ? body.recentWeaknesses : [],
    },
    pace,
    round: body.round,
  });
  return { brief, memory: emptyMemory(brief) };
});
