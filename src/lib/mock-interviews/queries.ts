import "server-only";

import { prisma } from "@/lib/db";
import { parseJsonArray, parseJsonObject } from "@/lib/json";

import { parseStoredBrief } from "./interviewer/brief";
import { parseStoredMemory } from "./interviewer/memory";
import { buildQuestionTeaching } from "./teaching";
import {
  isMockInterviewMode,
  type MockInterviewConversation,
  type MockInterviewReport,
  type MockInterviewView,
  storedJobBlueprintSchema,
  type MockInterviewGenerationErrorContext,
} from "./types";

async function getProfileContributionCount(
  interviewId: string,
): Promise<number | null> {
  const assessment = await prisma.interviewAssessment.findFirst({
    where: { interviewId, status: "completed" },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  if (!assessment) return null;

  return prisma.abilityObservation.count({
    where: { assessmentId: assessment.id, status: "active" },
  });
}

function parseArray<T>(value: string | null): T[] {
  return parseJsonArray(value) as T[];
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

/** 对话式会话的视图；旧的分步会话没有简报，返回 null，房间按只读回放处理。 */
function buildConversation(session: SessionWithConversation): MockInterviewConversation | null {
  const brief = parseStoredBrief(session.briefJson);
  if (!brief) return null;
  const ended = session.status !== "in_progress";
  return {
    phase: ended ? "ended" : session.messages.length === 0 ? "opening" : "running",
    pace: brief.pace,
    turnRange: brief.turnRange,
    startedAt: session.startedAt?.toISOString() ?? null,
    areas: brief.areas.map((area) => {
      const threads = session.threads.filter((thread) => thread.areaId === area.id);
      return {
        id: area.id,
        name: area.name,
        kind: area.kind,
        depth: area.depth,
        depthReached: Math.max(0, ...threads.map((thread) => thread.depth)),
        status: threads.some((thread) => thread.status === "active")
          ? "active"
          : threads.length > 0
            ? "covered"
            : "pending",
      };
    }),
    threads: session.threads.map((thread) => ({
      id: thread.id,
      areaId: thread.areaId,
      status: thread.status as MockInterviewConversation["threads"][number]["status"],
      depth: thread.depth,
      rescues: thread.rescues,
    })),
    messages: session.messages.map((message) => ({
      id: message.id,
      turnIndex: message.turnIndex,
      role: message.role as "interviewer" | "candidate",
      kind: message.kind,
      content: message.content,
      threadId: message.threadId,
    })),
    // 工作记忆面试中不给候选人看，报告页展示"面试官当时的判断"。
    memory: session.status === "completed" ? parseStoredMemory(session.memoryJson, brief) : null,
    hypotheses: session.status === "completed" ? brief.hypotheses : [],
  };
}

export async function getMockInterviewView(id: string): Promise<MockInterviewView | null> {
  const session = await loadSessionForView(id);
  if (!session) return null;
  const snapshot = parseJsonObject(session.contextSnapshotJson);
  const blueprint = storedJobBlueprintSchema.safeParse(snapshot.jobBlueprint);
  const reviewCount =
    typeof snapshot.jdReviewCount === "number" ? snapshot.jdReviewCount : 0;
  const generationErrorContext =
    snapshot.generationErrorContext &&
    typeof snapshot.generationErrorContext === "object"
      ? (snapshot.generationErrorContext as MockInterviewGenerationErrorContext)
      : null;
  const profileContributionCount =
    session.status === "completed"
      ? await getProfileContributionCount(session.interviewId)
      : undefined;

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
    jobDescriptionReview:
      session.status === "awaiting_jd_review" && blueprint.success
        ? {
            completeness: blueprint.data.completeness,
            missingInformation: blueprint.data.missingInformation,
            canSupplement: reviewCount < 2,
          }
        : null,
    interactionMode: isMockInterviewMode(session.interactionMode)
      ? session.interactionMode
      : "text",
    currentQuestionIndex: session.currentQuestionIndex,
    questionCount: session.questionCount,
    totalScore: session.totalScore,
    report: session.reportJson
      ? (JSON.parse(session.reportJson) as MockInterviewReport)
      : null,
    ...(profileContributionCount !== undefined ? { profileContributionCount } : {}),
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
        isFollowUp: Boolean(question.parentQuestionId),
        parentQuestionId: question.parentQuestionId,
        ...(completedEvaluation
          ? {
              teaching: buildQuestionTeaching(
                session.contextSnapshotJson,
                completedEvaluation,
              ),
            }
          : {}),
        evaluation: completedEvaluation
          ? {
              score: completedEvaluation.score,
              dimensions: parseArray<{
                name: string;
                score: number;
                evidence: string;
              }>(completedEvaluation.dimensionsJson),
              strengths: parseArray<string>(completedEvaluation.strengthsJson),
              improvements: parseArray<string>(
                completedEvaluation.improvementsJson,
              ),
              feedback: completedEvaluation.feedback ?? "",
            }
          : null,
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
    include: {
      interview: {
        select: { companyName: true, jobTitle: true, updatedAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
}
