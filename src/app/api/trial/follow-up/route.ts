import { generateMockInterviewFollowUp } from "@/lib/mock-interviews/follow-up-agent";
import { canRequestFollowUp } from "@/lib/mock-interviews/follow-up-policy";
import type { MockInterviewJobBlueprint } from "@/lib/mock-interviews/types";
import type { TrialQuestion } from "@/lib/trial/interview";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 45;

type Body = {
  question: TrialQuestion;
  answer: string;
  blueprint: MockInterviewJobBlueprint;
  mainQuestionCount: number;
  existingFollowUpCount: number;
};

/**
 * 判断并生成一次追问。预算规则复用本地版的 follow-up-policy，
 * 上限仍由代码持有——agent 只决定"要不要追"，不能决定"能追几次"。
 */
export const POST = withTrialAi<Body>(async (body) => {
  const allowed = canRequestFollowUp({
    mainQuestionCount: body.mainQuestionCount,
    existingFollowUpCount: body.existingFollowUpCount,
    // 追问只针对主题目，客户端已按此过滤；这里恒为 false。
    hasFollowUpForQuestion: false,
  });
  if (!allowed || body.question.parentIndex !== null) {
    return { followUp: null };
  }

  const competency =
    body.blueprint.competencies.find(
      (item) => item.id === body.question.jobCompetencyId,
    ) ?? null;

  const followUp = await generateMockInterviewFollowUp({
    question: body.question.question,
    answer: body.answer,
    competency: competency
      ? { name: competency.name, jdEvidence: competency.jdEvidence }
      : null,
    expectedSignals: body.question.expectedSignals,
  });

  return {
    followUp: followUp?.question
      ? { question: followUp.question, expectedSignals: followUp.expectedSignals }
      : null,
  };
});
