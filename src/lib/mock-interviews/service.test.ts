import assert from "node:assert/strict";
import test, { after, before, beforeEach, mock } from "node:test";

import type { InterviewerCall, InterviewerOutput } from "@/lib/interview/interviewer";
import { testBrief } from "@/lib/test-support/interview-brief";
import { createTestDatabase } from "@/lib/test-support/prisma-test-db";

import type { InterviewBrief } from "./brief/brief";

/**
 * 模拟面试编排的回归测试。
 *
 * 覆盖目标是"流程骨架"而不是模型输出质量：备课的状态机走位与降级、乐观锁、
 * 回合落库的原子性与幂等、事件日志、时间盒与结束按钮。所有 agent 都被替换成可编程的桩，
 * 数据库是真的（见 prisma-test-db）。
 */

const database = createTestDatabase();
process.env.DATABASE_URL = database.url;

const stubs = {
  blueprint: null as unknown,
  briefError: null as Error | null,
  contextError: null as Error | null,
  /** 面试官每次调用取一条；null = 模型没产出（调用失败）。 */
  outputs: [] as (InterviewerOutput | null)[],
  policyCalls: 0,
  /** 每次调用收到的状态卡（看重出原因）。 */
  cards: [] as string[],
  scheduledCompletions: [] as string[],
};

function competency(id: string) {
  return { id, name: `能力 ${id}`, description: "描述", priority: "core" as const, jdEvidence: "JD 原文片段", origin: "jd" as const, sourceUrl: null };
}

function defaultBlueprint() {
  return { summary: "岗位摘要", completeness: "complete" as const, missingInformation: [], business: null, competencies: [competency("bp-1"), competency("bp-2"), competency("bp-3"), competency("bp-4")] };
}

function briefStub(): InterviewBrief {
  return testBrief({ hypotheses: [{ id: "h1", text: "验证压测经历", evidence: "压测", projectId: "proj-1" }] });
}

mock.module("server-only", { namedExports: {} });

mock.module("./job-analysis-agent", { namedExports: { analyzeMockInterviewJob: async () => stubs.blueprint ?? defaultBlueprint() } });

mock.module("./brief/brief-agent", {
  namedExports: {
    generateInterviewBrief: async () => {
      if (stubs.briefError) throw stubs.briefError;
      return briefStub();
    },
  },
});

mock.module("./context", {
  namedExports: {
    buildMockInterviewContext: async () => {
      if (stubs.contextError) throw stubs.contextError;
      return { jobDescription: "JD", resume: { id: "resume-1", name: "简历.pdf", text: "简历正文" }, projects: [], history: [], profile: { revision: 0, insights: [] } };
    },
    serializeMockInterviewContext: () => JSON.stringify({ resumeId: "resume-1" }),
    competenciesOf: () => [],
  },
});

// 一回合一次面试官调用（重出时会多一次）：取队列里的下一条当作模型这回合的产出；null 让调用失败。
mock.module("@/lib/interview/interviewer", {
  namedExports: {
    INTERVIEWER_PROMPT_VERSION: "interviewer-test",
    renderCard: (_state: unknown, options: { retry: string | null }) => options.retry ?? "card",
    runInterviewerTurn: async (input: InterviewerCall) => {
      stubs.policyCalls += 1;
      stubs.cards.push(input.card);
      const output = stubs.outputs.shift() ?? null;
      if (!output) throw new Error("模型没有产出");
      return { output, partial: false, runId: input.runId, provider: "openai", model: "gpt-test", durationMs: 0, steps: 1, toolCalls: [], events: [] };
    },
  },
});

mock.module("./question-evaluation-background", {
  namedExports: {
    scheduleMockInterviewQuestionEvaluation: () => {},
    scheduleMockInterviewCompletion: (id: string) => {
      stubs.scheduledCompletions.push(id);
    },
  },
});

mock.module("@/lib/candidate-profile/background", { namedExports: { enqueueCandidateProfileRefresh: async () => {}, scheduleCandidateProfileRefresh: () => {} } });

mock.module("@/lib/settings/ai", { namedExports: { getAiTaskConfig: async () => ({ task: "text", provider: "openai", model: "gpt-test", baseURL: null, apiKey: "k", requiresApiKey: true }) } });

