import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";

import {
  buildMockInterviewContext,
  serializeMockInterviewContext,
  type MockInterviewContext,
} from "./context";
import { isMockInterviewGenerationError } from "./errors";
import { enrichMockInterviewJob } from "./jd-enrichment-agent";
import {
  MIN_JD_CHARS_FOR_AUTO_ENRICH,
  needsJobDescriptionReview,
} from "./jd-sufficiency";
import { analyzeMockInterviewJob } from "./job-analysis-agent";
import { generateMockInterviewPlan } from "./question-generation-agent";
import {
  claimSession,
  parseGenerationSnapshot,
  type GenerationSnapshot,
} from "./session-state";
import {
  ACTIVE_MOCK_INTERVIEW_STATUS,
  storedJobBlueprintSchema,
  type MockInterviewJobBlueprint,
} from "./types";

/**
 * 出题流水线：蓝图 → JD 补全 → 出题 → 落库。
 *
 * 两条贯穿全程的规则：
 * 1. 每一步推进状态都用乐观锁，写不中就安静放弃——说明用户已经重试或删除了会话。
 * 2. 除了"模型完全不可用"，任何一步都要降级继续，绝不把死胡同丢给用户。
 */

type GenerationSessionRow = NonNullable<
  Awaited<ReturnType<typeof loadGeneratingSession>>
>;

async function loadGeneratingSession(sessionId: string) {
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    include: {
      interview: { select: { companyName: true, jobTitle: true } },
    },
  });
  if (!session || session.status !== "generating" || !session.resumeId) {
    return null;
  }
  return session;
}

type GenerationRequest = {
  difficulty: string;
  round: string | null;
  seedQuestionId: string | null;
  seedInsightId: string | null;
  jdStrategy: "enrich" | "proceed" | null;
};

/** 创建会话时写进快照的生成参数。历史数据字段可能缺失，逐个兜底。 */
function readGenerationRequest(snapshot: GenerationSnapshot): GenerationRequest {
  const request = snapshot.generationRequest ?? {};
  return {
    difficulty:
      typeof request.difficulty === "string" ? request.difficulty : "standard",
    round: typeof request.round === "string" ? request.round : null,
    seedQuestionId:
      typeof request.seedQuestionId === "string" ? request.seedQuestionId : null,
    seedInsightId:
      typeof request.seedInsightId === "string" ? request.seedInsightId : null,
    jdStrategy:
      request.jdStrategy === "enrich" || request.jdStrategy === "proceed"
        ? request.jdStrategy
        : null,
  };
}

/** 会话被别的流程改动时，各阶段统一用它表示"安静放弃"。 */
const ABANDONED = Symbol("abandoned");
type Abandoned = typeof ABANDONED;

function saveSnapshot(sessionId: string, snapshot: GenerationSnapshot) {
  return claimSession(prisma, {
    where: { id: sessionId, status: "generating" },
    data: { contextSnapshotJson: JSON.stringify(snapshot) },
  });
}

/**
 * 阶段一：拿到岗位能力蓝图。
 * 蓝图已经在快照里就直接复用——重试时不必重跑一次模型。
 */
async function ensureBlueprint(
  session: GenerationSessionRow,
  snapshot: GenerationSnapshot,
  generationId: string,
): Promise<MockInterviewJobBlueprint | Abandoned> {
  const stored = storedJobBlueprintSchema.safeParse(snapshot.jobBlueprint);
  if (stored.success) return stored.data;

  await claimSession(prisma, {
    where: { id: session.id, status: "generating" },
    data: { generationPhase: "job_blueprint" },
  });
  // analyzeMockInterviewJob 自带四级降级，不会抛出"没有蓝图"这种终态。
  const blueprint = await analyzeMockInterviewJob({
    generationId,
    jobTitle: session.interview.jobTitle,
    jobDescription: session.jdTextSnapshot,
  });
  snapshot.jobBlueprint = blueprint;

  return (await saveSnapshot(session.id, snapshot)) ? blueprint : ABANDONED;
}

