import assert from "node:assert/strict";
import test, { after, before, beforeEach, mock } from "node:test";

import { createTestDatabase } from "@/lib/test-support/prisma-test-db";

/**
 * 模拟面试编排的回归测试。
 *
 * 覆盖目标是"流程骨架"而不是模型输出质量：状态机走位、降级路径、乐观锁、
 * 幂等。所有 agent 都被替换成可编程的桩，数据库是真的（见 prisma-test-db）。
 */

const database = createTestDatabase();
process.env.DATABASE_URL = database.url;

// —— 可编程桩：每个用例在 beforeEach 里重置，再按需改写。
const stubs = {
  blueprint: null as unknown,
  blueprintError: null as Error | null,
  enrichError: null as Error | null,
  planErrors: [] as (Error | null)[],
  questions: [] as { question: string; category: string }[],
  followUp: null as { question: string; expectedSignals: string[] } | null,
  summaryCalls: 0,
  profileRefreshCalls: 0,
  scheduledEvaluations: [] as string[],
};

function competency(id: string) {
  return {
    id,
    name: `能力 ${id}`,
    description: "描述",
    priority: "core" as const,
    jdEvidence: "JD 原文片段",
    origin: "jd" as const,
    sourceUrl: null,
  };
}

function defaultBlueprint() {
  return {
    summary: "岗位摘要",
    completeness: "complete" as const,
    missingInformation: [],
    competencies: [competency("bp-1"), competency("bp-2"), competency("bp-3"), competency("bp-4")],
  };
}

function questionDraft(index: number) {
  return {
    question: `第 ${index + 1} 题`,
    category: "technical",
    difficulty: "standard",
    sourceKind: "job_description",
    jobCompetencyId: "bp-1",
    jdEvidence: "JD 原文片段",
    relevanceScore: 0.9,
    resumeProjectId: null,
    personalizationSourceId: null,
    rationale: "考察点",
    expectedSignals: ["信号"],
    rubric: [{ name: "准确性", weight: 1 }],
  };
}

mock.module("server-only", { namedExports: {} });

mock.module("./job-analysis-agent", {
  namedExports: {
    analyzeMockInterviewJob: async () => {
      if (stubs.blueprintError) throw stubs.blueprintError;
      return stubs.blueprint ?? defaultBlueprint();
    },
  },
});

mock.module("./jd-enrichment-agent", {
  namedExports: {
    enrichMockInterviewJob: async ({ blueprint }: { blueprint: unknown }) => {
      if (stubs.enrichError) throw stubs.enrichError;
      return blueprint ?? defaultBlueprint();
    },
  },
});

mock.module("./question-generation-agent", {
  namedExports: {
    generateMockInterviewPlan: async () => {
      const failure = stubs.planErrors.shift();
      if (failure) throw failure;
      return {
        plan: {
          questions: stubs.questions.length
            ? stubs.questions.map((item, index) => ({
                ...questionDraft(index),
                ...item,
              }))
            : [questionDraft(0), questionDraft(1), questionDraft(2)],
        },
        blueprint: stubs.blueprint ?? defaultBlueprint(),
        personalization: { history: [], profileInsights: [] },
      };
    },
  },
});

mock.module("./context", {
  namedExports: {
    buildMockInterviewContext: async () => ({
      resume: { id: "resume-1", text: "简历正文" },
      projects: [],
      history: [],
      profileInsights: [],
    }),
    serializeMockInterviewContext: () => JSON.stringify({ resume: { id: "resume-1" } }),
  },
});

mock.module("./follow-up-agent", {
  namedExports: {
    generateMockInterviewFollowUp: async () => stubs.followUp,
  },
});

mock.module("./question-evaluation-background", {
  namedExports: {
    scheduleMockInterviewQuestionEvaluation: (id: string) => {
      stubs.scheduledEvaluations.push(id);
    },
  },
});

mock.module("./question-evaluation-service", {
  namedExports: {
    evaluatePersistedMockInterviewQuestion: async () => {},
    waitForRunningQuestionEvaluations: async () => {},
  },
});

