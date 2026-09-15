import assert from "node:assert/strict";
import test, { after, before, beforeEach, mock } from "node:test";

import type { PolicyOutput } from "@/lib/interview/policy";
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
  /** 策略每次调用取一条；null = 模型没产出。 */
  outputs: [] as (PolicyOutput | null)[],
  policyCalls: 0,
  scheduledCompletions: [] as string[],
};

function competency(id: string) {
  return { id, name: `能力 ${id}`, description: "描述", priority: "core" as const, jdEvidence: "JD 原文片段", origin: "jd" as const, sourceUrl: null };
}

function defaultBlueprint() {
  return { summary: "岗位摘要", completeness: "complete" as const, missingInformation: [], competencies: [competency("bp-1"), competency("bp-2"), competency("bp-3"), competency("bp-4")] };
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

// 一回合一次策略调用：取队列里的下一条当作模型这回合的产出。
mock.module("@/lib/interview/policy", {
  namedExports: {
    POLICY_PROMPT_VERSION: "policy-test",
    FALLBACK_SPEECH: { askIntro: "你好，我们开始吧。请先做个自我介绍。", stall: "稍等，你接着说。", closing: "好的，今天的面试就到这里。" },
    runPolicy: (input: { runId: string }) => {
      stubs.policyCalls += 1;
      const output = stubs.outputs.shift() ?? null;
      return {
        say: (async function* () {
          if (output) yield output.say;
        })(),
        settled: Promise.resolve({ runId: input.runId, output, skillsLoaded: 0, failed: output === null, raw: { runId: input.runId, text: "", stepTexts: [], toolCalls: [], durationMs: 0, error: null } }),
      };
    },
  },
});

mock.module("@/lib/interview/background", { namedExports: { scheduleLabeling: () => {} } });

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

const say = (text: string, extras: Partial<PolicyOutput> = {}): PolicyOutput => ({ say: text, notebook: "", closing: false, ...extras });

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
  let spoken = "";
  for await (const delta of turn.say) spoken += delta;
  const payload = await turn.finalize();
  return { replay: false as const, payload, spoken };
}

async function eventTypes(sessionId: string) {
  return (await prisma.interviewEvent.findMany({ where: { sessionId }, orderBy: { seq: "asc" } })).map((row) => row.type);
}

// —— 备课流水线

test("preparation persists the brief with an empty notebook and a time box, and opens the room", async () => {
  const { sessionId, interviewId } = await seedGeneratingSession();
  await service.prepareMockInterview(sessionId);
  const session = await readSession(sessionId);
  assert.equal(session.status, "in_progress");
  assert.equal(session.generationPhase, null);
  assert.equal(JSON.parse(session.briefJson!).areas.length, 7);
  assert.equal(session.notebook, "");
  assert.equal(session.durationMinutes, 20);
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

test("the opening turn streams the interviewer's words, writes events and the notebook, and is replayed instead of regenerated", async () => {
  const { sessionId } = await seedReadySession();
  stubs.outputs = [say("你好，欢迎。请先介绍一下自己。", { notebook: "先听自我介绍，再挑最贴岗位的项目。" })];
  const first = await runTurn(sessionId, null);
  assert.equal(first.replay, false);
  assert.equal(first.replay === false && first.spoken, "你好，欢迎。请先介绍一下自己。");
  const messages = await prisma.mockInterviewMessage.findMany({ where: { sessionId } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, "say");
  assert.deepEqual(await eventTypes(sessionId), ["interviewer_said", "notebook_written", "clock_tick"]);
  const session = await readSession(sessionId);
  assert.equal(session.notebook, "先听自我介绍，再挑最贴岗位的项目。");
  assert.ok(session.startedAt);
  assert.ok(JSON.parse(session.clockJson!).usedMinutes > 0);

  const again = await runTurn(sessionId, null);
  assert.equal(again.replay, true);
  assert.equal(stubs.policyCalls, 1);
});

test("a candidate message and the reply land together; a duplicate clientId replays without a second model call", async () => {
  const { sessionId } = await seedReadySession();
  stubs.outputs = [say("你好。"), say("主循环里你负责哪一段？", { notebook: "先问主循环。" })];
  await runTurn(sessionId, null);
  const turn = await runTurn(sessionId, { clientId: "c1", content: "我叫小明。", control: null });
  assert.equal(turn.replay, false);
  assert.deepEqual(
    turn.replay === false && turn.payload.newMessages.map((message) => [message.role, message.kind]),
    [
      ["candidate", "answer"],
      ["interviewer", "say"],
    ],
  );
  assert.deepEqual(await eventTypes(sessionId), ["interviewer_said", "clock_tick", "candidate_said", "interviewer_said", "notebook_written", "clock_tick"]);
  const again = await runTurn(sessionId, { clientId: "c1", content: "我叫小明。" });
  assert.equal(again.replay, true);
  assert.equal(again.replay && again.messages[0]?.content, "主循环里你负责哪一段？");
  assert.equal(stubs.policyCalls, 2);
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

test("a failed model turn still produces a deterministic interviewer message and records the fallback", async () => {
  const { sessionId } = await seedReadySession();
  stubs.outputs = [null];
  const turn = await runTurn(sessionId, null);
  assert.equal(turn.replay === false && turn.payload.newMessages[0]?.kind, "fallback");
  assert.ok((await eventTypes(sessionId)).includes("fallback_used"));
  assert.equal((await readSession(sessionId)).status, "in_progress");
});

test("the interviewer's closing flag is ignored early and honoured once the time box is past half", async () => {
  const { sessionId } = await seedReadySession();
  stubs.outputs = [say("你好。"), say("这块先到这，我们换下一个话题。", { closing: true }), say("再问一句。"), say("再问一句。"), say("再问一句。"), say("今天先到这里，谢谢。", { closing: true })];
  await runTurn(sessionId, null);
  const early = await runTurn(sessionId, { clientId: "c1", content: "我叫小明。" });
  assert.equal(early.replay === false && early.payload.phase, "running");
  // 每条回答最多记 2.5 分钟：四条长回答把 20 分钟的时钟推过一半。
  for (const clientId of ["c2", "c3", "c4"]) await runTurn(sessionId, { clientId, content: "一".repeat(700) });
  const late = await runTurn(sessionId, { clientId: "c5", content: "一".repeat(700) });
  assert.equal(late.replay === false && late.payload.phase, "ended");
  assert.equal(late.replay === false && late.payload.endedBy, "interviewer");
  assert.equal((await readSession(sessionId)).status, "ready_to_evaluate");
});
