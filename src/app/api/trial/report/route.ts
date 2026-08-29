import { computeInterviewTotalScore } from "@/lib/mock-interviews/scoring";
import { summarizeMockInterview } from "@/lib/mock-interviews/summary-agent";
import type { MockInterviewReport } from "@/lib/mock-interviews/types";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  jobTitle: string;
  /** 已作答题目的问答与评分；跳过的题不在其中。 */
  answered: { question: string; score: number; feedback: string }[];
  /** 全部题目的得分（跳过计 0），用于算总分。 */
  scores: number[];
};

/** 全场跳过时不调用汇总模型，直接给固定的引导文案。 */
const ALL_SKIPPED = {
  summary: "本场所有题目均已跳过，暂时没有可评分的回答。",
  strengths: [] as string[],
  improvements: ["从一道最熟悉的题目开始练习，先说出思路再逐步补充细节。"],
  actionPlan: ["重新发起一场模拟面试，并尝试完整回答至少一道题。"],
};

export const POST = withTrialAi<Body>(async (body) => {
  const summary =
    body.answered.length > 0
      ? await summarizeMockInterview({
          jobTitle: body.jobTitle,
          questions: body.answered,
        })
      : ALL_SKIPPED;

  const report: MockInterviewReport = {
    totalScore: computeInterviewTotalScore(body.scores),
    summary: summary.summary,
    strengths: summary.strengths,
    improvements: summary.improvements,
    actionPlan: summary.actionPlan,
  };
  return { report };
});