mock.module("./summary-agent", {
  namedExports: {
    summarizeMockInterview: async () => {
      stubs.summaryCalls += 1;
      return {
        summary: "整体表现总结",
        strengths: ["优势"],
        improvements: ["改进"],
        actionPlan: ["行动"],
      };
    },
  },
});

mock.module("@/lib/candidate-profile/background", {
  namedExports: {
    enqueueCandidateProfileRefresh: async () => {
      stubs.profileRefreshCalls += 1;
    },
    scheduleCandidateProfileRefresh: () => {},
  },
});

type Service = typeof import("./service");
type Prisma = (typeof import("@/lib/db"))["prisma"];

let service: Service;
let prisma: Prisma;

before(async () => {
  service = await import("./service");
  ({ prisma } = await import("@/lib/db"));
});

after(async () => {
  await prisma.$disconnect();
  database.cleanup();
});

beforeEach(async () => {
  stubs.blueprint = null;
  stubs.blueprintError = null;
  stubs.enrichError = null;
  stubs.planErrors = [];
  stubs.questions = [];
  stubs.followUp = null;
  stubs.summaryCalls = 0;
  stubs.profileRefreshCalls = 0;
  stubs.scheduledEvaluations = [];

  await prisma.interviewQuestionEvaluation.deleteMany();
  await prisma.interviewQuestion.deleteMany();
  await prisma.mockInterviewSession.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.resume.deleteMany();
});

/** 造一场停在待生成状态的模拟面试，等价于 createMockInterview 刚写完的样子。 */
async function seedGeneratingSession(
  overrides: {
    jdTextSnapshot?: string;
    questionCount?: number;
    snapshot?: Record<string, unknown>;
    status?: string;
    generationPhase?: string | null;
  } = {},
) {
  await prisma.resume.upsert({
    where: { id: "resume-1" },
    update: {},
    create: {
      id: "resume-1",
      originalName: "简历.pdf",
      storedName: "resume-1.pdf",
      filePath: "/tmp/resume-1.pdf",
      mimeType: "application/pdf",
      fileSize: 1024,
      isDefault: true,
    },
  });

  const interview = await prisma.interview.create({
    data: {
      kind: "mock",
      companyName: "示例公司",
      jobTitle: "后端工程师",
      status: "generating",
      mockSession: {
        create: {
          resumeId: "resume-1",
          jdTextSnapshot:
            overrides.jdTextSnapshot ??
            "负责服务端开发，熟悉分布式系统、缓存一致性与消息队列，具备高并发系统设计经验，能独立完成模块设计与上线。",
          resumeTextSnapshot: "简历正文",
          contextSnapshotJson: JSON.stringify(
            overrides.snapshot ?? { generationRequest: { difficulty: "standard" } },
          ),
          status: overrides.status ?? "generating",
          generationPhase:
            overrides.generationPhase === undefined
              ? "job_blueprint"
              : overrides.generationPhase,
          questionCount: overrides.questionCount ?? 3,
          provider: "openai",
          model: "gpt-test",
          promptVersion: "test",
        },
      },
    },
    select: { id: true, mockSession: { select: { id: true } } },
  });

  return { interviewId: interview.id, sessionId: interview.mockSession!.id };
}

async function readSession(sessionId: string) {
  return prisma.mockInterviewSession.findUniqueOrThrow({ where: { id: sessionId } });
}

test("generation persists the questions and opens the room", async () => {
  const { sessionId, interviewId } = await seedGeneratingSession();

  await service.generateMockInterviewQuestions(sessionId);

  const session = await readSession(sessionId);
  assert.equal(session.status, "in_progress");
  assert.equal(session.generationPhase, null);
  assert.equal(session.questionCount, 3);

  const questions = await prisma.interviewQuestion.findMany({
    where: { interviewId },
    include: { evaluation: true },
    orderBy: { sortOrder: "asc" },
  });
  assert.equal(questions.length, 3);
  assert.equal(questions[0]!.question, "第 1 题");
  // 出题时就要落下 rubric，逐题评分才有一致的打分依据。
  assert.ok(questions[0]!.evaluation);
  assert.equal(questions[0]!.evaluation!.evaluationStatus, "pending");

  const interview = await prisma.interview.findUniqueOrThrow({ where: { id: interviewId } });
  assert.equal(interview.status, "in_progress");
});

