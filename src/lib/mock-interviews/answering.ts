import "server-only";

import { prisma } from "@/lib/db";
import { parseJsonArray } from "@/lib/json";

import { generateMockInterviewFollowUp } from "./follow-up-agent";
import { canRequestFollowUp } from "./follow-up-policy";
import { scheduleMockInterviewQuestionEvaluation } from "./question-evaluation-background";
import { claimSession, parseGenerationSnapshot } from "./session-state";
import { mockInterviewJobBlueprintSchema } from "./types";

const MAX_ANSWER_LENGTH = 20_000;

type SubmittedAnswer = Awaited<ReturnType<typeof recordAnswer>>;

/**
 * 把一次作答写进会话并推进题目指针。
 *
 * 整段放在事务里，且推进指针时带上"我以为的当前题号"作为条件——用户双击提交
 * 或页面重发时不能把进度多推一格。
 */
async function recordAnswer(input: {
  sessionId: string;
  questionId: string;
  answer: string;
  skip: boolean;
}) {
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

    // 已经答过的题重复收到同样的内容：当成网络重发，直接返回现状。
    if (
      question.sortOrder < session.currentQuestionIndex &&
      ((input.skip && question.skippedAt) ||
        (!input.skip && question.answer?.trim() === input.answer))
    ) {
      return { session, question, newlySubmitted: false };
    }
    if (session.status !== "in_progress") {
      throw new Error("当前面试不能继续提交回答。");
    }
    if (question.sortOrder !== session.currentQuestionIndex) {
      throw new Error("请按顺序回答当前题目。");
    }

    const claimed = await claimSession(tx, {
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
    if (!claimed) throw new Error("回答状态已变化，请刷新后重试。");

    await tx.interviewQuestion.update({
      where: { id: question.id },
      data: {
        answer: input.skip ? null : input.answer,
        skippedAt: input.skip ? new Date() : null,
      },
    });

    return {
      session: await tx.mockInterviewSession.findUniqueOrThrow({
        where: { id: session.id },
      }),
      question,
      newlySubmitted: true,
    };
  });
}

/** 追问预算由 follow-up-policy 持有；这里只负责判断本题是否还有名额。 */
async function canFollowUp(submitted: SubmittedAnswer): Promise<boolean> {
  const mainQuestionCount = await prisma.interviewQuestion.count({
    where: {
      interviewId: submitted.session.interviewId,
      parentQuestionId: null,
    },
  });
  const [followUpCount, existingFollowUp] = await Promise.all([
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
  ]);

  return canRequestFollowUp({
    mainQuestionCount,
    existingFollowUpCount: followUpCount,
    hasFollowUpForQuestion: Boolean(existingFollowUp),
  });
}

/**
 * 把追问插到刚回答的那道题后面，其余题目整体后移。
 *
 * 插入前重新确认会话状态：用户可能已经答到下一题或交了卷，这时候插题会打乱
 * 房间进度，直接放弃。
 */
async function insertFollowUp(input: {
  submitted: SubmittedAnswer;
  question: string;
  expectedSignals: string[];
  fallbackSignals: string[];
  evaluation: { difficulty: string; sourceKind: string; rubricJson: string };
  competencyId: string | null;
}) {
  const { submitted } = input;

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

    const claimed = await claimSession(tx, {
      where: {
        id: submitted.session.id,
        status: current.status,
        currentQuestionIndex: current.currentQuestionIndex,
      },
      data: { updatedAt: new Date() },
    });
    if (!claimed) return submitted.session;

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
        question: input.question,
        category: submitted.question.category,
        resumeProjectId: submitted.question.resumeProjectId,
        sortOrder: submitted.question.sortOrder + 1,
        evaluation: {
          create: {
            difficulty: input.evaluation.difficulty,
            sourceKind: input.evaluation.sourceKind,
            rubricJson: input.evaluation.rubricJson,
            expectedSignalsJson: JSON.stringify(
              input.expectedSignals.length > 0
                ? input.expectedSignals
                : input.fallbackSignals,
            ),
            generationMetadataJson: JSON.stringify({
              followUpOf: submitted.question.id,
              jobCompetencyId: input.competencyId,
            }),
          },
        },
      },
    });

    return tx.mockInterviewSession.update({
      where: { id: submitted.session.id },
      data: { questionCount: { increment: 1 }, status: "in_progress" },
    });
  });
}

export async function submitMockInterviewAnswer(input: {
  sessionId: string;
  questionId: string;
  answer?: string;
  skip?: boolean;
}) {
  const skip = input.skip === true;
  const answer = input.answer?.trim() ?? "";
  if (!skip && (!answer || answer.length > MAX_ANSWER_LENGTH)) {
    throw new Error("回答不能为空，且不能超过 2 万字符。");
  }

  const submitted = await recordAnswer({
    sessionId: input.sessionId,
    questionId: input.questionId,
    answer,
    skip,
  });
  if (!submitted.newlySubmitted || skip) return submitted.session;

  scheduleMockInterviewQuestionEvaluation(submitted.question.id);
  // 追问只针对主题目，且用户可以整场关掉。
  if (submitted.question.parentQuestionId || !submitted.session.followUpsEnabled) {
    return submitted.session;
  }

  const [allowed, evaluation] = await Promise.all([
    canFollowUp(submitted),
    prisma.interviewQuestionEvaluation.findUnique({
      where: { interviewQuestionId: submitted.question.id },
    }),
  ]);
  if (!allowed || !evaluation) return submitted.session;

  const snapshot = parseGenerationSnapshot(submitted.session.contextSnapshotJson);
  const metadata = parseGenerationSnapshot(evaluation.generationMetadataJson);
  const blueprint = mockInterviewJobBlueprintSchema.safeParse(snapshot.jobBlueprint);
  const competencyId =
    typeof metadata.jobCompetencyId === "string" ? metadata.jobCompetencyId : null;
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

  return insertFollowUp({
    submitted,
    question: followUp.question,
    expectedSignals: followUp.expectedSignals,
    fallbackSignals: expectedSignals,
    evaluation,
    competencyId,
  });
}
