import { toLegacyReport, type LegacyMockInterviewReport } from "@/lib/mock-interviews/report";
import { computeInterviewTotalScore } from "@/lib/mock-interviews/scoring";
import { summarizeMockInterview } from "@/lib/mock-interviews/summary-agent";
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
const ALL_SKIPPED: LegacyMockInterviewReport = {
  totalScore: 0,
  summary: "本场所有题目均已跳过，暂时没有可评分的回答。",
  strengths: [],
  improvements: ["从一道最熟悉的题目开始练习，先说出思路再逐步补充细节。"],
  actionPlan: ["重新发起一场模拟面试，并尝试完整回答至少一道题。"],
};

/**
 * 体验版的旧题库流程没有线程、记忆与假设：每道题当作一个等权领域喂给汇总 agent，
 * 结果折回旧形状存进浏览器。等对话式对齐后一起改。
 */
export const POST = withTrialAi<Body>(async (body) => {
  const totalScore = computeInterviewTotalScore(body.scores.map((score) => ({ weight: 1, scores: [score] })));
  if (body.answered.length === 0) return { report: { ...ALL_SKIPPED, totalScore } };

  const summary = await summarizeMockInterview({
    jobTitle: body.jobTitle,
    round: null,
    pace: "standard",
    areas: body.answered.map((item, index) => ({
      name: `第 ${index + 1} 题`,
      kind: "technical",
      style: null,
      weight: 1,
      depthReached: 0,
      targetDepth: 0,
      threadNote: item.feedback,
      skipped: false,
      score: item.score,
      weaknesses: [],
    })),
    memory: { established: [], doubtful: [], failed: [] },
    hypotheses: [],
  });
  return { report: toLegacyReport({ version: 2, totalScore, ...summary, hypotheses: [] }) };
});
