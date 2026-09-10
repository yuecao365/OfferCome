import "server-only";

import { prisma } from "@/lib/db";
import { REAL_USAGE_INTERVIEW_WHERE } from "@/lib/interviews/types";
import { parseJsonArray, parseJsonObject, parseJsonValue } from "@/lib/json";

import { evidenceTargetForPace, parseStoredBrief } from "./interviewer/brief";
import { parseStoredMemory, type MemoryPatch } from "./interviewer/memory";
import type { MessageKind, MessageRole, ThreadStatus } from "./interviewer/state";
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
import { conversationView, traceTurns, type TraceRun } from "./views";

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
      threads: { orderBy: { createdAt: "asc" } },
    },
  });
}

/** 对话式会话的视图；没有简报（备课未完成）时为 null。 */
function buildConversation(session: SessionWithConversation) {
  const brief = parseStoredBrief(session.briefJson);
  if (!brief) return null;
  return conversationView({
    brief,
    status: session.status,
    startedAt: session.startedAt?.toISOString() ?? null,
    threads: session.threads.map((thread) => ({ ...thread, status: thread.status as ThreadStatus })),
    messages: session.messages.map((message) => ({ ...message, role: message.role as MessageRole, kind: message.kind as MessageKind })),
    memory: parseStoredMemory(session.memoryJson, brief),
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
    currentQuestionIndex: session.currentQuestionIndex,
    questionCount: session.questionCount,
    totalScore: session.totalScore,
    report: parseStoredReport(session.reportJson),
    conversation: buildConversation(session),
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

/** trace 页面：按回合把候选人的话、面试官的话、决策记录与模型开销拼在一起。 */
export async function getMockInterviewTrace(id: string): Promise<MockInterviewTrace | null> {
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id },
    include: {
      interview: { select: { companyName: true, jobTitle: true } },
      messages: { orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }] },
      decisions: { orderBy: { turnIndex: "asc" } },
    },
  });
  if (!session) return null;
  const brief = parseStoredBrief(session.briefJson);
  if (!brief) return null;
  const runs = await prisma.agentRun.findMany({
    where: { runId: { startsWith: `turn:${id}:` }, event: "model_call" },
    select: { runId: true, status: true, durationMs: true, totalTokens: true, errorKind: true },
  });
  const runByTurn = new Map<number, TraceRun>(runs.map((run) => [Number(run.runId.split(":").pop()), run]));

  return {
    id: session.id,
    companyName: session.interview.companyName,
    jobTitle: session.interview.jobTitle,
    status: session.status,
    pace: brief.pace,
    evidenceTarget: evidenceTargetForPace(brief.pace),
    areas: brief.areas.map((area) => ({ id: area.id, name: area.name, kind: area.kind, depth: area.depth })),
    turns: traceTurns({
      messages: session.messages.map((message) => ({
        turnIndex: message.turnIndex,
        role: message.role as MessageRole,
        kind: message.kind as MessageKind,
        content: message.content,
        toolName: message.toolName,
        composeMs: (parseJsonObject(message.metricsJson ?? "{}").composeMs as number | undefined) ?? null,
      })),
      decisions: session.decisions.map((decision) => ({
        turnIndex: decision.turnIndex,
        proposedAction: decision.proposedAction,
        appliedAction: decision.appliedAction,
        followUp: decision.followUp,
        replacedReason: decision.replacedReason,
        anchorHit: decision.anchorHit,
        memoryPatch: (parseJsonValue(decision.memoryPatchJson) as MemoryPatch | null) ?? null,
        evidenceBefore: decision.evidenceBefore,
        evidenceAfter: decision.evidenceAfter,
        skillsLoaded: decision.skillsLoaded,
        effects: (parseJsonValue(decision.effectsJson) as string[] | null) ?? [],
      })),
      runs: runByTurn,
    }),
  };
}