const say = (text: string, extras: Partial<InterviewerOutput> = {}): InterviewerOutput => ({ signal: "answered", action: "probe", target: null, facet: null, why: "顺着问", ledger: "", reply: text, ...extras });
const enter = (target: string, text = `${target} 的切入问法？`) => say(text, { action: "switch", target });

type Service = typeof import("./service");
type Orchestrator = typeof import("@/lib/interview/orchestrator");
type Prisma = (typeof import("@/lib/db"))["prisma"];

let service: Service;
let orchestrator: Orchestrator;
let prisma: Prisma;

before(async () => {
  service = await import("./service");
  orchestrator = await import("@/lib/interview/orchestrator");
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
  stubs.outputs = [];
  stubs.policyCalls = 0;
  stubs.cards = [];
  stubs.scheduledCompletions = [];
  await prisma.interviewEvent.deleteMany();
  await prisma.mockInterviewMessage.deleteMany();
  await prisma.interviewThread.deleteMany();
  await prisma.interviewQuestionEvaluation.deleteMany();
  await prisma.interviewQuestion.deleteMany();
  await prisma.mockInterviewSession.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.resume.deleteMany();
});

const LONG_JD = "负责服务端开发，熟悉分布式系统、缓存一致性与消息队列，具备高并发系统设计经验，能独立完成模块设计与上线。";

