import "server-only";

import { prisma } from "@/lib/db";
import { REAL_USAGE_INTERVIEW_WHERE } from "@/lib/interviews/types";
import { parseJsonArray, parseJsonObject, parseJsonValue } from "@/lib/json";

import { estimate, type Estimate, type Observation } from "@/lib/interview/estimator";
import { sessionFlags } from "@/lib/interview/flags";
import { conversationView, traceTurns, type TraceRun } from "@/lib/interview/views";

import { parseStoredBrief } from "./brief/brief";
import { competenciesOf } from "./context";
import {
  parseStoredEvaluationList,
  type AnswerExemplar,
  type EvaluationStrength,
  type EvaluationWeakness,
} from "./question-evaluation";
import { parseStoredReport } from "./report";
import { buildQuestionTeaching } from "./teaching";
import {
  isMockInterviewMode,
  type MockInterviewTrace,
  type MockInterviewView,
  type MockInterviewGenerationErrorContext,
} from "./types";

function parseArray<T>(value: string | null): T[] {
  return parseJsonArray(value) as T[];
}

/** 评分 v2 的视图；旧记录的 strengths 是字符串数组、没有 gap / 短板 / 示范，读出时补齐。 */
function buildEvaluationView(
  evaluation: NonNullable<SessionWithConversation["interview"]["questions"][number]["evaluation"]>,
): NonNullable<MockInterviewView["questions"][number]["evaluation"]> {
  const dimensions = parseArray<{ name: string; score: number; evidence: string; gap?: string | null }>(evaluation.dimensionsJson);
  return {
    score: evaluation.score,
    dimensions: dimensions.map((dimension) => ({ ...dimension, gap: dimension.gap ?? null })),
    strengths: parseStoredEvaluationList<EvaluationStrength>(parseJsonValue(evaluation.strengthsJson), (point) => ({ point, quote: null })),
    weaknesses: parseStoredEvaluationList<EvaluationWeakness>(parseJsonValue(evaluation.weaknessesJson), (point) => ({
      point,
      quote: null,
      kind: "missing",
    })),
    advice: parseArray<string>(evaluation.adviceJson),
    feedback: evaluation.feedback ?? "",
    lowConfidence: evaluation.lowConfidence,
    exemplar: (parseJsonValue(evaluation.exemplarJson) as AnswerExemplar | null) ?? null,
  };
}

type SessionWithConversation = NonNullable<Awaited<ReturnType<typeof loadSessionForView>>>;

