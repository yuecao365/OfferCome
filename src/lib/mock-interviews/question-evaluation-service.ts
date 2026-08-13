import "server-only";

import { prisma } from "@/lib/db";

import { evaluateMockInterviewQuestion } from "./question-evaluation-agent";
import { computeQuestionScore } from "./scoring";

const RUNNING_EVALUATION_WAIT_MS = 32_000;
const RUNNING_EVALUATION_POLL_MS = 250;

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export async function evaluatePersistedMockInterviewQuestion(
  interviewQuestionId: string,
): Promise<boolean> {
  const claimed = await prisma.interviewQuestionEvaluation.updateMany({
    where: {
      interviewQuestionId,
      evaluationStatus: { in: ["pending", "failed"] },
    },
    data: {
      evaluationStatus: "running",
      evaluationError: null,
    },
  });
  if (claimed.count !== 1) return false;

  try {
    const evaluation = await prisma.interviewQuestionEvaluation.findUnique({
      where: { interviewQuestionId },
      include: {
        interviewQuestion: {
          include: {
            interview: {
              include: { mockSession: true },
            },
          },
        },
      },
    });
    const question = evaluation?.interviewQuestion;
    const session = question?.interview.mockSession;
    const answer = question?.answer?.trim();
    if (!evaluation || !question || !session || !answer || question.skippedAt) {
      throw new Error("题目没有可评分的回答。");
    }
    const rubric = parseJson(evaluation.rubricJson);
    const output = await evaluateMockInterviewQuestion({
      question: question.question,
      answer,
      rubric,
      expectedSignals: parseJson(evaluation.expectedSignalsJson),
      jobTitle: question.interview.jobTitle,
      jobDescription: session.jdTextSnapshot,
    });
    const score = computeQuestionScore(
      Array.isArray(rubric) ? rubric : [],
      output.dimensions,
    );
    const completedAt = new Date();
    await prisma.interviewQuestionEvaluation.update({
      where: { id: evaluation.id },
      data: {
        evaluationStatus: "completed",
        evaluationError: null,
        score,
        dimensionsJson: JSON.stringify(output.dimensions),
        strengthsJson: JSON.stringify(output.strengths),
        improvementsJson: JSON.stringify(output.improvements),
        feedback: output.feedback,
        evaluatedAt: completedAt,
      },
    });
    return true;
  } catch (error) {
    await prisma.interviewQuestionEvaluation.updateMany({
      where: { interviewQuestionId, evaluationStatus: "running" },
      data: {
        evaluationStatus: "failed",
        evaluationError:
          error instanceof Error ? error.message.slice(0, 1_000) : "逐题评分失败。",
      },
    });
    throw error;
  }
}

export async function waitForRunningQuestionEvaluations(
  interviewQuestionIds: string[],
): Promise<void> {
  if (interviewQuestionIds.length === 0) return;
  const deadline = Date.now() + RUNNING_EVALUATION_WAIT_MS;
  while (Date.now() < deadline) {
    const runningCount = await prisma.interviewQuestionEvaluation.count({
      where: {
        interviewQuestionId: { in: interviewQuestionIds },
        evaluationStatus: "running",
      },
    });
    if (runningCount === 0) return;
    await new Promise((resolve) => setTimeout(resolve, RUNNING_EVALUATION_POLL_MS));
  }
  await prisma.interviewQuestionEvaluation.updateMany({
    where: {
      interviewQuestionId: { in: interviewQuestionIds },
      evaluationStatus: "running",
    },
    data: {
      evaluationStatus: "failed",
      evaluationError: "后台评分超时，交卷时自动补评。",
    },
  });
}