/**
 * 阶段二：处理 JD 信息不足。
 *
 * JD 偏薄不再打断用户：只有 JD 几乎为空（连补全都没有素材）才暂停询问；
 * 一般偏薄直接自动补全通用要求继续，补全内容带 origin=inferred 标注可回溯。
 */
async function resolveJobDescriptionGap(
  session: GenerationSessionRow,
  snapshot: GenerationSnapshot,
  blueprint: MockInterviewJobBlueprint,
  request: GenerationRequest,
): Promise<MockInterviewJobBlueprint | Abandoned> {
  const needsReview =
    !request.jdStrategy &&
    needsJobDescriptionReview(blueprint, session.questionCount);

  if (
    needsReview &&
    session.jdTextSnapshot.trim().length < MIN_JD_CHARS_FOR_AUTO_ENRICH
  ) {
    snapshot.jdReviewCount =
      (typeof snapshot.jdReviewCount === "number" ? snapshot.jdReviewCount : 0) + 1;
    await claimSession(prisma, {
      where: { id: session.id, status: "generating" },
      data: {
        status: "awaiting_jd_review",
        generationPhase: null,
        contextSnapshotJson: JSON.stringify(snapshot),
      },
    });
    return ABANDONED;
  }

  if (request.jdStrategy !== "enrich" && !needsReview) return blueprint;

  // 失败重试会把 phase 重置回 job_blueprint，JD 审查路径则停在 questions；
  // 两条入口都必须能认领，否则重试会静默丢失、会话永远停在 generating。
  const claimed = await claimSession(prisma, {
    where: {
      id: session.id,
      status: "generating",
      generationPhase: { in: ["job_blueprint", "questions", "job_enrichment"] },
    },
    data: { generationPhase: "job_enrichment" },
  });
  if (!claimed) return ABANDONED;

  try {
    const enriched = await enrichMockInterviewJob({
      jobTitle: session.interview.jobTitle,
      jobDescription: session.jdTextSnapshot,
      blueprint,
    });
    snapshot.jobBlueprint = enriched;
    return (await saveSnapshot(session.id, snapshot)) ? enriched : ABANDONED;
  } catch (error) {
    // 补全是锦上添花：失败就带着现有蓝图继续出题，不作为终态错误。
    console.warn(
      "[mock-interviews] enrich failed, continuing with existing blueprint:",
      error instanceof Error ? error.message : "unknown error",
    );
    return blueprint;
  }
}

/** 阶段三：出题。偶发失败先静默重试一次，重试再失败才打扰用户。 */
async function planQuestions(input: {
  generationId: string;
  context: MockInterviewContext;
  blueprint: MockInterviewJobBlueprint;
  jobTitle: string;
  questionCount: number;
  difficulty: string;
  round: string | null;
  seedQuestionId: string | null;
  seedInsightId: string | null;
}) {
  try {
    return await generateMockInterviewPlan(input);
  } catch (firstError) {
    console.warn(
      "[mock-interviews] question generation failed, retrying once:",
      firstError instanceof Error ? firstError.message : "unknown error",
    );
    return generateMockInterviewPlan(input);
  }
}

