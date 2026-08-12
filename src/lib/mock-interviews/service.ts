import "server-only";

import { randomUUID } from "node:crypto";

import { enqueueCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { prisma } from "@/lib/db";
import {
  ACTIVE_MOCK_INTERVIEW_STATUS,
  normalizeInterviewRound,
} from "@/lib/interviews/types";

import { evaluateMockInterview } from "./agent";
import { analyzeMockInterviewJob } from "./job-analysis-agent";
import { generateMockInterviewPlan } from "./question-generation-agent";
import { computeInterviewTotalScore, computeQuestionScore } from "./scoring";
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
import { assertMockInterviewAiConfigured } from "./agent-runtime";
import { isMockInterviewGenerationError } from "./errors";
import { generateMockInterviewFollowUp } from "./follow-up-agent";
import { canRequestFollowUp } from "./follow-up-policy";

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
};

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
  generationRequest?: { difficulty?: unknown; round?: unknown };
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
  const [context, config] = await Promise.all([
    buildMockInterviewContext({
      resumeId: input.resumeId,
      jobTitle: validated.jobTitle,
      jobDescription: validated.jobDescription,
    }),
    getAiTaskConfig("text"),
  ]);
  assertMockInterviewAiConfigured(config);
  const now = new Date();
  const snapshot = parseGenerationSnapshot(serializeMockInterviewContext(context));
  snapshot.generationRequest = {
    difficulty: input.difficulty,
    round: input.round,
  };

  return prisma.interview.create({
    data: {
      kind: "mock",
      companyName: validated.companyName,
      jobTitle: validated.jobTitle,
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

  try {
    const context = await buildMockInterviewContext({
      resumeId: session.resumeId,
      jobTitle: session.interview.jobTitle,
      jobDescription: session.jdTextSnapshot,
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
          contextSnapshotJson: serializeMockInterviewContext(context, {
            blueprint: generated.blueprint,
            personalization: generated.personalization,
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
      error instanceof Error ? error.message.slice(0, 1_000) : "生成面试题失败。";
    await prisma.mockInterviewSession.updateMany({
      where: { id: sessionId, status: "generating" },
      data: {
        status: "generation_failed",
        generationPhase: null,
        generationErrorCode: code,
        generationError: message,
      },
    });
  }
}

export async function claimMockInterviewGenerationRetry(
  sessionId: string,
): Promise<boolean> {
  const result = await prisma.mockInterviewSession.updateMany({
    where: { id: sessionId, status: "generation_failed" },
    data: {
      status: "generating",
      generationPhase: "job_blueprint",
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
  if (
    !submitted.newlySubmitted ||
    skip ||
    submitted.question.parentQuestionId ||
    !submitted.session.followUpsEnabled
  ) {
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
    const output =
      answeredQuestions.length > 0
        ? await evaluateMockInterview({
            companyName: existing.interview.companyName,
            jobTitle: existing.interview.jobTitle,
            jobDescription: existing.jdTextSnapshot,
            resumeText: existing.resumeTextSnapshot,
            questions: answeredQuestions.map((question) => ({
              id: question.id,
              question: question.question,
              answer: question.answer ?? "",
              rubric: parseJsonArray(question.evaluation?.rubricJson ?? "[]"),
              expectedSignals: parseJsonArray(
                question.evaluation?.expectedSignalsJson ?? "[]",
              ),
            })),
          })
        : {
            questionEvaluations: [],
            summary: "本场所有题目均已跳过，暂时没有可评分的回答。",
            strengths: [],
            improvements: ["从一道最熟悉的题目开始练习，先说出思路再逐步补充细节。"],
            actionPlan: ["重新发起一场模拟面试，并尝试完整回答至少一道题。"],
          };
    const evaluationsByQuestionId = new Map(
      output.questionEvaluations.map((item) => [item.questionId, item]),
    );
    const scores = existing.interview.questions.map((question) => {
      const evaluation = evaluationsByQuestionId.get(question.id);
      return {
        question,
        evaluation,
        score: evaluation
          ? computeQuestionScore(
              parseJsonArray(question.evaluation?.rubricJson ?? "[]"),
              evaluation.dimensions,
            )
          : 0,
      };
    });
    const totalScore = computeInterviewTotalScore(
      scores.map((item) => item.score),
    );
    const report: MockInterviewReport = {
      totalScore,
      summary: output.summary,
      strengths: output.strengths,
      improvements: output.improvements,
      actionPlan: output.actionPlan,
    };
    const completedAt = new Date();

    await prisma.$transaction(async (tx) => {
      for (const item of scores) {
        if (!item.question.evaluation || !item.evaluation) continue;
        await tx.interviewQuestionEvaluation.update({
          where: { id: item.question.evaluation.id },
          data: {
            score: item.score,
            dimensionsJson: JSON.stringify(item.evaluation.dimensions),
            strengthsJson: JSON.stringify(item.evaluation.strengths),
            improvementsJson: JSON.stringify(item.evaluation.improvements),
            feedback: item.evaluation.feedback,
            evaluatedAt: completedAt,
          },
        });
      }
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