test("records the real question count when the model returns fewer than requested", async () => {
  const { sessionId } = await seedGeneratingSession({ questionCount: 6 });
  stubs.questions = [
    { question: "少题 1", category: "technical" },
    { question: "少题 2", category: "technical" },
    { question: "少题 3", category: "technical" },
  ];

  await service.generateMockInterviewQuestions(sessionId);

  const session = await readSession(sessionId);
  assert.equal(session.status, "in_progress");
  // 数量软化：宁可少几题也要开场，进度条按真实题数走。
  assert.equal(session.questionCount, 3);
});

test("pauses for review instead of failing when the job description is nearly empty", async () => {
  const { sessionId } = await seedGeneratingSession({ jdTextSnapshot: "后端" });
  stubs.blueprint = {
    summary: "信息不足",
    completeness: "partial",
    missingInformation: ["任职要求"],
    competencies: [competency("bp-1")],
  };

  await service.generateMockInterviewQuestions(sessionId);

  const session = await readSession(sessionId);
  assert.equal(session.status, "awaiting_jd_review");
  assert.equal(session.generationPhase, null);
});

test("retries question generation once before surfacing a failure", async () => {
  const { sessionId } = await seedGeneratingSession();
  stubs.planErrors = [new Error("第一次失败")];

  await service.generateMockInterviewQuestions(sessionId);

  const session = await readSession(sessionId);
  assert.equal(session.status, "in_progress");
});

test("falls back to a failed session instead of throwing when generation keeps failing", async () => {
  const { sessionId } = await seedGeneratingSession();
  stubs.planErrors = [new Error("第一次失败"), new Error("第二次失败")];

  // 后台任务不应把异常抛给调用方，只能写进会话状态。
  await service.generateMockInterviewQuestions(sessionId);

  const session = await readSession(sessionId);
  assert.equal(session.status, "generation_failed");
  assert.equal(session.generationErrorCode, "model_unavailable");
  assert.match(session.generationError ?? "", /第二次失败/);
});

test("ignores generation requests for sessions that are no longer generating", async () => {
  const { sessionId, interviewId } = await seedGeneratingSession({ status: "in_progress" });

  await service.generateMockInterviewQuestions(sessionId);

  const questions = await prisma.interviewQuestion.count({ where: { interviewId } });
  assert.equal(questions, 0);
});

test("only claims a retry from the failed state and within the allowed question range", async () => {
  const { sessionId } = await seedGeneratingSession({ status: "generation_failed" });

  assert.equal(await service.claimMockInterviewGenerationRetry(sessionId, 2), false);
  assert.equal(await service.claimMockInterviewGenerationRetry(sessionId, 13), false);
  assert.equal(await service.claimMockInterviewGenerationRetry(sessionId, 5), true);

  const session = await readSession(sessionId);
  assert.equal(session.status, "generating");
  assert.equal(session.generationPhase, "job_blueprint");
  assert.equal(session.questionCount, 5);
  assert.equal(session.generationErrorCode, null);

  // 已经在生成中的会话不能被重复认领。
  assert.equal(await service.claimMockInterviewGenerationRetry(sessionId), false);
});

test("applies each job description strategy to the right restart point", async () => {
  const supplement = await seedGeneratingSession({
    status: "awaiting_jd_review",
    generationPhase: null,
    snapshot: { jdReviewCount: 1, jobBlueprint: defaultBlueprint() },
  });
  assert.equal(
    await service.applyJobDescriptionStrategy({
      sessionId: supplement.sessionId,
      strategy: "supplement",
      additionalText: "补充：需要熟悉 Kafka 与 Redis。",
    }),
    true,
  );
  const supplemented = await readSession(supplement.sessionId);
  assert.equal(supplemented.status, "generating");
  // 用户补了原文，蓝图必须重算。
  assert.equal(supplemented.generationPhase, "job_blueprint");
  assert.match(supplemented.jdTextSnapshot, /Kafka/);

  const proceed = await seedGeneratingSession({
    status: "awaiting_jd_review",
    generationPhase: null,
    snapshot: { jdReviewCount: 1, jobBlueprint: defaultBlueprint() },
  });
  assert.equal(
    await service.applyJobDescriptionStrategy({
      sessionId: proceed.sessionId,
      strategy: "proceed",
    }),
    true,
  );
  const proceeded = await readSession(proceed.sessionId);
  assert.equal(proceeded.generationPhase, "questions");
});

