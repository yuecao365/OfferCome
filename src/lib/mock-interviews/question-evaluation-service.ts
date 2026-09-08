import "server-only";

import { prisma } from "@/lib/db";
import { parseJsonObject, parseJsonValue } from "@/lib/json";

import { generateAnswerExemplar } from "./answer-exemplar-agent";
import { parseStoredBrief } from "./interviewer/brief";
import { evaluateMockInterviewQuestion } from "./question-evaluation-agent";
import type { EvaluationThreadContext, EvaluationWeakness } from "./question-evaluation";
import { loadSkillPacks } from "./skills/loader";
import { packsForInterview } from "./skills/selector";

const RUNNING_EVALUATION_WAIT_MS = 32_000;
const RUNNING_EVALUATION_POLL_MS = 250;

/** 线程切段时写进 generationMetadataJson 的过程信号（见 interviewer/session.ts）。 */
function threadContext(metadata: Record<string, unknown>, targetDepth: number | null): EvaluationThreadContext | null {
  if (typeof metadata.depth !== "number") return null;
  return {
    depth: metadata.depth,
    targetDepth: targetDepth ?? metadata.depth,
    probeCount: typeof metadata.probeCount === "number" ? metadata.probeCount : metadata.depth,
    rescues: typeof metadata.rescues === "number" ? metadata.rescues : 0,
    note: typeof metadata.note === "string" ? metadata.note : null,
  };
}

/** 有短板才生成示范；失败不影响评分结果。 */
async function attachExemplar(input: {
  evaluationId: string;
  runId: string;
  jobTitle: string;
  question: string;
  answer: string;
  weaknesses: EvaluationWeakness[];
  resumeText: string;
  skillPackNames: string[];
}): Promise<void> {
  if (input.weaknesses.length === 0) return;
  try {
    const exemplar = await generateAnswerExemplar({
      runId: input.runId,
      jobTitle: input.jobTitle,
      question: input.question,
      answer: input.answer,
      weaknesses: input.weaknesses,
      resumeText: input.resumeText,
      skillPacks: packsForInterview(input.skillPackNames, await loadSkillPacks(), 3),
    });
    await prisma.interviewQuestionEvaluation.update({
      where: { id: input.evaluationId },
      data: { exemplarJson: JSON.stringify(exemplar) },
    });
  } catch (error) {
    console.error("示范回答生成失败，报告照常。", error);
  }
}

export async function evaluatePersistedMockInterviewQuestion(interviewQuestionId: string): Promise<boolean> {
  const claimed = await prisma.interviewQuestionEvaluation.updateMany({
    where: { interviewQuestionId, evaluationStatus: { in: ["pending", "failed"] } },
    data: { evaluationStatus: "running", evaluationError: null },
  });
  if (claimed.count !== 1) return false;

  try {
    const evaluation = await prisma.interviewQuestionEvaluation.findUnique({
      where: { interviewQuestionId },
      include: { interviewQuestion: { include: { interview: { include: { mockSession: true } } } } },
    });
    const question = evaluation?.interviewQuestion;
    const session = question?.interview.mockSession;
    const answer = question?.answer?.trim();
    if (!evaluation || !question || !session || !answer || question.skippedAt) {
      throw new Error("题目没有可评分的回答。");
    }
    const metadata = parseJsonObject(evaluation.generationMetadataJson);
    const brief = parseStoredBrief(session.briefJson);
    const area = brief?.areas.find((item) => item.id === metadata.areaId) ?? null;
    const result = await evaluateMockInterviewQuestion({
      question: question.question,
      answer,
      rubric: parseJsonValue(evaluation.rubricJson),
      expectedSignals: parseJsonValue(evaluation.expectedSignalsJson),
      jobTitle: question.interview.jobTitle,
      jobDescription: session.jdTextSnapshot,
      thread: threadContext(metadata, area?.depth ?? null),
      round: brief?.round ?? null,
    });
    // 只允许仍持有 running 认领的调用写终态：交卷路径会把超时的评分强制置
    // failed 并重跑，旧调用迟到的结果必须被丢弃，不能覆盖重跑的结果。
    const completed = await prisma.interviewQuestionEvaluation.updateMany({
      where: { id: evaluation.id, evaluationStatus: "running" },
      data: {
        evaluationStatus: "completed",
        evaluationError: null,
        score: result.score,
        dimensionsJson: JSON.stringify(result.evaluation.dimensions),
        strengthsJson: JSON.stringify(result.evaluation.strengths),
        weaknessesJson: JSON.stringify(result.evaluation.weaknesses),
        adviceJson: JSON.stringify(result.evaluation.advice),
        feedback: result.evaluation.feedback,
        evaluatedAt: new Date(),
      },
    });
    if (completed.count !== 1) return false;
    // 评分已落库，交卷不必等示范；示范在同一后台任务里接着跑。
    await attachExemplar({
      evaluationId: evaluation.id,
      runId: `exemplar:${question.id}`,
      jobTitle: question.interview.jobTitle,
      question: question.question,
      answer,
      weaknesses: result.evaluation.weaknesses,
      resumeText: session.resumeTextSnapshot,
      skillPackNames: brief?.skillPacks ?? [],
    });
    return true;
  } catch (error) {
    await prisma.interviewQuestionEvaluation.updateMany({
      where: { interviewQuestionId, evaluationStatus: "running" },
      data: {
        evaluationStatus: "failed",
        evaluationError: error instanceof Error ? error.message.slice(0, 1_000) : "逐题评分失败。",
      },
    });
    throw error;
  }
}

export async function waitForRunningQuestionEvaluations(interviewQuestionIds: string[]): Promise<void> {
  if (interviewQuestionIds.length === 0) return;
  const deadline = Date.now() + RUNNING_EVALUATION_WAIT_MS;
  while (Date.now() < deadline) {
    const runningCount = await prisma.interviewQuestionEvaluation.count({
      where: { interviewQuestionId: { in: interviewQuestionIds }, evaluationStatus: "running" },
    });
    if (runningCount === 0) return;
    await new Promise((resolve) => setTimeout(resolve, RUNNING_EVALUATION_POLL_MS));
  }
  await prisma.interviewQuestionEvaluation.updateMany({
    where: { interviewQuestionId: { in: interviewQuestionIds }, evaluationStatus: "running" },
    data: { evaluationStatus: "failed", evaluationError: "后台评分超时，交卷时自动补评。" },
  });
}
