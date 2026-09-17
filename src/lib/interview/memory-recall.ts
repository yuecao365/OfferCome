import "server-only";

import { prisma } from "@/lib/db";
import { REAL_USAGE_INTERVIEW_WHERE } from "@/lib/interviews/types";
import { competenciesOf } from "@/lib/mock-interviews/context";

import { estimate, type Observation } from "./estimator";
import { EMPTY_MEMORY, type InterviewMemory } from "./memory";

/**
 * 跨场记忆的读取（代码侧）：同一份简历、已完成、非评测的最近几场，把事后能力估计物化成先验。不加表：记忆就是这些产物的另一种读法。
 * 备课完成时 recall 一次存进会话快照。给 agent 读的跨场内容（说法、短板、问过的角度）在候选人档案里（dossier.ts）。
 */

const RECALL_SESSIONS = 10;

/** includeEval：连评测场次一起算（评测会话自己用；真实备课不带）。 */
export async function recallCandidateMemory(input: { resumeId: string; excludeSessionId?: string; includeEval?: boolean }): Promise<InterviewMemory> {
  const sessions = await prisma.mockInterviewSession.findMany({
    where: { resumeId: input.resumeId, status: "completed", ...(input.excludeSessionId ? { id: { not: input.excludeSessionId } } : {}), ...(input.includeEval ? {} : { interview: REAL_USAGE_INTERVIEW_WHERE }) },
    orderBy: { completedAt: "desc" },
    take: RECALL_SESSIONS,
    include: {
      threads: { select: { competencyId: true, difficulty: true, questionId: true } },
      interview: { select: { questions: { select: { id: true, evaluation: { select: { score: true, lowConfidence: true } } } } } },
    },
  });
  if (sessions.length === 0) return EMPTY_MEMORY;
  const memory: InterviewMemory = { sessions: sessions.length, competencies: [] };
  for (const session of sessions) {
    const at = (session.completedAt ?? session.startedAt ?? session.createdAt).toISOString();
    const evaluations = new Map(session.interview.questions.map((question) => [question.id, question.evaluation] as const));
    const observations: Observation[] = session.threads.flatMap((thread) => {
      const evaluation = thread.questionId ? evaluations.get(thread.questionId) : null;
      if (!thread.competencyId || thread.difficulty === null || !evaluation || evaluation.score === null) return [];
      return [{ competencyId: thread.competencyId, difficulty: thread.difficulty, score: evaluation.score, confidence: evaluation.lowConfidence ? 0.5 : 1 }];
    });
    for (const item of estimate(competenciesOf(session.contextSnapshotJson), observations)) {
      if (item.samples > 0) memory.competencies.push({ competencyId: item.competencyId, mean: item.mean, confidence: item.confidence, samples: item.samples, at });
    }
  }
  return memory;
}
