import "server-only";

import { randomUUID } from "node:crypto";

import { enqueueCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { prisma } from "@/lib/db";
import {
  ACTIVE_MOCK_INTERVIEW_STATUS,
  normalizeInterviewRound,
} from "@/lib/interviews/types";

import { analyzeMockInterviewJob } from "./job-analysis-agent";
import { enrichMockInterviewJob } from "./jd-enrichment-agent";
import { needsJobDescriptionReview } from "./jd-sufficiency";
import { generateMockInterviewPlan } from "./question-generation-agent";
import { computeInterviewTotalScore } from "./scoring";
import {
  buildMockInterviewContext,
  serializeMockInterviewContext,
} from "./context";
import {
  MOCK_INTERVIEW_DIFFICULTIES,
  isMockInterviewMode,
  MOCK_INTERVIEW_PROMPT_VERSION,
  type MockInterviewMode,
  type MockInterviewReport,
  mockInterviewJobBlueprintSchema,
} from "./types";
import { getAiTaskConfig } from "@/lib/settings/ai";
import { assertAiConfigured } from "@/lib/ai/run-agent";
import { isMockInterviewGenerationError } from "./errors";
import { generateMockInterviewFollowUp } from "./follow-up-agent";
import { canRequestFollowUp } from "./follow-up-policy";
import { resolveMockInterviewSeed } from "./seeds";
import { scheduleMockInterviewQuestionEvaluation } from "./question-evaluation-background";
import {
  evaluatePersistedMockInterviewQuestion,
  waitForRunningQuestionEvaluations,
} from "./question-evaluation-service";
import { summarizeMockInterview } from "./summary-agent";

export type CreateMockInterviewInput = {
  companyName: string;
  jobTitle: string;
  resumeId: string;
  jobDescription: string;
  jdOriginalName: string | null;
  round: string | null;
  difficulty: string;
  interactionMode: string;
  questionCount: number;
  followUpsEnabled?: boolean;
  seedQuestionId?: string | null;
  seedInsightId?: string | null;
  applicationId?: string | null;
};

/**
 * 校验投递关联是否真实存在；顺便把本次的岗位描述回填到还没有描述的投递上，
 * 这样用户粘贴一次之后，下次从同一条投递发起就能直接带出。
 */
async function linkApplication(
  applicationId: string | null | undefined,
  jobDescription: string,
): Promise<string | null> {
  if (!applicationId) return null;

  const application = await prisma.bossContact.findUnique({
    where: { id: applicationId },
    select: { id: true, jobDescription: true },
  });
  if (!application) return null;

  if (!application.jobDescription?.trim()) {
    await prisma.bossContact.update({
      where: { id: application.id },
      data: { jobDescription },
    });
  }
  return application.id;
}

function validateCreateInput(input: CreateMockInterviewInput) {
  const companyName = input.companyName.trim();
  const jobTitle = input.jobTitle.trim();
  const jobDescription = input.jobDescription.trim();
  const questionCount = Math.trunc(input.questionCount);
  if (!companyName || companyName.length > 120) throw new Error("请输入有效的公司名称。");
  if (!jobTitle || jobTitle.length > 120) throw new Error("请输入有效的岗位名称。");
  if (!jobDescription || jobDescription.length > 100_000) {
    throw new Error("请上传或粘贴有效的 Job Description。");
  }
  if (questionCount < 3 || questionCount > 12) {
    throw new Error("题目数量必须在 3 到 12 之间。");
  }
  if (!(MOCK_INTERVIEW_DIFFICULTIES as readonly string[]).includes(input.difficulty)) {
    throw new Error("请选择有效的面试难度。");
  }
  if (!isMockInterviewMode(input.interactionMode)) {
    throw new Error("请选择有效的作答方式。");
  }
  return {
    companyName,
    jobTitle,
    jobDescription,
    interactionMode: input.interactionMode as MockInterviewMode,
    questionCount,
  };
}

type GenerationSnapshot = {
  jobBlueprint?: unknown;
  generationRequest?: {
    difficulty?: unknown;
    round?: unknown;
    seedQuestionId?: unknown;
    seedInsightId?: unknown;
    jdStrategy?: unknown;
  };
  jdReviewCount?: unknown;
  generationErrorContext?: unknown;
  [key: string]: unknown;
};

function parseGenerationSnapshot(value: string): GenerationSnapshot {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as GenerationSnapshot)
      : {};
  } catch {
    return {};
  }
}