async function seedGeneratingSession(overrides: { jdTextSnapshot?: string; snapshot?: Record<string, unknown>; status?: string; generationPhase?: string | null } = {}) {
  await prisma.resume.upsert({
    where: { id: "resume-1" },
    update: {},
    create: { id: "resume-1", originalName: "简历.pdf", storedName: "resume-1.pdf", filePath: "/tmp/resume-1.pdf", mimeType: "application/pdf", fileSize: 1024, isDefault: true },
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
          contextSnapshotJson: JSON.stringify(overrides.snapshot ?? { generationRequest: { round: "first_interview" } }),
          status: overrides.status ?? "generating",
          generationPhase: overrides.generationPhase === undefined ? "job_blueprint" : overrides.generationPhase,
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
  assert.equal((await readSession(seeded.sessionId)).status, "in_progress");
  return seeded;
}

async function runTurn(sessionId: string, candidate: { clientId: string; content: string; control?: "skip" | "hint" | "repeat" | "end" | null } | null) {
  const turn = await orchestrator.startTurn({
    sessionId,
    candidate: candidate ? { clientId: candidate.clientId, content: candidate.content, control: candidate.control ?? null, composeMs: null } : null,
  });
  if (turn.replay) return { replay: true as const, messages: turn.messages };
  const payload = await turn.finalize();
  return { replay: false as const, payload, spoken: payload.newMessages.filter((message) => message.role === "interviewer").map((message) => message.content).join("\n") };
}

async function eventTypes(sessionId: string) {
  return (await prisma.interviewEvent.findMany({ where: { sessionId }, orderBy: { seq: "asc" } })).map((row) => row.type);
}

// —— 备课流水线

test("preparation persists the brief and opens the room", async () => {
  const { sessionId, interviewId } = await seedGeneratingSession();
  await service.prepareMockInterview(sessionId);
  const session = await readSession(sessionId);
  assert.equal(session.status, "in_progress");
  assert.equal(session.generationPhase, null);
  assert.equal(JSON.parse(session.briefJson!).areas.length, 7);
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

test("the opening turn writes the interviewer's words and events, and is replayed instead of regenerated", async () => {
  const { sessionId } = await seedReadySession();
  stubs.outputs = [say("你好，欢迎。请先介绍一下自己。")];
  const first = await runTurn(sessionId, null);
  assert.equal(first.replay, false);
  assert.equal(first.replay === false && first.spoken, "你好，欢迎。请先介绍一下自己。");
  const messages = await prisma.mockInterviewMessage.findMany({ where: { sessionId } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, "say");
  assert.deepEqual(await eventTypes(sessionId), ["interviewer_said"]);
  assert.ok((await readSession(sessionId)).startedAt);

  const again = await runTurn(sessionId, null);
  assert.equal(again.replay, true);
  assert.equal(stubs.policyCalls, 1);
});

test("a candidate message and the reply land together with the model's signal and ledger; a duplicate clientId replays without a second model call", async () => {
  const { sessionId } = await seedReadySession();
  stubs.outputs = [say("你好。"), enter("p1-overview", "先聊第一个项目：整体架构？"), say("主循环里你负责哪一段？", { facet: 0, ledger: "自我介绍提到主循环" })];
  await runTurn(sessionId, null);
  await runTurn(sessionId, { clientId: "c0", content: "我叫小明。" });
  const turn = await runTurn(sessionId, { clientId: "c1", content: "我做了主循环。" });
  assert.equal(turn.replay, false);
  assert.deepEqual(
    turn.replay === false && turn.payload.newMessages.map((message) => [message.role, message.kind, message.signal ?? null]),
    [
      ["candidate", "answer", "answered"],
      ["interviewer", "say", "answered"],
    ],
  );
  assert.deepEqual(await eventTypes(sessionId), ["interviewer_said", "candidate_said", "interviewer_said", "candidate_said", "interviewer_said", "ledger_written"]);
  const again = await runTurn(sessionId, { clientId: "c1", content: "我做了主循环。" });
  assert.equal(again.replay, true);
  assert.equal(again.replay && again.messages[0]?.content, "主循环里你负责哪一段？");
  assert.equal(stubs.policyCalls, 3);
});

test("a candidate asking to end closes the interview without a model call and later turns are refused", async () => {
  const { sessionId } = await seedReadySession();
  stubs.outputs = [say("你好。")];
  await runTurn(sessionId, null);
  const ended = await runTurn(sessionId, { clientId: "e1", content: "", control: "end" });
  assert.equal(ended.replay === false && ended.payload.phase, "ended");
  assert.equal(ended.replay === false && ended.payload.endedBy, "candidate");
  assert.equal(stubs.policyCalls, 1);
  assert.equal((await readSession(sessionId)).status, "ready_to_evaluate");
  assert.deepEqual(stubs.scheduledCompletions, [sessionId]);
  assert.equal((await eventTypes(sessionId)).at(-1), "ended");
  await assert.rejects(runTurn(sessionId, { clientId: "e2", content: "还在吗" }), /已经结束/);
});

test("a failed model turn fails the request instead of inventing a line; nothing is persisted and the room stays open", async () => {
  const { sessionId } = await seedReadySession();
  stubs.outputs = [null];
  await assert.rejects(runTurn(sessionId, null), /模型没有产出/);
  assert.deepEqual(await eventTypes(sessionId), []);
  assert.equal((await readSession(sessionId)).status, "in_progress");
});

test("an out-of-bounds action is sent back once with the reason, then the code fixes the action; a permitted farewell ends the interview", async () => {
  const { sessionId } = await seedReadySession();
  // 开场后就想告别：退回重出；重出仍告别：代码定 switch 到第一份材料，模型只写这句话。
  stubs.outputs = [say("你好。"), say("今天就到这里。", { action: "end" }), say("再见。", { action: "end" }), say("先聊第一个项目吧。", { action: "switch", target: "p1-overview" })];
  await runTurn(sessionId, null);
  const early = await runTurn(sessionId, { clientId: "c1", content: "我叫小明。" });
  assert.equal(early.replay === false && early.payload.phase, "running");
  assert.equal(early.replay === false && early.payload.newMessages.at(-1)?.content, "先聊第一个项目吧。");
  assert.match(stubs.cards[2], /还不能收尾/);
  assert.match(stubs.cards[3], /代码已定这回合的动作：switch，材料 p1-overview/);
  assert.equal((await eventTypes(sessionId)).filter((type) => type === "fallback_used").length, 2);
  // 连续三句答不上：允许收尾。
  stubs.outputs = [say("换个角度：为什么选这个架构？", { signal: "dont_know", facet: 0 }), say("那模块拆分呢？", { signal: "dont_know", facet: 1 }), say("今天就到这里，谢谢你的时间。", { signal: "dont_know", action: "end" })];
  await runTurn(sessionId, { clientId: "c2", content: "不知道。" });
  await runTurn(sessionId, { clientId: "c3", content: "不记得了。" });
  const last = await runTurn(sessionId, { clientId: "c4", content: "不会。" });
  assert.equal(last.replay === false && last.payload.phase, "ended");
  assert.equal(last.replay === false && last.payload.endedBy, "interviewer");
  assert.equal((await readSession(sessionId)).status, "ready_to_evaluate");
});
