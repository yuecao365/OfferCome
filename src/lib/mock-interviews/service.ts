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
import { computeQuestionScore } from "./scoring";
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
} from "./types";

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

export async function createMockInterview(input: CreateMockInterviewInput) {
  const validated = validateCreateInput(input);
  const generationId = randomUUID();
  const [context, jobBlueprint] = await Promise.all([
    buildMockInterviewContext({
      resumeId: input.resumeId,
      jobTitle: validated.jobTitle,
      jobDescription: validated.jobDescription,
    }),
    analyzeMockInterviewJob({
      generationId,
      jobTitle: validated.jobTitle,
      jobDescription: validated.jobDescription,
    }),
  ]);
  const generated = await generateMockInterviewPlan({
    generationId,
    context,
    blueprint: jobBlueprint,
    jobTitle: validated.jobTitle,
    questionCount: validated.questionCount,
    difficulty: input.difficulty,
    round: input.round,
  });
  const projectIds = new Set(context.projects.map((project) => project.id));
  const now = new Date();

  return prisma.interview.create({
    data: {
      kind: "mock",
      companyName: validated.companyName,
      jobTitle: validated.jobTitle,
      scheduledAt: now,
      round: normalizeInterviewRound(input.round),
      status: ACTIVE_MOCK_INTERVIEW_STATUS,
      note: "AI 模拟面试",
      mockSession: {
        create: {
          resumeId: input.resumeId,
          jdOriginalName: input.jdOriginalName,
          jdTextSnapshot: validated.jobDescription,
          resumeTextSnapshot: context.resume.text,
          contextSnapshotJson: serializeMockInterviewContext(context, {
            blueprint: generated.blueprint,
            personalization: generated.personalization,
          }),
          status: "in_progress",
          interactionMode: validated.interactionMode,
          questionCount: validated.questionCount,
          provider: generated.provider,
          model: generated.model,
          promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
        },
      },
      questions: {
        create: generated.plan.questions.map((question, index) => ({
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
        })),
      },
    },
    select: { id: true, mockSession: { select: { id: true } } },
  });
}

export async function submitMockInterviewAnswer(input: {
  sessionId: string;
  questionId: string;
  answer: string;
}) {
  const answer = input.answer.trim();
  if (!answer || answer.length > 20_000) {
    throw new Error("回答不能为空，且不能超过 2 万字符。");
  }

  return prisma.$transaction(async (tx) => {
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
      question.answer?.trim() === answer
    ) {
      return session;
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
      data: { answer },
    });
    return tx.mockInterviewSession.findUniqueOrThrow({ where: { id: session.id } });
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
  if (existing.interview.questions.some((question) => !question.answer?.trim())) {
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
    const output = await evaluateMockInterview({
      companyName: existing.interview.companyName,
      jobTitle: existing.interview.jobTitle,
      jobDescription: existing.jdTextSnapshot,
      resumeText: existing.resumeTextSnapshot,
      questions: existing.interview.questions.map((question) => ({
        id: question.id,
        question: question.question,
        answer: question.answer ?? "",
        rubric: parseJsonArray(question.evaluation?.rubricJson ?? "[]"),
        expectedSignals: parseJsonArray(
          question.evaluation?.expectedSignalsJson ?? "[]",
        ),
      })),
    });
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
    const totalScore = Math.round(
      scores.reduce((total, item) => total + item.score, 0) /
        Math.max(scores.length, 1),
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