test("refuses a second supplement round and empty supplements", async () => {
  const { sessionId } = await seedGeneratingSession({
    status: "awaiting_jd_review",
    generationPhase: null,
    snapshot: { jdReviewCount: 2 },
  });

  assert.equal(
    await service.applyJobDescriptionStrategy({
      sessionId,
      strategy: "supplement",
      additionalText: "还是很短",
    }),
    false,
  );

  const stillWaiting = await readSession(sessionId);
  assert.equal(stillWaiting.status, "awaiting_jd_review");
});

/** 走完生成，返回一场可作答的面试。 */
async function seedAnswerableSession(questionCount = 3) {
  const seeded = await seedGeneratingSession({ questionCount });
  stubs.questions = Array.from({ length: questionCount }, (_, index) => ({
    question: `第 ${index + 1} 题`,
    category: "technical",
  }));
  await service.generateMockInterviewQuestions(seeded.sessionId);
  const questions = await prisma.interviewQuestion.findMany({
    where: { interviewId: seeded.interviewId },
    orderBy: { sortOrder: "asc" },
  });
  return { ...seeded, questions };
}

test("advances the question index and closes the room after the last answer", async () => {
  const { sessionId, questions } = await seedAnswerableSession(2);

  await service.submitMockInterviewAnswer({
    sessionId,
    questionId: questions[0]!.id,
    answer: "第一题的回答",
  });
  let session = await readSession(sessionId);
  assert.equal(session.currentQuestionIndex, 1);
  assert.equal(session.status, "in_progress");
  assert.ok(session.startedAt);

  await service.submitMockInterviewAnswer({
    sessionId,
    questionId: questions[1]!.id,
    answer: "第二题的回答",
  });
  session = await readSession(sessionId);
  assert.equal(session.status, "ready_to_evaluate");
  // 每道已作答的题都要排进后台评分。
  assert.deepEqual(stubs.scheduledEvaluations, [questions[0]!.id, questions[1]!.id]);
});

test("rejects out-of-order answers and empty answers", async () => {
  const { sessionId, questions } = await seedAnswerableSession(3);

  await assert.rejects(
    service.submitMockInterviewAnswer({
      sessionId,
      questionId: questions[2]!.id,
      answer: "跳着答",
    }),
    /请按顺序回答当前题目/,
  );

  await assert.rejects(
    service.submitMockInterviewAnswer({
      sessionId,
      questionId: questions[0]!.id,
      answer: "   ",
    }),
    /回答不能为空/,
  );

  const session = await readSession(sessionId);
  assert.equal(session.currentQuestionIndex, 0);
});

test("treats a repeated identical submission as already handled", async () => {
  const { sessionId, questions } = await seedAnswerableSession(3);

  await service.submitMockInterviewAnswer({
    sessionId,
    questionId: questions[0]!.id,
    answer: "第一题的回答",
  });
  // 网络重试打回来同样的内容时不能把进度再推一格。
  await service.submitMockInterviewAnswer({
    sessionId,
    questionId: questions[0]!.id,
    answer: "第一题的回答",
  });

  const session = await readSession(sessionId);
  assert.equal(session.currentQuestionIndex, 1);
});

test("records skipped questions without scheduling an evaluation", async () => {
  const { sessionId, questions } = await seedAnswerableSession(2);

  await service.submitMockInterviewAnswer({
    sessionId,
    questionId: questions[0]!.id,
    skip: true,
  });

  const skipped = await prisma.interviewQuestion.findUniqueOrThrow({
    where: { id: questions[0]!.id },
  });
  assert.ok(skipped.skippedAt);
  assert.equal(skipped.answer, null);
  assert.deepEqual(stubs.scheduledEvaluations, []);
});