/** 阶段四：题目连同评分 rubric 一起落库，并把房间打开。 */
async function persistQuestions(
  session: GenerationSessionRow,
  snapshot: GenerationSnapshot,
  context: MockInterviewContext,
  generated: Awaited<ReturnType<typeof planQuestions>>,
): Promise<void> {
  const projectIds = new Set(context.projects.map((project) => project.id));

  await prisma.$transaction(async (tx) => {
    const claimed = await claimSession(tx, {
      where: {
        id: session.id,
        status: "generating",
        generationPhase: "questions",
      },
      data: { generationPhase: "persisting" },
    });
    if (!claimed) return;

    const existingQuestionCount = await tx.interviewQuestion.count({
      where: { interviewId: session.interviewId },
    });
    if (existingQuestionCount > 0) {
      throw new Error("模拟面试题目已经生成，请刷新页面。");
    }

    for (const [index, question] of generated.plan.questions.entries()) {
      await tx.interviewQuestion.create({
        data: {
          interviewId: session.interviewId,
          question: question.question.trim(),
          answer: null,
          category: question.category,
          resumeProjectId:
            question.category === "resume_project" &&
            question.resumeProjectId &&
            projectIds.has(question.resumeProjectId)
              ? question.resumeProjectId
              : null,
          sortOrder: index,
          evaluation: {
            create: {
              difficulty: question.difficulty,
              sourceKind: question.sourceKind,
              rubricJson: JSON.stringify(question.rubric),
              expectedSignalsJson: JSON.stringify(question.expectedSignals),
              generationMetadataJson: JSON.stringify({
                jobCompetencyId: question.jobCompetencyId,
                jdEvidence: question.jdEvidence,
                relevanceScore: question.relevanceScore,
                personalizationSourceId: question.personalizationSourceId,
                rationale: question.rationale,
              }),
            },
          },
        },
      });
    }

    const completed = await claimSession(tx, {
      where: {
        id: session.id,
        status: "generating",
        generationPhase: "persisting",
      },
      data: {
        contextSnapshotJson: JSON.stringify({
          ...parseGenerationSnapshot(
            serializeMockInterviewContext(context, {
              blueprint: generated.blueprint,
              personalization: generated.personalization,
            }),
          ),
          generationRequest: snapshot.generationRequest,
          jdReviewCount: snapshot.jdReviewCount,
        }),
        status: "in_progress",
        generationPhase: null,
        generationErrorCode: null,
        generationError: null,
        // 数量软化后实际题数可能少于请求数，按实际数落库，
        // 房间进度和交卷判定都以此为准。
        questionCount: generated.plan.questions.length,
      },
    });
    if (!completed) {
      throw new Error("生成状态已变化，请刷新页面。");
    }

    await tx.interview.update({
      where: { id: session.interviewId },
      data: { status: ACTIVE_MOCK_INTERVIEW_STATUS },
    });
  });
}

/** 把失败写进会话，让房间显示可操作的失败卡片，而不是一直转圈。 */
async function recordGenerationFailure(
  sessionId: string,
  snapshot: GenerationSnapshot,
  error: unknown,
): Promise<void> {
  snapshot.generationErrorContext = isMockInterviewGenerationError(error)
    ? error.context
    : null;

  await claimSession(prisma, {
    where: { id: sessionId, status: "generating" },
    data: {
      status: "generation_failed",
      generationPhase: null,
      generationErrorCode: isMockInterviewGenerationError(error)
        ? error.code
        : "model_unavailable",
      generationError:
        error instanceof Error
          ? error.message.slice(0, 1_000)
          : "面试题生成没有完成。生成服务没有返回可用结果。你可以重新分析岗位描述，或减少题目数量。",
      contextSnapshotJson: JSON.stringify(snapshot),
    },
  });
}