export async function createMockInterview(input: CreateMockInterviewInput) {
  const validated = validateCreateInput(input);
  const seed = await resolveMockInterviewSeed(input);
  if ((input.seedQuestionId || input.seedInsightId) && !seed) {
    throw new Error("所选训练内容不存在或已不可用，请重新选择。");
  }
  const seedQuestionId = seed?.kind === "question" ? seed.id : null;
  const seedInsightId = seed?.kind === "insight" ? seed.id : null;
  const [context, config, applicationId] = await Promise.all([
    buildMockInterviewContext({
      resumeId: input.resumeId,
      jobTitle: validated.jobTitle,
      jobDescription: validated.jobDescription,
      seedQuestionId,
      seedInsightId,
    }),
    getAiTaskConfig("text"),
    linkApplication(input.applicationId, validated.jobDescription),
  ]);
  assertAiConfigured(config, "AI 模拟面试");
  const now = new Date();
  const snapshot = parseGenerationSnapshot(serializeMockInterviewContext(context));
  snapshot.generationRequest = {
    difficulty: input.difficulty,
    round: input.round,
    seedQuestionId,
    seedInsightId,
  };

  return prisma.interview.create({
    data: {
      kind: "mock",
      companyName: validated.companyName,
      jobTitle: validated.jobTitle,
      // 关联便于回溯这场练习针对哪个岗位；模拟面试不推进投递阶段。
      applicationId,
      scheduledAt: now,
      round: normalizeInterviewRound(input.round),
      status: "generating",
      note: "AI 模拟面试",
      mockSession: {
        create: {
          resumeId: input.resumeId,
          jdOriginalName: input.jdOriginalName,
          jdTextSnapshot: validated.jobDescription,
          resumeTextSnapshot: context.resume.text,
          contextSnapshotJson: JSON.stringify(snapshot),
          status: "generating",
          generationPhase: "job_blueprint",
          followUpsEnabled: input.followUpsEnabled !== false,
          interactionMode: validated.interactionMode,
          questionCount: validated.questionCount,
          provider: config.provider,
          model: config.model,
          promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
        },
      },
    },
    select: { id: true, mockSession: { select: { id: true } } },
  });
}