test("inserts a follow-up right after the answered question", async () => {
  const { sessionId, interviewId, questions } = await seedAnswerableSession(3);
  stubs.followUp = { question: "追问：再展开一下", expectedSignals: ["更具体"] };

  await service.submitMockInterviewAnswer({
    sessionId,
    questionId: questions[0]!.id,
    answer: "一个留有明显缺口的回答",
  });

  const ordered = await prisma.interviewQuestion.findMany({
    where: { interviewId },
    orderBy: { sortOrder: "asc" },
  });
  assert.equal(ordered.length, 4);
  assert.equal(ordered[1]!.question, "追问：再展开一下");
  assert.equal(ordered[1]!.parentQuestionId, questions[0]!.id);
  // 后面的题整体后移，题数加一。
  assert.equal(ordered[2]!.question, "第 2 题");
  const session = await readSession(sessionId);
  assert.equal(session.questionCount, 4);
});

/** 把一场面试推到可交卷状态，并把逐题评分补成已完成。 */
async function seedCompletableSession() {
  const seeded = await seedAnswerableSession(2);
  for (const question of seeded.questions) {
    await service.submitMockInterviewAnswer({
      sessionId: seeded.sessionId,
      questionId: question.id,
      answer: `${question.question}的回答`,
    });
  }
  await prisma.interviewQuestionEvaluation.updateMany({
    data: {
      evaluationStatus: "completed",
      score: 80,
      feedback: "回答完整。",
      evaluatedAt: new Date(),
    },
  });
  return seeded;
}

test("produces a report, completes the interview and queues a profile refresh", async () => {
  const { sessionId, interviewId } = await seedCompletableSession();

  const report = await service.completeMockInterview(sessionId);
  assert.equal(report.totalScore, 80);
  assert.equal(report.summary, "整体表现总结");

  const session = await readSession(sessionId);
  assert.equal(session.status, "completed");
  assert.equal(session.totalScore, 80);
  assert.ok(session.completedAt);

  const interview = await prisma.interview.findUniqueOrThrow({ where: { id: interviewId } });
  assert.equal(interview.status, "completed");
  assert.ok(interview.interviewedAt);
  assert.equal(stubs.profileRefreshCalls, 1);
});

test("returns the stored report instead of regenerating it on a repeated submit", async () => {
  const { sessionId } = await seedCompletableSession();

  const first = await service.completeMockInterview(sessionId);
  const second = await service.completeMockInterview(sessionId);

  assert.deepEqual(second, first);
  // 重复交卷不能再花一次模型调用。
  assert.equal(stubs.summaryCalls, 1);
  assert.equal(stubs.profileRefreshCalls, 1);
});

test("refuses to score a session that still has unanswered questions", async () => {
  const { sessionId, questions } = await seedAnswerableSession(2);
  await service.submitMockInterviewAnswer({
    sessionId,
    questionId: questions[0]!.id,
    answer: "只答了第一题",
  });

  await assert.rejects(service.completeMockInterview(sessionId), /请先完成全部题目/);
});

test("rolls the session back so the user can retry when scoring is incomplete", async () => {
  const { sessionId } = await seedCompletableSession();
  await prisma.interviewQuestionEvaluation.updateMany({
    data: { evaluationStatus: "pending", score: null, feedback: null },
  });

  await assert.rejects(service.completeMockInterview(sessionId), /仍有题目正在评分/);

  // 关键：失败后必须退回 ready_to_evaluate，否则会话永远卡在 evaluating。
  const session = await readSession(sessionId);
  assert.equal(session.status, "ready_to_evaluate");
});

test("still produces a report when every question was skipped", async () => {
  const { sessionId, questions } = await seedAnswerableSession(2);
  for (const question of questions) {
    await service.submitMockInterviewAnswer({
      sessionId,
      questionId: question.id,
      skip: true,
    });
  }

  const report = await service.completeMockInterview(sessionId);
  assert.equal(report.totalScore, 0);
  // 全跳过时不调用汇总模型，直接给固定的引导文案。
  assert.equal(stubs.summaryCalls, 0);
  assert.match(report.summary, /均已跳过/);
});