export async function generateMockInterviewQuestions(
  sessionId: string,
): Promise<void> {
  const session = await loadGeneratingSession(sessionId);
  if (!session) return;

  const generationId = randomUUID();
  const snapshot = parseGenerationSnapshot(session.contextSnapshotJson);
  const request = readGenerationRequest(snapshot);

  try {
    const context = await buildMockInterviewContext({
      resumeId: session.resumeId!,
      jobTitle: session.interview.jobTitle,
      jobDescription: session.jdTextSnapshot,
      seedQuestionId: request.seedQuestionId,
      seedInsightId: request.seedInsightId,
    });

    const analyzed = await ensureBlueprint(session, snapshot, generationId);
    if (analyzed === ABANDONED) return;

    const blueprint = await resolveJobDescriptionGap(
      session,
      snapshot,
      analyzed,
      request,
    );
    if (blueprint === ABANDONED) return;

    const advanced = await claimSession(prisma, {
      where: { id: sessionId, status: "generating" },
      data: { generationPhase: "questions" },
    });
    if (!advanced) return;

    const generated = await planQuestions({
      generationId,
      context,
      blueprint,
      jobTitle: session.interview.jobTitle,
      questionCount: session.questionCount,
      difficulty: request.difficulty,
      round: request.round,
      seedQuestionId: request.seedQuestionId,
      seedInsightId: request.seedInsightId,
    });

    await persistQuestions(session, snapshot, context, generated);
  } catch (error) {
    await recordGenerationFailure(sessionId, snapshot, error);
  }
}

export async function claimMockInterviewGenerationRetry(
  sessionId: string,
  questionCount?: number,
  strategy?: "enrich",
): Promise<boolean> {
  const normalizedQuestionCount =
    typeof questionCount === "number" ? Math.trunc(questionCount) : null;
  if (
    normalizedQuestionCount !== null &&
    (normalizedQuestionCount < 3 || normalizedQuestionCount > 12)
  ) {
    return false;
  }

  const session = await prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    select: { status: true, contextSnapshotJson: true },
  });
  if (!session || session.status !== "generation_failed") return false;

  const snapshot = parseGenerationSnapshot(session.contextSnapshotJson);
  snapshot.generationRequest ??= {};
  snapshot.generationRequest.jdStrategy = strategy;
  snapshot.generationErrorContext = null;

  return claimSession(prisma, {
    where: { id: sessionId, status: "generation_failed" },
    data: {
      status: "generating",
      generationPhase: "job_blueprint",
      generationErrorCode: null,
      generationError: null,
      contextSnapshotJson: JSON.stringify(snapshot),
      ...(normalizedQuestionCount === null
        ? {}
        : { questionCount: normalizedQuestionCount }),
    },
  });
}

export type JobDescriptionStrategy = "supplement" | "enrich" | "proceed";

export async function applyJobDescriptionStrategy(input: {
  sessionId: string;
  strategy: JobDescriptionStrategy;
  additionalText?: string;
}): Promise<boolean> {
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id: input.sessionId },
    select: {
      status: true,
      jdTextSnapshot: true,
      contextSnapshotJson: true,
    },
  });
  if (!session || session.status !== "awaiting_jd_review") return false;

  const snapshot = parseGenerationSnapshot(session.contextSnapshotJson);
  const reviewCount =
    typeof snapshot.jdReviewCount === "number" ? snapshot.jdReviewCount : 1;
  const additionalText = input.additionalText?.trim() ?? "";
  const supplementedJobDescription = `${session.jdTextSnapshot.trim()}\n\n${additionalText}`;
  if (
    input.strategy === "supplement" &&
    (reviewCount >= 2 ||
      !additionalText ||
      additionalText.length > 30_000 ||
      supplementedJobDescription.length > 100_000)
  ) {
    return false;
  }

  snapshot.generationRequest ??= {};
  snapshot.generationRequest.jdStrategy =
    input.strategy === "supplement" ? undefined : input.strategy;
  // 用户补了原文，蓝图必须按新 JD 重算。
  if (input.strategy === "supplement") snapshot.jobBlueprint = undefined;

  return claimSession(prisma, {
    where: { id: input.sessionId, status: "awaiting_jd_review" },
    data: {
      status: "generating",
      generationPhase:
        input.strategy === "supplement" ? "job_blueprint" : "questions",
      jdTextSnapshot:
        input.strategy === "supplement"
          ? supplementedJobDescription
          : session.jdTextSnapshot,
      contextSnapshotJson: JSON.stringify(snapshot),
      generationErrorCode: null,
      generationError: null,
    },
  });
}
