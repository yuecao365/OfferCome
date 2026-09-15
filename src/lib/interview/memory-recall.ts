import "server-only";

import { prisma } from "@/lib/db";
import { REAL_USAGE_INTERVIEW_WHERE } from "@/lib/interviews/types";
import { parseJsonArray, parseJsonObject, parseJsonValue } from "@/lib/json";
import { parseStoredBrief } from "@/lib/mock-interviews/brief/brief";
import { competenciesOf } from "@/lib/mock-interviews/context";
import { parseStoredEvaluationList, type EvaluationWeakness } from "@/lib/mock-interviews/question-evaluation";

import { estimate, type Observation } from "./estimator";
import { EMPTY_MEMORY, type InterviewMemory } from "./memory";

/**
 * 语义记忆的读取：同一份简历、已完成、非评测的最近几场，把假设验证、事后能力估计、评分短板、问过的题
 * 物化成一份 InterviewMemory。不加表：记忆就是这些产物的另一种读法。备课完成时 recall 一次存进会话快照。
 */

const RECALL_SESSIONS = 10;

/** includeEval：连评测场次一起算（只给 recall 脚本核对用；真实备课不带）。 */
export async function recallCandidateMemory(input: { resumeId: string; excludeSessionId?: string; includeEval?: boolean }): Promise<InterviewMemory> {
  const sessions = await prisma.mockInterviewSession.findMany({
    where: { resumeId: input.resumeId, status: "completed", ...(input.excludeSessionId ? { id: { not: input.excludeSessionId } } : {}), ...(input.includeEval ? {} : { interview: REAL_USAGE_INTERVIEW_WHERE }) },
    orderBy: { completedAt: "desc" },
    take: RECALL_SESSIONS,
    include: {
      threads: { select: { competencyId: true, difficulty: true, questionId: true, entryQuestion: true } },
      interview: { select: { questions: { select: { id: true, evaluation: { select: { score: true, lowConfidence: true, weaknessesJson: true, generationMetadataJson: true, evaluationStatus: true } } } } } },
    },
  });
  if (sessions.length === 0) return EMPTY_MEMORY;
  const memory: InterviewMemory = { sessions: sessions.length, claims: [], competencies: [], weaknesses: [], askedQuestions: [] };
  for (const session of sessions) {
    const at = (session.completedAt ?? session.startedAt ?? session.createdAt).toISOString();
    const brief = parseStoredBrief(session.briefJson);
    const judged = new Map((parseJsonArray(session.hypothesesJson) as { id?: string; status?: string; note?: string | null }[]).map((item) => [item.id, item] as const));
    for (const hypothesis of brief?.hypotheses ?? []) {
      const verdict = judged.get(hypothesis.id);
      if (verdict?.status !== "confirmed" && verdict?.status !== "refuted") continue;
      memory.claims.push({ text: hypothesis.text, evidence: hypothesis.evidence, status: verdict.status, note: verdict.note ?? null, at });
    }
    const evaluations = new Map(session.interview.questions.map((question) => [question.id, question.evaluation] as const));
    const observations: Observation[] = session.threads.flatMap((thread) => {
      const evaluation = thread.questionId ? evaluations.get(thread.questionId) : null;
      if (!thread.competencyId || thread.difficulty === null || !evaluation || evaluation.score === null) return [];
      return [{ competencyId: thread.competencyId, difficulty: thread.difficulty, score: evaluation.score, confidence: evaluation.lowConfidence ? 0.5 : 1 }];
    });
    for (const item of estimate(competenciesOf(session.contextSnapshotJson), observations)) {
      if (item.samples > 0) memory.competencies.push({ competencyId: item.competencyId, mean: item.mean, confidence: item.confidence, samples: item.samples, at });
    }
    for (const question of session.interview.questions) {
      const evaluation = question.evaluation;
      if (!evaluation || evaluation.evaluationStatus !== "completed") continue;
      const metadata = parseJsonObject(evaluation.generationMetadataJson);
      const areaName = typeof metadata.areaName === "string" ? metadata.areaName : null;
      for (const weakness of parseStoredEvaluationList<EvaluationWeakness>(parseJsonValue(evaluation.weaknessesJson), (point) => ({ point, quote: null, kind: "missing" }))) {
        memory.weaknesses.push({ point: weakness.point, quote: weakness.quote, areaName, at });
      }
    }
    for (const thread of session.threads) memory.askedQuestions.push({ text: thread.entryQuestion, at });
  }
  return memory;
}
