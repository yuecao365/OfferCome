import "server-only";

import { enqueueCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { prisma } from "@/lib/db";
import { parseJsonArray } from "@/lib/json";

import { parseStoredBrief } from "./interviewer/brief";
import { parseStoredMemory } from "./interviewer/memory";
import { ALL_SKIPPED_SUMMARY, areaOutcomes, buildReport, summaryInput } from "./outcome";
import {
  evaluatePersistedMockInterviewQuestion,
  waitForRunningQuestionEvaluations,
} from "./question-evaluation-service";
import type { EvaluationWeakness } from "./question-evaluation";
import { parseStoredReport, type MockInterviewReport } from "./report";
import { claimSession } from "./session-state";
import { summarizeMockInterview } from "./summary-agent";

/**
 * 交卷的本地版存取：等逐题评分收齐 → 拼全貌（outcome.ts）→ 汇总 agent → 落报告。
 * 面试结束后由后台自动触发；失败时会话退回 ready_to_evaluate，房间给重试入口。
 */

type CompletableSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>;
type QuestionRow = CompletableSession["interview"]["questions"][number];

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
      threads: { orderBy: { createdAt: "asc" } },
    },
  });
}

/**
 * 逐题评分大多已由后台跑完，这里只负责等待在途的、补跑失败的，
 * 然后确认每道已作答的题都拿到了完整结果。
 */
async function collectEvaluations(answered: QuestionRow[]): Promise<void> {
  const questionIds = answered.map((question) => question.id);
  await waitForRunningQuestionEvaluations(questionIds);
  if (answered.length === 0) return;

  const statuses = await prisma.interviewQuestionEvaluation.findMany({
    where: { interviewQuestionId: { in: questionIds } },
    select: { interviewQuestionId: true, evaluationStatus: true },
  });
  const statusById = new Map(
    statuses.map((item) => [item.interviewQuestionId, item.evaluationStatus]),
  );
  for (const question of answered) {
    const status = statusById.get(question.id);
    if (status === "pending" || status === "failed")
      await evaluatePersistedMockInterviewQuestion(question.id);
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
  const incomplete =
    refreshed.length !== answered.length ||
    refreshed.some(
      (item) =>
        item.evaluationStatus !== "completed" ||
        item.score === null ||
        !item.feedback,
    );
  if (incomplete) throw new Error("仍有题目正在评分，请稍后再次生成报告。");
}

export async function completeMockInterview(
  sessionId: string,
): Promise<MockInterviewReport> {
  const existing = await loadSession(sessionId);
  if (!existing) throw new Error("模拟面试不存在。");
  const alreadyDone =
    existing.status === "completed"
      ? parseStoredReport(existing.reportJson)
      : null;
  if (alreadyDone) return alreadyDone;
  if (existing.status !== "ready_to_evaluate")
    throw new Error("面试还没有结束。");
  const brief = parseStoredBrief(existing.briefJson);
  if (!brief) throw new Error("这场面试还没有准备好，无法生成报告。");

  const claimed = await claimSession(prisma, {
    where: { id: sessionId, status: "ready_to_evaluate" },
    data: { status: "evaluating" },
  });
  if (!claimed) {
    // 另一个请求抢先在评分：它完成的话报告已经在库里了。
    const current = await prisma.mockInterviewSession.findUnique({
      where: { id: sessionId },
    });
    const report =
      current?.status === "completed"
        ? parseStoredReport(current.reportJson)
        : null;
    if (report) return report;
    throw new Error("面试正在评分，请稍后刷新。");
  }

  try {
    const answered = existing.interview.questions.filter(
      (question) => !question.skippedAt && question.answer?.trim(),
    );
    await collectEvaluations(answered);
    // 评分结果刚落库，重新读一次再拼全貌。
    const session = (await loadSession(sessionId))!;
    const areas = areaOutcomes(
      brief,
      session.threads,
      session.interview.questions.map((question) => ({
        id: question.id,
        skipped: Boolean(question.skippedAt),
        evaluation: question.evaluation
          ? {
              score: question.evaluation.score,
              weaknesses: parseJsonArray(question.evaluation.weaknessesJson) as EvaluationWeakness[],
            }
          : null,
      })),
    );
    const summary =
      answered.length > 0
        ? await summarizeMockInterview(
            summaryInput({
              jobTitle: session.interview.jobTitle,
              brief,
              areas,
              memory: parseStoredMemory(session.memoryJson, brief),
            }),
          )
        : ALL_SKIPPED_SUMMARY;
    const report = buildReport(areas, summary);
    const completedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.mockInterviewSession.update({
        where: { id: sessionId },
        data: {
          status: "completed",
          totalScore: report.totalScore,
          reportJson: JSON.stringify(report),
          completedAt,
        },
      });
      await tx.interview.update({
        where: { id: existing.interviewId },
        data: { status: "completed", interviewedAt: completedAt },
      });
    });
    // 评测跑出的面试不进能力画像。
    if (!existing.interview.evalTag) await enqueueCandidateProfileRefresh();
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
