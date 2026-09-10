import { generateAnswerExemplar } from "@/lib/mock-interviews/answer-exemplar-agent";
import type { SegmentRecord } from "@/lib/mock-interviews/interviewer/segments";
import { evaluateMockInterviewQuestion } from "@/lib/mock-interviews/question-evaluation-agent";
import { loadSkillPacks } from "@/lib/mock-interviews/skills/loader";
import { packsForInterview } from "@/lib/mock-interviews/skills/selector";
import type { TrialEvaluation } from "@/lib/trial/interview";
import { withTrialAi } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
/** 评分约 7 s，示范最多 45 s。 */
export const maxDuration = 60;

type Body = {
  segment: SegmentRecord;
  /** 该领域的目标深度（简报里的 depth）。 */
  targetDepth: number;
  round: string | null;
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
  /** 备课时加载过的技能包名，示范 agent 可查。 */
  skillPacks: string[];
};

/**
 * 一段的评分与示范，与本地版 evaluatePersistedMockInterviewQuestion 同一条路：
 * 评分 v3 全量 + 有短板时生成示范；示范失败不影响评分。
 */
export const POST = withTrialAi<Body>(async (body) => {
  const answer = body.segment.answer?.trim();
  if (!answer || body.segment.skipped) throw new Error("题目没有可评分的回答。");
  const { evaluation, score } = await evaluateMockInterviewQuestion({
    question: body.segment.question,
    answer,
    rubric: body.segment.rubric,
    expectedSignals: body.segment.expectedSignals,
    jobTitle: body.jobTitle,
    jobDescription: body.jobDescription,
    thread: {
      depth: body.segment.metadata.depth,
      targetDepth: body.targetDepth,
      probeCount: body.segment.metadata.probeCount,
      hinted: body.segment.metadata.hinted,
      note: body.segment.metadata.note,
    },
    round: body.round,
  });

  let exemplar: TrialEvaluation["exemplar"] = null;
  if (evaluation.weaknesses.length > 0) {
    try {
      exemplar = await generateAnswerExemplar({
        runId: `trial-exemplar:${Date.now()}`,
        jobTitle: body.jobTitle,
        question: body.segment.question,
        answer,
        weaknesses: evaluation.weaknesses,
        resumeText: body.resumeText,
        skillPacks: packsForInterview(Array.isArray(body.skillPacks) ? body.skillPacks : [], await loadSkillPacks(), 3),
      });
    } catch (error) {
      console.error("示范回答生成失败，评分照常。", error);
    }
  }
  const result: TrialEvaluation = { ...evaluation, score, exemplar };
  return { evaluation: result };
});