function loadSessionForView(id: string) {
  return prisma.mockInterviewSession.findUnique({
    where: { id },
    include: {
      interview: {
        include: {
          questions: {
            include: { evaluation: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      messages: { orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }] },
      threads: { select: { competencyId: true, difficulty: true, questionId: true } },
    },
  });
}

/** 事后的能力估计：整理员的分段（能力、答到第几层）+ 双采样评分（低置信的段只算半次），与面试中同一个估计器。 */
function buildEstimates(session: SessionWithConversation): Estimate[] {
  const competencies = competenciesOf(session.contextSnapshotJson);
  if (session.status !== "completed" || competencies.length === 0) return [];
  const scoreOf = new Map(session.interview.questions.map((question) => [question.id, question.evaluation] as const));
  const observations: Observation[] = session.threads.flatMap((thread) => {
    const evaluation = thread.questionId ? scoreOf.get(thread.questionId) : null;
    if (!thread.competencyId || thread.difficulty === null || !evaluation || evaluation.score === null) return [];
    return [{ competencyId: thread.competencyId, difficulty: thread.difficulty, score: evaluation.score, confidence: evaluation.lowConfidence ? 0.5 : 1 }];
  });
  return estimate(competencies, observations);
}

/** 对话式会话的视图；没有简报（备课未完成）时为 null。 */
function buildConversation(session: SessionWithConversation) {
  const brief = parseStoredBrief(session.briefJson);
  if (!brief) return null;
  return conversationView({
    brief,
    status: session.status,
    startedAt: session.startedAt?.toISOString() ?? null,
    totalMinutes: session.durationMinutes,
    notebook: session.notebook,
    messages: session.messages.map((message) => ({ id: message.id, turnIndex: message.turnIndex, role: message.role === "candidate" ? "candidate" : "interviewer", kind: message.kind, content: message.content })),
  });
}

export async function getMockInterviewView(id: string): Promise<MockInterviewView | null> {
  const session = await loadSessionForView(id);
  if (!session) return null;
  const snapshot = parseJsonObject(session.contextSnapshotJson);
  const generationErrorContext =
    snapshot.generationErrorContext &&
    typeof snapshot.generationErrorContext === "object"
      ? (snapshot.generationErrorContext as MockInterviewGenerationErrorContext)
      : null;
  return {
    id: session.id,
    interviewId: session.interviewId,
    companyName: session.interview.companyName,
    jobTitle: session.interview.jobTitle,
    status: session.status,
    generationPhase: session.generationPhase,
    generationErrorCode: session.generationErrorCode,
    generationError: session.generationError,
    generationErrorContext,
    interactionMode: isMockInterviewMode(session.interactionMode)
      ? session.interactionMode
      : "text",
    questionCount: session.questionCount,
    totalScore: session.totalScore,
    report: parseStoredReport(session.reportJson),
    materials: { resumeText: session.resumeTextSnapshot, jobDescription: session.jdTextSnapshot },
    conversation: buildConversation(session),
    estimates: buildEstimates(session),
    questions: session.interview.questions.map((question) => {
      const completedEvaluation =
        session.status === "completed" ? question.evaluation : null;

      return {
        id: question.id,
        question: question.question,
        answer: question.answer ?? "",
        category: question.category,
        sortOrder: question.sortOrder,
        skipped: Boolean(question.skippedAt),
        ...(completedEvaluation
          ? {
              teaching: buildQuestionTeaching({
                metadata: parseJsonValue(completedEvaluation.generationMetadataJson),
                expectedSignals: parseJsonValue(completedEvaluation.expectedSignalsJson),
                sourceKind: completedEvaluation.sourceKind,
              }),
            }
          : {}),
        evaluation: completedEvaluation ? buildEvaluationView(completedEvaluation) : null,
      };
    }),
  };
}

export async function hasCompletedMockInterview(): Promise<boolean> {
  const count = await prisma.mockInterviewSession.count({
    where: { status: "completed" },
  });
  return count > 0;
}

export async function getRecentMockInterviews() {
  return prisma.mockInterviewSession.findMany({
    where: { interview: REAL_USAGE_INTERVIEW_WHERE },
    include: {
      interview: {
        select: { companyName: true, jobTitle: true, updatedAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
}

/** trace 页面：从事件日志拼每回合的候选人的话、面试官的话、笔记、时钟与模型开销。 */
export async function getMockInterviewTrace(id: string): Promise<MockInterviewTrace | null> {
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id },
    include: { interview: { select: { companyName: true, jobTitle: true } }, events: { orderBy: { seq: "asc" } } },
  });
  if (!session) return null;
  const brief = parseStoredBrief(session.briefJson);
  if (!brief) return null;
  const runs = await prisma.agentRun.findMany({
    where: { runId: { startsWith: `turn:${id}:` }, event: "model_call" },
    select: { runId: true, status: true, durationMs: true, totalTokens: true, cachedTokens: true, errorKind: true },
  });
  // 一回合一次调用（多步共用一个 runId）：按 runId 合并开销，状态取最差的那次。
  const runById = new Map<string, TraceRun>();
  const sum = (previous: number | null | undefined, current: number | null) => (current === null && previous == null ? null : (previous ?? 0) + (current ?? 0));
  for (const run of runs) {
    const previous = runById.get(run.runId);
    runById.set(run.runId, {
      status: previous && previous.status !== "success" ? previous.status : run.status,
      durationMs: (previous?.durationMs ?? 0) + run.durationMs,
      totalTokens: sum(previous?.totalTokens, run.totalTokens),
      cachedTokens: sum(previous?.cachedTokens, run.cachedTokens),
      errorKind: previous?.errorKind ?? run.errorKind,
    });
  }
  return {
    id: session.id,
    companyName: session.interview.companyName,
    jobTitle: session.interview.jobTitle,
    status: session.status,
    pace: brief.pace,
    totalMinutes: session.durationMinutes,
    areas: brief.areas.map((area) => ({ id: area.id, name: area.name, kind: area.kind })),
    competencies: competenciesOf(session.contextSnapshotJson).map((item) => ({ id: item.id, name: item.name })),
    flags: { policy: sessionFlags(session.flagsJson).policy ?? "v2", shadow: sessionFlags(session.flagsJson).shadow, critic: sessionFlags(session.flagsJson).critic },
    rows: traceTurns(
      session.events.map((row) => ({ type: row.type, payload: parseJsonObject(row.payloadJson), runId: row.runId })),
      runById,
    ),
  };
}
