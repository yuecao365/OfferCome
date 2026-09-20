import "server-only";

import { enqueueCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { prisma } from "@/lib/db";
import { ensureSegments } from "@/lib/interview/aftermath";
import { ledgerOf, parseEventRow, type InterviewEvent } from "@/lib/interview/events";
import { renderLedger } from "@/lib/interview/state";
import { parseJsonArray, parseJsonObject } from "@/lib/json";

import { parseStoredBrief } from "./brief/brief";
import { ALL_SKIPPED_SUMMARY, areaOutcomes, buildReport, summaryInput } from "./outcome";
import {
  evaluatePersistedMockInterviewQuestion,
  waitForRunningQuestionEvaluations,
} from "./question-evaluation-service";
import type { EvaluationWeakness } from "./question-evaluation";
import { parseStoredReport, type MockInterviewReport } from "./report";
import { claimSession } from "./session-state";
import { summarizeMockInterview } from "./summary-agent";
import { writeCandidateDossier } from "@/lib/interview/dossier";

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
      events: { where: { type: "ledger_written" }, orderBy: { seq: "asc" } },
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
      await evaluatePersistedMockInterviewQuestion(question.id, { withTools: status === "pending" });
  }
  const refreshed = await prisma.interviewQuestionEvaluation.findMany({
    where: { interviewQuestionId: { in: questionIds } },
    select: {
      interviewQuestionId: true,
      evaluationStatus: true,
      score: true,
    },
  });
  // 还在跑的等下一次；补跑后仍失败的段不再卡整份报告（§12.3）：报告里该段标"评分失败"，总分不计它。
  const running = refreshed.length !== answered.length || refreshed.some((item) => item.evaluationStatus === "running" || item.evaluationStatus === "pending");
  if (running) throw new Error("仍有题目正在评分，请稍后再次生成报告。");
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
    // 先切段（幂等）：逐字稿 → 话题段 → 兼容题目；再等逐题评分收齐。
    await ensureSegments(sessionId);
    const segmented = (await loadSession(sessionId))!;
    const answered = segmented.interview.questions.filter(
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
              ledger: renderLedger(brief, ledgerOf(session.events.map(parseEventRow).filter((item): item is InterviewEvent => item !== null))),
            }),
          )
        : ALL_SKIPPED_SUMMARY;
    const report = buildReport(areas, summary);
    const completedAt = new Date();
    // 简历假设的验证结论由汇总给（§11.2）：写回会话，跨场记忆读它。
    const judged = new Map(report.hypotheses.map((item) => [item.text, item]));
    const hypotheses = brief.hypotheses.map((item) => ({ id: item.id, status: judged.get(item.text)?.status ?? "open", note: judged.get(item.text)?.verdict ?? null }));

    await prisma.$transaction(async (tx) => {
      await tx.mockInterviewSession.update({
        where: { id: sessionId },
        data: {
          status: "completed",
          totalScore: report.totalScore,
          reportJson: JSON.stringify(report),
          hypothesesJson: JSON.stringify(hypotheses),
          completedAt,
        },
      });
      await tx.interview.update({
        where: { id: existing.interviewId },
        data: { status: "completed", interviewedAt: completedAt },
      });
    });
    // 候选人档案（G4）：交卷后写一版；失败只记日志，报告照出。
    if (session.resumeId) {
      const facetsOf = new Map(session.interview.questions.map((question) => [question.id, parseJsonObject(question.evaluation?.generationMetadataJson ?? null)] as const));
      const weaknessesOf = new Map(session.interview.questions.map((question) => [question.id, question.evaluation ? (parseJsonArray(question.evaluation.weaknessesJson) as EvaluationWeakness[]) : []] as const));
      const scoreOf = new Map(session.interview.questions.map((question) => [question.id, question.evaluation?.score ?? null] as const));
      const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
      await writeCandidateDossier({
        resumeId: session.resumeId,
        sessionId,
        evalTag: existing.interview.evalTag,
        facts: {
          jobTitle: session.interview.jobTitle,
          companyName: session.interview.companyName,
          date: completedAt.toISOString().slice(0, 10),
          report: { summary: report.summary, strengths: report.strengths, weaknesses: report.weaknesses, hypotheses: report.hypotheses },
          areas: session.threads
            .filter((thread) => thread.status !== "active")
            .map((thread) => ({
              name: thread.label,
              kind: thread.kind,
              score: thread.questionId ? (scoreOf.get(thread.questionId) ?? null) : null,
              facetsAsked: thread.questionId ? strings(facetsOf.get(thread.questionId)?.facets) : [],
              weaknesses: thread.questionId ? (weaknessesOf.get(thread.questionId) ?? []) : [],
            })),
        },
      }).catch((error: unknown) => console.warn("[dossier] 写档案失败，报告照常。", error));
    }
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
