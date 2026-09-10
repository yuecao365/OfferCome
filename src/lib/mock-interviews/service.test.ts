import assert from "node:assert/strict";
import test, { after, before, beforeEach, mock } from "node:test";

import { createTestDatabase } from "@/lib/test-support/prisma-test-db";

import type { InterviewBrief } from "./interviewer/brief";
import type { TurnDecision } from "./interviewer/reducer";

/**
 * 模拟面试编排的回归测试。
 *
 * 覆盖目标是"流程骨架"而不是模型输出质量：备课的状态机走位与降级、乐观锁、
 * 回合落库的原子性与幂等、兼容层写题。所有 agent 都被替换成可编程的桩，
 * 数据库是真的（见 prisma-test-db）。
 */

const database = createTestDatabase();
process.env.DATABASE_URL = database.url;

const stubs = {
  blueprint: null as unknown,
  briefError: null as Error | null,
  contextError: null as Error | null,
  decisions: [] as TurnDecision[],
  turnCalls: 0,
  scheduledEvaluations: [] as string[],
  scheduledCompletions: [] as string[],
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

function testBrief(): InterviewBrief {
  return {
    version: 5,
    pace: "standard",
    plannedTurns: 11,
    round: "first_interview",
    askIntro: true,
    source: "model",
    skillPacks: ["project-deep-dive"],
    droppedAreas: [],
    hypotheses: [{ id: "h1", text: "验证压测经历", evidence: "压测", areaId: "area-1" }],
    areas: [
      {
        id: "area-1",
        name: "分布式系统",
        kind: "technical",
        style: "scenario",
        description: "缓存一致性与消息队列",
        projectId: null,
        competencyIds: ["bp-1"],
        jdEvidence: null,
        baseline: null,
        weight: 2,
        depth: 3,
        entryQuestion: "缓存和数据库双写时你怎么保证一致性？",
        ladder: [
          { text: "先说做法", style: "fact" },
          { text: "追问失效顺序", style: "principle" },
          { text: "追问故障排查", style: "scenario" },
          { text: "追问取舍", style: "tradeoff" },
        ],
        expectedSignals: ["延迟双删", "订阅 binlog"],
        rubric: [{ name: "技术正确性", description: "", weight: 50 }, { name: "分析与取舍", description: "", weight: 50 }],
      },
      {
        id: "area-2",
        name: "项目深挖",
        kind: "project",
        style: null,
        description: "简历项目",
        projectId: null,
        competencyIds: ["bp-2"],
        jdEvidence: null,
        baseline: null,
        weight: 3,
        depth: 3,
        entryQuestion: "介绍你负责的部分。",
        ladder: [
          { text: "职责", style: "fact" },
          { text: "决策", style: "principle" },
          { text: "问题", style: "scenario" },
          { text: "数字", style: "tradeoff" },
        ],
        expectedSignals: ["个人职责"],
        rubric: [{ name: "事实与细节", description: "", weight: 100 }],
      },
    ],
  };
}

mock.module("server-only", { namedExports: {} });

mock.module("./job-analysis-agent", {
  namedExports: {
    analyzeMockInterviewJob: async () => stubs.blueprint ?? defaultBlueprint(),
  },
});

mock.module("./interviewer/brief-agent", {
  namedExports: {
    generateInterviewBrief: async () => {
      if (stubs.briefError) throw stubs.briefError;
      return testBrief();
    },
  },
});

mock.module("./context", {
  namedExports: {
    buildMockInterviewContext: async () => {
      if (stubs.contextError) throw stubs.contextError;
      return {
        jobDescription: "JD",
        resume: { id: "resume-1", name: "简历.pdf", text: "简历正文" },
        projects: [],
        history: [],
        profile: { revision: 0, insights: [] },
      };
    },
    serializeMockInterviewContext: () => JSON.stringify({ resumeId: "resume-1" }),
  },
});

// 一回合两步：决定这一步取队列里的下一条；说话这一步用同一条的 speech（代码定动作的回合没有决定这一步，直接取队列）。
let pendingSpeech: string | null = null;
mock.module("./interviewer/turn-agent", {
  namedExports: {
    decideTurn: async () => {
      const decision = stubs.decisions.shift() ?? { speech: "", action: null, memoryPatch: null, failed: true };
      pendingSpeech = decision.speech;
      return { decision, skillsLoaded: 0 };
    },
    speakTurn: async () => {
      stubs.turnCalls += 1;
      const speech = pendingSpeech ?? stubs.decisions.shift()?.speech ?? "";
      pendingSpeech = null;
      return { stream: null, settled: Promise.resolve({ speech, failed: false }) };
    },
  },
});

mock.module("./question-evaluation-background", {
  namedExports: {
    scheduleMockInterviewQuestionEvaluation: (id: string) => {
      stubs.scheduledEvaluations.push(id);
    },
    scheduleMockInterviewCompletion: (id: string) => {
      stubs.scheduledCompletions.push(id);
    },
  },
});

mock.module("@/lib/candidate-profile/background", {
  namedExports: {
    enqueueCandidateProfileRefresh: async () => {},
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
  stubs.briefError = null;
  stubs.contextError = null;
  stubs.decisions = [];
  stubs.turnCalls = 0;
  stubs.scheduledEvaluations = [];
  stubs.scheduledCompletions = [];

  await prisma.mockInterviewMessage.deleteMany();
  await prisma.interviewThread.deleteMany();
  await prisma.interviewQuestionEvaluation.deleteMany();
  await prisma.interviewQuestion.deleteMany();
  await prisma.mockInterviewSession.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.resume.deleteMany();
});

const LONG_JD =
  "负责服务端开发，熟悉分布式系统、缓存一致性与消息队列，具备高并发系统设计经验，能独立完成模块设计与上线。";

async function seedGeneratingSession(
  overrides: {
    jdTextSnapshot?: string;
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
          jdTextSnapshot: overrides.jdTextSnapshot ?? LONG_JD,
          resumeTextSnapshot: "简历正文",
          contextSnapshotJson: JSON.stringify(
            overrides.snapshot ?? { generationRequest: { round: "first_interview" } },
          ),
          status: overrides.status ?? "generating",
          generationPhase:
            overrides.generationPhase === undefined ? "job_blueprint" : overrides.generationPhase,
          pace: "standard",
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

/** 造一场已备课、可以开始对话的会话。 */
async function seedReadySession() {
  const seeded = await seedGeneratingSession();
  await service.prepareMockInterview(seeded.sessionId);
  const session = await readSession(seeded.sessionId);
  assert.equal(session.status, "in_progress");
  return seeded;
}

async function runTurn(sessionId: string, candidate: { clientId: string; content: string; intent?: "skip" | "hint" | "repeat" | "end" | null } | null) {
  const turn = await service.startInterviewerTurn({
    sessionId,
    candidate: candidate ? { clientId: candidate.clientId, content: candidate.content, intent: candidate.intent ?? null } : null,
  });
  if (turn.replay) return { replay: true as const, messages: turn.messages };
  const result = await turn.finalize();
  return { replay: false as const, result };
}

// —— 备课流水线

test("preparation persists the brief with an empty memory and opens the room", async () => {
  const { sessionId, interviewId } = await seedGeneratingSession();
  await service.prepareMockInterview(sessionId);

  const session = await readSession(sessionId);
  assert.equal(session.status, "in_progress");
  assert.equal(session.generationPhase, null);
  assert.equal(JSON.parse(session.briefJson!).areas.length, 2);
  assert.deepEqual(JSON.parse(session.memoryJson).hypotheses, [{ id: "h1", status: "open", note: null }]);
  assert.equal(session.questionCount, 0);
  const interview = await prisma.interview.findUniqueOrThrow({ where: { id: interviewId } });
  assert.equal(interview.status, "in_progress");
});

test("unexpected failures land in generation_failed with a message, never in a stuck generating state", async () => {
  stubs.contextError = new Error("简历文件损坏");
  const { sessionId } = await seedGeneratingSession();
  await service.prepareMockInterview(sessionId);
  const session = await readSession(sessionId);
  assert.equal(session.status, "generation_failed");
  assert.match(session.generationError ?? "", /简历文件损坏/);
});

test("ignores preparation requests for sessions that are no longer generating", async () => {
  const { sessionId } = await seedGeneratingSession({ status: "in_progress", generationPhase: null });
  await service.prepareMockInterview(sessionId);
  assert.equal((await readSession(sessionId)).status, "in_progress");
});

test("retry is only claimed from the failed state and restarts at the blueprint", async () => {
  const { sessionId } = await seedGeneratingSession({ status: "generation_failed", generationPhase: null });
  assert.equal(await service.claimMockInterviewGenerationRetry(sessionId), true);
  const session = await readSession(sessionId);
  assert.equal(session.status, "generating");
  assert.equal(session.generationPhase, "job_blueprint");
  assert.equal(await service.claimMockInterviewGenerationRetry(sessionId), false);
});

// —— 对话回合

test("the opening turn asks for an intro and is replayed instead of regenerated", async () => {
  const { sessionId } = await seedReadySession();
  stubs.decisions = [{ speech: "你好，欢迎。请先介绍一下自己。", action: { name: "ask_intro", input: {} }, memoryPatch: null }];
  const first = await runTurn(sessionId, null);
  assert.equal(first.replay, false);
  const messages = await prisma.mockInterviewMessage.findMany({ where: { sessionId } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, "intro_request");

  const again = await runTurn(sessionId, null);
  assert.equal(again.replay, true);
  assert.equal(stubs.turnCalls, 1);
});

test("closing a thread writes the compat question with the area rubric and schedules its evaluation", async () => {
  const { sessionId, interviewId } = await seedReadySession();
  stubs.decisions = [
    { speech: "你好。", action: { name: "ask_intro", input: {} }, memoryPatch: null },
    { speech: "好的。", action: { name: "open_thread", input: { areaId: "area-1", question: "缓存和数据库双写时你怎么保证一致性？" } }, memoryPatch: null },
    { speech: "明白。先删缓存还是先写库？", action: { name: "probe", input: { anchor: "延迟双删", question: "先删缓存还是先写库？" } }, anchorHit: true, memoryPatch: { established: ["知道延迟双删"], doubtful: [], failed: [], hypotheses: [] } },
    { speech: "这一块够了。", action: { name: "close_thread", input: { note: "机制清楚，取舍偏弱" } }, memoryPatch: null },
  ];
  await runTurn(sessionId, null);
  await runTurn(sessionId, { clientId: "c1", content: "我叫小明。" });
  await runTurn(sessionId, { clientId: "c2", content: "我们用延迟双删。" });
  const closed = await runTurn(sessionId, { clientId: "c3", content: "先写库再删缓存。" });
  assert.equal(closed.replay, false);

  const questions = await prisma.interviewQuestion.findMany({ where: { interviewId }, include: { evaluation: true } });
  assert.equal(questions.length, 1);
  // 追问消息是面试官整段话（回应 + 问句），切段时原样进入题目文本。
  assert.match(questions[0].question, /双写[\s\S]*\n追问 1：[\s\S]*先删缓存/);
  assert.equal(questions[0].answer, "我们用延迟双删。\n\n先写库再删缓存。");
  assert.equal(questions[0].category, "technical");
  assert.deepEqual(JSON.parse(questions[0].evaluation!.rubricJson).map((item: { name: string }) => item.name), ["技术正确性", "分析与取舍"]);
  assert.deepEqual(stubs.scheduledEvaluations, [questions[0].id]);

  const session = await readSession(sessionId);
  assert.equal(session.questionCount, 1);
  assert.deepEqual(JSON.parse(session.memoryJson).established.map((item: { text: string }) => item.text), ["知道延迟双删"]);
  const threads = await prisma.interviewThread.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
  // 关掉 area-1 后代码紧接着开了 area-2，候选人不会面对没有下文的过渡语。
  assert.deepEqual(threads.map((thread) => [thread.areaId, thread.status]), [["area-1", "closed"], ["area-2", "active"]]);
  assert.equal(threads[0].questionId, questions[0].id);
  // 每回合一条决策记录：追问那回合记下锚点命中与信息量上涨。
  const decisions = await prisma.interviewTurnDecision.findMany({ where: { sessionId }, orderBy: { turnIndex: "asc" } });
  assert.equal(decisions.length, 4);
  assert.equal(decisions[2].appliedAction, "probe");
  assert.equal(decisions[2].anchorHit, true);
  assert.ok(decisions[3].evidenceAfter > decisions[1].evidenceBefore);
  // 候选人消息带作答元数据（字数一定有，时长视时钟而定）。
  const answers = await prisma.mockInterviewMessage.findMany({ where: { sessionId, role: "candidate" } });
  assert.ok(answers.every((message) => message.metricsJson && JSON.parse(message.metricsJson).chars > 0));
});

test("a duplicate clientId replays the stored interviewer reply without a second model call", async () => {
  const { sessionId } = await seedReadySession();
  stubs.decisions = [
    { speech: "你好。", action: { name: "ask_intro", input: {} }, memoryPatch: null },
    { speech: "好。", action: { name: "open_thread", input: { areaId: "area-2", question: "介绍你负责的部分。" } }, memoryPatch: null },
  ];
  await runTurn(sessionId, null);
  await runTurn(sessionId, { clientId: "dup", content: "自我介绍" });
  const calls = stubs.turnCalls;
  const replay = await runTurn(sessionId, { clientId: "dup", content: "自我介绍" });
  assert.equal(replay.replay, true);
  assert.equal(stubs.turnCalls, calls);
  assert.deepEqual(replay.replay ? replay.messages.map((message) => message.kind) : [], ["question"]);
});

test("a candidate asking to end moves the session to ready_to_evaluate and later turns are refused", async () => {
  const { sessionId } = await seedReadySession();
  stubs.decisions = [
    { speech: "你好。", action: { name: "ask_intro", input: {} }, memoryPatch: null },
    { speech: "那我们就到这里。", action: null, memoryPatch: null },
  ];
  await runTurn(sessionId, null);
  const ended = await runTurn(sessionId, { clientId: "e1", content: "我们结束吧", intent: "end" });
  assert.equal(ended.replay, false);
  assert.equal((await readSession(sessionId)).status, "ready_to_evaluate");
  // 面试一结束就安排自动生成报告。
  assert.deepEqual(stubs.scheduledCompletions, [sessionId]);
  await assert.rejects(runTurn(sessionId, { clientId: "e2", content: "还在吗" }), /已经结束/);
});

test("a failed model turn still produces a deterministic interviewer message", async () => {
  const { sessionId } = await seedReadySession();
  stubs.decisions = [{ speech: "", action: null, memoryPatch: null, failed: true }];
  const first = await runTurn(sessionId, null);
  assert.equal(first.replay, false);
  const messages = await prisma.mockInterviewMessage.findMany({ where: { sessionId } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, "intro_request");
  assert.ok(messages[0].content.length > 0);
});
