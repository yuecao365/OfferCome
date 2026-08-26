import "server-only";

import { enqueueCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { prisma } from "@/lib/db";

import {
  evaluatePersistedMockInterviewQuestion,
  waitForRunningQuestionEvaluations,
} from "./question-evaluation-service";
import { computeInterviewTotalScore } from "./scoring";
import { claimSession } from "./session-state";
import { summarizeMockInterview } from "./summary-agent";
import type { MockInterviewReport } from "./types";

type CompletableSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>;
type AnsweredQuestion = CompletableSession["interview"]["questions"][number];

function loadSession(sessionId: string) {
  return prisma.mockInterviewSession.findUnique({
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
}

function storedReport(session: {
  status: string;
  reportJson: string | null;
}): MockInterviewReport | null {
  return session.status === "completed" && session.reportJson
    ? (JSON.parse(session.reportJson) as MockInterviewReport)
    : null;
}

/**
 * 逐题评分大多已由后台跑完，这里只负责等待在途的、补跑失败的，
 * 然后确认每道已作答的题都拿到了完整结果。
 */
async function collectEvaluations(answered: AnsweredQuestion[]) {
  await waitForRunningQuestionEvaluations(answered.map((question) => question.id));
  if (answered.length === 0) return new Map<string, { score: number | null; feedback: string | null }>();

  const questionIds = answered.map((item) => item.id);
  const pending = await prisma.interviewQuestionEvaluation.findMany({
    where: { interviewQuestionId: { in: questionIds } },
    select: { interviewQuestionId: true, evaluationStatus: true },
  });
  const statusByQuestionId = new Map(
    pending.map((item) => [item.interviewQuestionId, item.evaluationStatus]),
  );
  for (const question of answered) {
    const status = statusByQuestionId.get(question.id);
    if (status === "pending" || status === "failed") {
      await evaluatePersistedMockInterviewQuestion(question.id);
    }
  }

  const refreshed = await prisma.interviewQuestionEvaluation.findMany({
    where: { interviewQuestionId: { in: questionIds } },
    select: {
      interviewQuestionId: true,
      evaluationStatus: true,
      score: true,
      feedback: true,
    },
  });
  const incomplete = refreshed.find(
    (item) =>
      item.evaluationStatus !== "completed" ||
      item.score === null ||
      !item.feedback,
  );
  if (incomplete || refreshed.length !== answered.length) {
    throw new Error("仍有题目正在评分，请稍后再次生成报告。");
  }

  return new Map(refreshed.map((item) => [item.interviewQuestionId, item]));
}

/** 全场跳过时不调用汇总模型，直接给一段固定的引导文案。 */
const ALL_SKIPPED_SUMMARY = {
  summary: "本场所有题目均已跳过，暂时没有可评分的回答。",
  strengths: [] as string[],
  improvements: ["从一道最熟悉的题目开始练习，先说出思路再逐步补充细节。"],
  actionPlan: ["重新发起一场模拟面试，并尝试完整回答至少一道题。"],
};

export async function completeMockInterview(
  sessionId: string,
): Promise<MockInterviewReport> {
  const existing = await loadSession(sessionId);
  if (!existing) throw new Error("模拟面试不存在。");

  const alreadyDone = storedReport(existing);
  if (alreadyDone) return alreadyDone;

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

  const claimed = await claimSession(prisma, {
    where: { id: sessionId, status: "ready_to_evaluate" },
    data: { status: "evaluating" },
  });
  if (!claimed) {
    // 另一个请求抢先在评分：它完成的话报告已经在库里了。
    const current = await prisma.mockInterviewSession.findUnique({
      where: { id: sessionId },
    });
    const report = current ? storedReport(current) : null;
    if (report) return report;
    throw new Error("面试正在评分，请稍后刷新。");
  }

  try {
    const answered = existing.interview.questions.filter(
      (question) => !question.skippedAt && question.answer?.trim(),
    );
    const evaluationByQuestionId = await collectEvaluations(answered);
    const totalScore = computeInterviewTotalScore(
      existing.interview.questions.map(
        (question) => evaluationByQuestionId.get(question.id)?.score ?? 0,
      ),
    );

    const summary =
      answered.length > 0
        ? await summarizeMockInterview({
            jobTitle: existing.interview.jobTitle,
            questions: answered.map((question) => {
              const evaluation = evaluationByQuestionId.get(question.id);
              return {
                question: question.question,
                score: evaluation?.score ?? 0,
                feedback: evaluation?.feedback ?? "暂无逐题反馈。",
              };
            }),
          })
        : ALL_SKIPPED_SUMMARY;

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
    // 评分没跑完就退回可交卷状态，否则会话永远卡在 evaluating。
    await claimSession(prisma, {
      where: { id: sessionId, status: "evaluating" },
      data: { status: "ready_to_evaluate" },
    });
    throw error;
  }
}