export async function generateMockInterviewQuestions(
  sessionId: string,
): Promise<void> {
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    include: {
      interview: { select: { companyName: true, jobTitle: true } },
    },
  });
  if (!session || session.status !== "generating" || !session.resumeId) return;

  const generationId = randomUUID();
  const snapshot = parseGenerationSnapshot(session.contextSnapshotJson);
  const request = snapshot.generationRequest ?? {};
  const difficulty =
    typeof request.difficulty === "string" ? request.difficulty : "standard";
  const round = typeof request.round === "string" ? request.round : null;
  const seedQuestionId =
    typeof request.seedQuestionId === "string" ? request.seedQuestionId : null;
  const seedInsightId =
    typeof request.seedInsightId === "string" ? request.seedInsightId : null;
  const jdStrategy =
    request.jdStrategy === "enrich" || request.jdStrategy === "proceed"
      ? request.jdStrategy
      : null;

  try {
    const context = await buildMockInterviewContext({
      resumeId: session.resumeId,
      jobTitle: session.interview.jobTitle,
      jobDescription: session.jdTextSnapshot,
      seedQuestionId,
      seedInsightId,
    });
    const storedBlueprint = mockInterviewJobBlueprintSchema.safeParse(
      snapshot.jobBlueprint,
    );
    let blueprint = storedBlueprint.success ? storedBlueprint.data : null;
    if (!blueprint) {
      await prisma.mockInterviewSession.updateMany({
        where: { id: sessionId, status: "generating" },
        data: { generationPhase: "job_blueprint" },
      });
      blueprint = await analyzeMockInterviewJob({
        generationId,
        jobTitle: session.interview.jobTitle,
        jobDescription: session.jdTextSnapshot,
      });
      snapshot.jobBlueprint = blueprint;
      const saved = await prisma.mockInterviewSession.updateMany({
        where: { id: sessionId, status: "generating" },
        data: { contextSnapshotJson: JSON.stringify(snapshot) },
      });
      if (saved.count !== 1) return;
    }

    if (!jdStrategy && needsJobDescriptionReview(blueprint, session.questionCount)) {
      snapshot.jdReviewCount =
        (typeof snapshot.jdReviewCount === "number" ? snapshot.jdReviewCount : 0) + 1;
      const paused = await prisma.mockInterviewSession.updateMany({
        where: { id: sessionId, status: "generating" },
        data: {
          status: "awaiting_jd_review",
          generationPhase: null,
          contextSnapshotJson: JSON.stringify(snapshot),
        },
      });
      if (paused.count !== 1) return;
      return;
    }

    if (jdStrategy === "enrich") {
      // 失败重试会把 phase 重置回 job_blueprint，JD 审查路径则停在 questions；
      // 两条入口都必须能认领，否则重试会静默丢失、会话永远停在 generating。
      const enriching = await prisma.mockInterviewSession.updateMany({
        where: {
          id: sessionId,
          status: "generating",
          generationPhase: { in: ["job_blueprint", "questions", "job_enrichment"] },
        },
        data: { generationPhase: "job_enrichment" },
      });
      if (enriching.count !== 1) return;
      blueprint = await enrichMockInterviewJob({
        jobTitle: session.interview.jobTitle,
        jobDescription: session.jdTextSnapshot,
        blueprint,
      });
      snapshot.jobBlueprint = blueprint;
      const saved = await prisma.mockInterviewSession.updateMany({
        where: { id: sessionId, status: "generating" },
        data: { contextSnapshotJson: JSON.stringify(snapshot) },
      });
      if (saved.count !== 1) return;
    }

    const advanced = await prisma.mockInterviewSession.updateMany({
      where: { id: sessionId, status: "generating" },
      data: { generationPhase: "questions" },
    });
    if (advanced.count !== 1) return;
    const generated = await generateMockInterviewPlan({
      generationId,
      context,
      blueprint,
      jobTitle: session.interview.jobTitle,
      questionCount: session.questionCount,
      difficulty,
      round,
      seedQuestionId,
      seedInsightId,
    });
    const projectIds = new Set(context.projects.map((project) => project.id));

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.mockInterviewSession.updateMany({
        where: {
          id: sessionId,
          status: "generating",
          generationPhase: "questions",
        },
        data: { generationPhase: "persisting" },
      });
      if (claimed.count !== 1) return;
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
      const completed = await tx.mockInterviewSession.updateMany({
        where: {
          id: sessionId,
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
        },
      });
      if (completed.count !== 1) {
        throw new Error("生成状态已变化，请刷新页面。");
      }
      await tx.interview.update({
        where: { id: session.interviewId },
        data: { status: ACTIVE_MOCK_INTERVIEW_STATUS },
      });
    });
  } catch (error) {
    const code = isMockInterviewGenerationError(error)
      ? error.code
      : "model_unavailable";
    const message =
      error instanceof Error
        ? error.message.slice(0, 1_000)
        : "面试题生成没有完成。生成服务没有返回可用结果。你可以重新分析岗位描述，或减少题目数量。";
    snapshot.generationErrorContext = isMockInterviewGenerationError(error)
      ? error.context
      : null;
    await prisma.mockInterviewSession.updateMany({
      where: { id: sessionId, status: "generating" },
      data: {
        status: "generation_failed",
        generationPhase: null,
        generationErrorCode: code,
        generationError: message,
        contextSnapshotJson: JSON.stringify(snapshot),
      },
    });
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
  const result = await prisma.mockInterviewSession.updateMany({
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
  return result.count === 1;
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
  if (input.strategy === "supplement") snapshot.jobBlueprint = undefined;
  const result = await prisma.mockInterviewSession.updateMany({
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
  return result.count === 1;
}

export async function submitMockInterviewAnswer(input: {
  sessionId: string;
  questionId: string;
  answer?: string;
  skip?: boolean;
}) {
  const skip = input.skip === true;
  const answer = input.answer?.trim() ?? "";
  if (!skip && (!answer || answer.length > 20_000)) {
    throw new Error("回答不能为空，且不能超过 2 万字符。");
  }

  const submitted = await prisma.$transaction(async (tx) => {
    const session = await tx.mockInterviewSession.findUnique({
      where: { id: input.sessionId },
      include: {
        interview: {
          include: { questions: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!session) throw new Error("模拟面试不存在。");

    const question = session.interview.questions.find(
      (item) => item.id === input.questionId,
    );
    if (!question) throw new Error("面试题目不存在。");

    if (
      question.sortOrder < session.currentQuestionIndex &&
      ((skip && question.skippedAt) ||
        (!skip && question.answer?.trim() === answer))
    ) {
      return { session, question, newlySubmitted: false };
    }
    if (session.status !== "in_progress") {
      throw new Error("当前面试不能继续提交回答。");
    }
    if (question.sortOrder !== session.currentQuestionIndex) {
      throw new Error("请按顺序回答当前题目。");
    }

    const claimed = await tx.mockInterviewSession.updateMany({
      where: {
        id: session.id,
        status: "in_progress",
        currentQuestionIndex: question.sortOrder,
      },
      data: {
        currentQuestionIndex: { increment: 1 },
        status:
          question.sortOrder + 1 >= session.questionCount
            ? "ready_to_evaluate"
            : "in_progress",
        startedAt: session.startedAt ?? new Date(),
      },
    });
    if (claimed.count !== 1) throw new Error("回答状态已变化，请刷新后重试。");

    await tx.interviewQuestion.update({
      where: { id: question.id },
      data: {
        answer: skip ? null : answer,
        skippedAt: skip ? new Date() : null,
      },
    });
    return {
      session: await tx.mockInterviewSession.findUniqueOrThrow({ where: { id: session.id } }),
      question,
      newlySubmitted: true,
    };
  });
  if (!submitted.newlySubmitted || skip) {
    return submitted.session;
  }

  scheduleMockInterviewQuestionEvaluation(submitted.question.id);
  if (submitted.question.parentQuestionId || !submitted.session.followUpsEnabled) {
    return submitted.session;
  }

  const mainQuestionCount = await prisma.interviewQuestion.count({
    where: { interviewId: submitted.session.interviewId, parentQuestionId: null },
  });
  const [followUpCount, existingFollowUp, evaluation] = await Promise.all([
    prisma.interviewQuestion.count({
      where: {
        interviewId: submitted.session.interviewId,
        parentQuestionId: { not: null },
      },
    }),
    prisma.interviewQuestion.findFirst({
      where: { parentQuestionId: submitted.question.id },
      select: { id: true },
    }),
    prisma.interviewQuestionEvaluation.findUnique({
      where: { interviewQuestionId: submitted.question.id },
    }),
  ]);
  if (
    !canRequestFollowUp({
      mainQuestionCount,
      existingFollowUpCount: followUpCount,
      hasFollowUpForQuestion: Boolean(existingFollowUp),
    }) ||
    !evaluation
  ) {
    return submitted.session;
  }

  const snapshot = parseGenerationSnapshot(submitted.session.contextSnapshotJson);
  const metadata = parseGenerationSnapshot(evaluation.generationMetadataJson);
  const blueprint = mockInterviewJobBlueprintSchema.safeParse(snapshot.jobBlueprint);
  const competencyId =
    typeof metadata.jobCompetencyId === "string"
      ? metadata.jobCompetencyId
      : null;
  const competency =
    blueprint.success && competencyId
      ? blueprint.data.competencies.find((item) => item.id === competencyId) ?? null
      : null;
  const expectedSignals = parseJsonArray(evaluation.expectedSignalsJson).filter(
    (item): item is string => typeof item === "string",
  );
  const followUp = await generateMockInterviewFollowUp({
    question: submitted.question.question,
    answer,
    competency: competency
      ? { name: competency.name, jdEvidence: competency.jdEvidence }
      : null,
    expectedSignals,
  });
  if (!followUp?.question) return submitted.session;

  return prisma.$transaction(async (tx) => {
    const current = await tx.mockInterviewSession.findUnique({
      where: { id: submitted.session.id },
      select: { status: true, currentQuestionIndex: true },
    });
    if (
      !current ||
      !["in_progress", "ready_to_evaluate"].includes(current.status) ||
      current.currentQuestionIndex !== submitted.question.sortOrder + 1
    ) {
      return submitted.session;
    }
    const duplicate = await tx.interviewQuestion.findFirst({
      where: { parentQuestionId: submitted.question.id },
      select: { id: true },
    });
    if (duplicate) return submitted.session;
    const claimed = await tx.mockInterviewSession.updateMany({
      where: {
        id: submitted.session.id,
        status: current.status,
        currentQuestionIndex: current.currentQuestionIndex,
      },
      data: { updatedAt: new Date() },
    });
    if (claimed.count !== 1) return submitted.session;
    await tx.interviewQuestion.updateMany({
      where: {
        interviewId: submitted.session.interviewId,
        sortOrder: { gt: submitted.question.sortOrder },
      },
      data: { sortOrder: { increment: 1 } },
    });
    await tx.interviewQuestion.create({
      data: {
        interviewId: submitted.session.interviewId,
        parentQuestionId: submitted.question.id,
        question: followUp.question!,
        category: submitted.question.category,
        resumeProjectId: submitted.question.resumeProjectId,
        sortOrder: submitted.question.sortOrder + 1,
        evaluation: {
          create: {
            difficulty: evaluation.difficulty,
            sourceKind: evaluation.sourceKind,
            rubricJson: evaluation.rubricJson,
            expectedSignalsJson: JSON.stringify(
              followUp.expectedSignals.length > 0
                ? followUp.expectedSignals
                : expectedSignals,
            ),
            generationMetadataJson: JSON.stringify({
              followUpOf: submitted.question.id,
              jobCompetencyId: competencyId,
            }),
          },
        },
      },
    });
    return tx.mockInterviewSession.update({
      where: { id: submitted.session.id },
      data: {
        questionCount: { increment: 1 },
        status: "in_progress",
      },
    });
  });
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function completeMockInterview(sessionId: string): Promise<MockInterviewReport> {
  const existing = await prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    include: {
      interview: {
        include: {
          questions: {
            include: { evaluation: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
  if (!existing) throw new Error("模拟面试不存在。");
  if (existing.status === "completed" && existing.reportJson) {
    return JSON.parse(existing.reportJson) as MockInterviewReport;
  }
  if (existing.status !== "ready_to_evaluate") {
    throw new Error("请先完成全部题目。");
  }
  if (
    existing.interview.questions.some(
      (question) => !question.answer?.trim() && !question.skippedAt,
    )
  ) {
    throw new Error("仍有题目尚未回答。");
  }

  const claimed = await prisma.mockInterviewSession.updateMany({
    where: { id: sessionId, status: "ready_to_evaluate" },
    data: { status: "evaluating" },
  });
  if (claimed.count !== 1) {
    const current = await prisma.mockInterviewSession.findUnique({ where: { id: sessionId } });
    if (current?.status === "completed" && current.reportJson) {
      return JSON.parse(current.reportJson) as MockInterviewReport;
    }
    throw new Error("面试正在评分，请稍后刷新。");
  }

  try {
    const answeredQuestions = existing.interview.questions.filter(
      (question) => !question.skippedAt && question.answer?.trim(),
    );
    await waitForRunningQuestionEvaluations(
      answeredQuestions.map((question) => question.id),
    );
    const pendingEvaluations = answeredQuestions.length > 0
      ? await prisma.interviewQuestionEvaluation.findMany({
          where: {
            interviewQuestionId: { in: answeredQuestions.map((item) => item.id) },
          },
          select: { interviewQuestionId: true, evaluationStatus: true },
        })
      : [];
    const statusByQuestionId = new Map(
      pendingEvaluations.map((item) => [item.interviewQuestionId, item.evaluationStatus]),
    );
    for (const question of answeredQuestions) {
      const evaluationStatus = statusByQuestionId.get(question.id);
      if (evaluationStatus === "pending" || evaluationStatus === "failed") {
        await evaluatePersistedMockInterviewQuestion(question.id);
      }
    }
    const refreshedEvaluations = answeredQuestions.length > 0
      ? await prisma.interviewQuestionEvaluation.findMany({
          where: {
            interviewQuestionId: { in: answeredQuestions.map((item) => item.id) },
          },
          select: {
            interviewQuestionId: true,
            evaluationStatus: true,
            score: true,
            feedback: true,
          },
        })
      : [];
    const evaluationByQuestionId = new Map(
      refreshedEvaluations.map((item) => [item.interviewQuestionId, item]),
    );
    const incompleteEvaluation = refreshedEvaluations.find(
      (item) =>
        item.evaluationStatus !== "completed" ||
        item.score === null ||
        !item.feedback,
    );
    if (
      incompleteEvaluation ||
      refreshedEvaluations.length !== answeredQuestions.length
    ) {
      throw new Error("仍有题目正在评分，请稍后再次生成报告。");
    }
    const scores = existing.interview.questions.map((question) => ({
      question,
      score: evaluationByQuestionId.get(question.id)?.score ?? 0,
    }));
    const totalScore = computeInterviewTotalScore(
      scores.map((item) => item.score),
    );
    const summary = answeredQuestions.length > 0
      ? await summarizeMockInterview({
          jobTitle: existing.interview.jobTitle,
          questions: answeredQuestions.map((question) => {
            const evaluation = evaluationByQuestionId.get(question.id);
            return {
              question: question.question,
              score: evaluation?.score ?? 0,
              feedback: evaluation?.feedback ?? "暂无逐题反馈。",
            };
          }),
        })
      : {
          summary: "本场所有题目均已跳过，暂时没有可评分的回答。",
          strengths: [],
          improvements: ["从一道最熟悉的题目开始练习，先说出思路再逐步补充细节。"],
          actionPlan: ["重新发起一场模拟面试，并尝试完整回答至少一道题。"],
        };
    const report: MockInterviewReport = {
      totalScore,
      summary: summary.summary,
      strengths: summary.strengths,
      improvements: summary.improvements,
      actionPlan: summary.actionPlan,
    };
    const completedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.mockInterviewSession.update({
        where: { id: sessionId },
        data: {
          status: "completed",
          totalScore,
          reportJson: JSON.stringify(report),
          completedAt,
        },
      });
      await tx.interview.update({
        where: { id: existing.interviewId },
        data: { status: "completed", interviewedAt: completedAt },
      });
    });
    await enqueueCandidateProfileRefresh();
    return report;
  } catch (error) {
    await prisma.mockInterviewSession.updateMany({
      where: { id: sessionId, status: "evaluating" },
      data: { status: "ready_to_evaluate" },
    });
    throw error;
  }
}
