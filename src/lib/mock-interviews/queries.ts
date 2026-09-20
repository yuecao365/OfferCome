import "server-only";

import { prisma } from "@/lib/db";
import { REAL_USAGE_INTERVIEW_WHERE } from "@/lib/interviews/types";
import { parseJsonArray, parseJsonObject, parseJsonValue } from "@/lib/json";

import { estimate, type Estimate, type Observation } from "@/lib/interview/estimator";
import { ledgerOf, parseEventRow, type InterviewEvent } from "@/lib/interview/events";
import { renderLedger } from "@/lib/interview/state";
import { planQuota } from "@/lib/interview/progress";
import { loadEvaluationRuns } from "@/lib/interview/eval/facts";
import { postmortem } from "@/lib/interview/eval/postmortem";
import { agentChainsOf } from "@/lib/interview/trace-steps";
import { conversationView, traceTurns, type TraceRun, progressSummaryOf } from "@/lib/interview/views";

import { briefReady, parseStoredBrief } from "./brief/brief";
import { businessOf, competenciesOf } from "./context";
import {
  parseStoredEvaluationList,
  type AnswerExemplar,
  type EvaluationStrength,
  type EvaluationWeakness,
  type ResumeCheck,
} from "./question-evaluation";
import { parseStoredReport } from "./report";
import { buildSegmentInfo } from "./segment-info";
import {
  isMockInterviewMode,
  type MockInterviewTrace,
  type MockInterviewView,
  type MockInterviewGenerationErrorContext,
} from "./types";

function parseArray<T>(value: string | null): T[] {
  return parseJsonArray(value) as T[];
}

/** 评分的视图；旧记录的 strengths 是字符串数组、短板没有练法、结论是长评语，读出时补齐。 */
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
      practice: "",
    })).map((item) => ({ ...item, practice: typeof item.practice === "string" ? item.practice : "" })),
    resumeChecks: parseArray<ResumeCheck>(evaluation.resumeChecksJson).filter((item) => typeof item?.claim === "string" && typeof item.resumeSays === "string"),
    verdict: evaluation.verdict ?? "",
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
      events: { orderBy: { seq: "asc" } },
      threads: { select: { competencyId: true, difficulty: true, questionId: true } },
    },
  });
}

/** 事后的能力估计：分段（能力、答到第几层）+ 评分，与评测同一个估计器。 */
function buildEstimates(session: SessionWithConversation): Estimate[] {
  const competencies = competenciesOf(session.contextSnapshotJson);
  if (session.status !== "completed" || competencies.length === 0) return [];
  const scoreOf = new Map(session.interview.questions.map((question) => [question.id, question.evaluation] as const));
  const observations: Observation[] = session.threads.flatMap((thread) => {
    const evaluation = thread.questionId ? scoreOf.get(thread.questionId) : null;
    if (!thread.competencyId || thread.difficulty === null || !evaluation || evaluation.score === null) return [];
    return [{ competencyId: thread.competencyId, difficulty: thread.difficulty, score: evaluation.score, confidence: 1 }];
  });
  return estimate(competencies, observations);
}

/** 对话式会话的视图；没有简报（备课未完成）时为 null。 */
function buildConversation(session: SessionWithConversation) {
  const brief = parseStoredBrief(session.briefJson);
  if (!brief) return null;
  const events = session.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
  return conversationView({
    brief,
    status: session.status,
    startedAt: session.startedAt?.toISOString() ?? null,
    ledger: renderLedger(brief, ledgerOf(events)),
    messages: session.messages.map((message) => ({ id: message.id, turnIndex: message.turnIndex, role: message.role === "candidate" ? "candidate" : "interviewer", kind: message.kind, content: message.content })),
    // 本地版的消息表不存材料 id：进度从事件日志算。
    progress: progressSummaryOf(brief, events),
  });
}

export async function getMockInterviewView(id: string): Promise<MockInterviewView | null> {
  const session = await loadSessionForView(id);
  if (!session) return null;
  const dossier = await prisma.candidateDossier.findFirst({ where: { sessionId: id }, select: { version: true, changes: true } });
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
    business: businessOf(session.contextSnapshotJson),
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
    dossier: dossier ? { version: dossier.version, changes: dossier.changes } : null,
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
        ...(completedEvaluation ? { segment: buildSegmentInfo({ metadata: parseJsonValue(completedEvaluation.generationMetadataJson), sourceKind: completedEvaluation.sourceKind }) } : {}),
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
    include: { interview: { select: { companyName: true, jobTitle: true, questions: { select: { id: true } } } }, events: { orderBy: { seq: "asc" } } },
  });
  if (!session) return null;
  const brief = parseStoredBrief(session.briefJson);
  if (!brief) return null;
  const questionIds = session.interview.questions.map((question) => question.id);
  // 这场所有 agent 的记账行：面试官每回合、评分（带工具的那次与对照）、示范、档案。按 runId 归链，每链按步。
  const rows = await prisma.agentRun.findMany({
    where: {
      OR: [
        { runId: { startsWith: `turn:${id}:` } },
        { runId: `dossier:${id}` },
        ...(questionIds.length > 0 ? [{ runId: { in: questionIds.flatMap((questionId) => [`eval:${questionId}`, `exemplar:${questionId}`]) } }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { runId: true, agent: true, event: true, status: true, durationMs: true, totalTokens: true, cachedTokens: true, errorKind: true, metricsJson: true, payloadJson: true, outputJson: true, rawText: true, systemText: true, createdAt: true },
  });
  const chains = agentChainsOf(rows);
  const runById = new Map<string, TraceRun>();
  for (const chain of chains) {
    if (!chain.runId.startsWith(`turn:${id}:`)) continue;
    const calls = chain.steps.filter((step) => step.event === "model_call");
    runById.set(chain.runId, {
      status: chain.status,
      durationMs: chain.durationMs,
      totalTokens: calls.length === 0 ? null : chain.totalTokens,
      cachedTokens: calls.length === 0 ? null : calls.reduce((sum, step) => sum + (step.cachedTokens ?? 0), 0),
      errorKind: calls.find((step) => step.errorKind)?.errorKind ?? null,
      steps: chain.steps,
    });
  }
  const events = session.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null);
  const trajectory = { evaluation: await loadEvaluationRuns(questionIds), interviewerLookups: events.filter((item) => item.type === "tool_called").length };
  return {
    id: session.id,
    companyName: session.interview.companyName,
    jobTitle: session.interview.jobTitle,
    status: session.status,
    pace: brief.pace,
    plan: planQuota(brief),
    areas: brief.areas.map((area) => ({ id: area.id, name: area.name, kind: area.kind })),
    competencies: competenciesOf(session.contextSnapshotJson).map((item) => ({ id: item.id, name: item.name })),
    postmortem: postmortem({ events, brief, ready: briefReady({ competencies: competenciesOf(session.contextSnapshotJson) }, brief), trajectory }),
    rows: traceTurns(
      session.events.map((row) => ({ type: row.type, payload: parseJsonObject(row.payloadJson), runId: row.runId })),
      runById,
    ),
    agents: chains.filter((chain) => !chain.runId.startsWith(`turn:${id}:`)),
  };
}
