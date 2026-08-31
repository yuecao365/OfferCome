import { assessInterviewQuestions } from "@/lib/candidate-profile/assessment-agent";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 90;

type Body = {
  companyName: string;
  jobTitle: string;
  sourceType: string;
  questions: Array<{
    id: string;
    question: string;
    answer: string;
    category: string;
    existingEvaluation?: { score: number | null; feedback: string | null } | null;
  }>;
};

/**
 * 评估一场面试的问答 → 能力观察。与本地版共用同一个评估 agent
 * （含逐字摘录校验），差别只在结果交给浏览器保管。
 */
export const POST = withTrialAi<Body>(async (body) => {
  const { observations } = await assessInterviewQuestions(body);
  return { observations };
});
