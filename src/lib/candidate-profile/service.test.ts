import assert from "node:assert/strict";
import test, { after, before, beforeEach, mock } from "node:test";

import { createTestDatabase } from "@/lib/test-support/prisma-test-db";

/**
 * 能力画像刷新的回归测试。
 *
 * 覆盖三相流水线（评估 → 合成 → 落库）的骨架：分批续跑、sourceHash 幂等、
 * 租约互斥、失败回退，以及三个用户操作的写入语义。两个 agent 被替换成桩，
 * 数据库是真的——租约和事务正是这里最容易改坏的部分。
 */

const database = createTestDatabase();
process.env.DATABASE_URL = database.url;

const stubs = {
  assessCalls: [] as string[],
  assessError: null as Error | null,
  synthesisError: null as Error | null,
  synthesisCalls: 0,
};

mock.module("server-only", { namedExports: {} });

mock.module("./assessment-agent", {
  namedExports: {
    assessInterviewQuestions: async (input: {
      questions: { id: string; answer: string }[];
    }) => {
      stubs.assessCalls.push(input.questions[0]?.id ?? "unknown");
      if (stubs.assessError) throw stubs.assessError;
      return {
        provider: "openai",
        model: "gpt-test",
        observations: input.questions.map((question) => ({
          questionId: question.id,
          dimension: "knowledge_accuracy" as const,
          score: 4,
          confidence: 0.8,
          // 逐字证据是硬门，必须真的出现在回答里。
          evidenceExcerpt: question.answer.slice(0, 12),
        })),
      };
    },
  },
});

mock.module("./agent", {
  namedExports: {
    synthesizeCandidateInsights: async (input: {
      roleKey: string;
      observations: { id: string }[];
    }) => {
      stubs.synthesisCalls += 1;
      if (stubs.synthesisError) throw stubs.synthesisError;
      const first = input.observations[0];
      return {
        provider: "openai",
        model: "gpt-test",
        synthesis: {
          insights: first
            ? [
                {
                  dimension: "knowledge_accuracy" as const,
                  kind: "strength" as const,
                  title: `${input.roleKey} 的知识准确性不错`,
                  statement: "回答里能给出具体机制，继续保持。",
                  evidence: [
                    { observationId: first.id, polarity: "supports" as const },
                  ],
                },
              ]
            : [],
        },
      };
    },
  },
});

type Service = typeof import("./service");
type State = typeof import("./state");
type Prisma = (typeof import("@/lib/db"))["prisma"];

let service: Service;
let state: State;
let prisma: Prisma;
let PROFILE_STATE_ID: string;

before(async () => {
  service = await import("./service");
  state = await import("./state");
  ({ prisma } = await import("@/lib/db"));
  ({ PROFILE_STATE_ID } = await import("./types"));
});

after(async () => {
  await prisma.$disconnect();
  database.cleanup();
});

beforeEach(async () => {
  stubs.assessCalls = [];
  stubs.assessError = null;
  stubs.synthesisError = null;
  stubs.synthesisCalls = 0;

  await prisma.candidateInsightEvidence.deleteMany();
  await prisma.candidateInsight.deleteMany();
  await prisma.abilityObservation.deleteMany();
  await prisma.interviewAssessment.deleteMany();
  await prisma.candidateProfileMetric.deleteMany();
  await prisma.candidateProfileSnapshot.deleteMany();
  await prisma.candidateProfileRun.deleteMany();
  await prisma.candidateProfileState.deleteMany();
  await prisma.interviewQuestion.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.roleContext.deleteMany();
});

let interviewCounter = 0;

/** 造一场已完成、有回答的真实面试——这是画像的唯一素材来源。 */
async function seedCompletedInterview(
  overrides: { jobTitle?: string; kind?: string; answer?: string } = {},
) {
  interviewCounter += 1;
  const answer = overrides.answer ?? `第 ${interviewCounter} 场的详细回答内容，包含具体机制说明。`;
  return prisma.interview.create({
    data: {
      kind: overrides.kind ?? "real",
      sourceType: overrides.kind === "mock" ? "mock" : "real_summary",
      companyName: `公司 ${interviewCounter}`,
      jobTitle: overrides.jobTitle ?? "后端工程师",
      status: "completed",
      interviewedAt: new Date(2026, 0, interviewCounter),
      questions: {
        create: [
          {
            question: `第 ${interviewCounter} 场的问题`,
            answer,
            category: "technical",
            sortOrder: 0,
          },
        ],
      },
    },
    include: { questions: true },
  });
}

async function readState() {
  return prisma.candidateProfileState.findUniqueOrThrow({
    where: { id: PROFILE_STATE_ID },
  });
}

test("skips the refresh entirely when nothing marked the profile dirty", async () => {
  await state.ensureCandidateProfileState();

  const result = await service.refreshCandidateProfile();

  assert.deepEqual(result, { status: "skipped", reason: "clean" });
  assert.equal(stubs.assessCalls.length, 0);
});

test("assesses interviews, synthesises insights and stores a snapshot", async () => {
  await seedCompletedInterview();
  await state.markCandidateProfileDirty({ debounceMs: 0 });

  const result = await service.refreshCandidateProfile({ force: true });

  assert.equal(result.status, "success");
  assert.equal(stubs.assessCalls.length, 1);

  const observations = await prisma.abilityObservation.findMany();
  assert.equal(observations.length, 1);
  assert.equal(observations[0]!.dimension, "knowledge_accuracy");

  const insights = await prisma.candidateInsight.findMany();
  assert.ok(insights.length > 0);
  // 每条洞察都必须挂在真实观察上，否则就是无法回溯的空话。
  const evidence = await prisma.candidateInsightEvidence.findMany();
  assert.ok(evidence.length > 0);
  assert.ok(
    evidence.every((item) =>
      observations.some((observation) => observation.id === item.observationId),
    ),
  );

  const finalState = await readState();
  assert.equal(finalState.status, "idle");
  assert.equal(finalState.phase, "idle");
  assert.equal(finalState.leaseToken, null);
  assert.ok(finalState.lastRefreshedAt);
});

test("processes long backlogs in batches instead of one long run", async () => {
  for (let index = 0; index < 4; index += 1) await seedCompletedInterview();
  await state.markCandidateProfileDirty({ debounceMs: 0 });

  const first = await service.refreshCandidateProfile({ force: true });
  assert.equal(first.status, "processing");
  assert.equal(stubs.assessCalls.length, 3);

  // 让下一批可以立刻续跑，而不是卡在 running。
  const midState = await readState();
  assert.equal(midState.status, "pending");
  assert.equal(midState.phase, "assessment");
  assert.equal(midState.leaseToken, null);
  assert.equal(midState.completedCount, 3);
  assert.equal(midState.totalCount, 4);

  const second = await service.refreshCandidateProfile({ force: true });
  assert.equal(second.status, "success");
  assert.equal(stubs.assessCalls.length, 4);
});

test("does not re-assess an interview whose content has not changed", async () => {
  await seedCompletedInterview();
  await state.markCandidateProfileDirty({ debounceMs: 0 });
  await service.refreshCandidateProfile({ force: true });
  assert.equal(stubs.assessCalls.length, 1);

  stubs.assessCalls = [];
  await state.markCandidateProfileDirty({ debounceMs: 0 });
  await service.refreshCandidateProfile({ force: true });

  // sourceHash 没变就跳过模型调用——这是省钱也是幂等的关键。
  // 回归点：评估会给真实面试补一条空的评分记录，这条记录一度让哈希变化，
  // 导致每场真实面试都被白白重评一次。
  assert.equal(stubs.assessCalls.length, 0);
});

test("re-assesses an interview after its answers change", async () => {
  const interview = await seedCompletedInterview();
  await state.markCandidateProfileDirty({ debounceMs: 0 });
  await service.refreshCandidateProfile({ force: true });
  stubs.assessCalls = [];

  await prisma.interviewQuestion.update({
    where: { id: interview.questions[0]!.id },
    data: { answer: "改写后的回答内容，补充了更多取舍分析与量化结果。" },
  });
  await state.markCandidateProfileDirty({ debounceMs: 0 });
  await service.refreshCandidateProfile({ force: true });

  assert.equal(stubs.assessCalls.length, 1);
});

test("refuses to start a second refresh while a lease is still held", async () => {
  await seedCompletedInterview();
  await prisma.candidateProfileState.upsert({
    where: { id: PROFILE_STATE_ID },
    create: {
      id: PROFILE_STATE_ID,
      status: "running",
      leaseToken: "held-by-someone-else",
      leaseExpiresAt: new Date(Date.now() + 60_000),
    },
    update: {},
  });

  const result = await service.refreshCandidateProfile();

  assert.deepEqual(result, { status: "skipped", reason: "running" });
  assert.equal(stubs.assessCalls.length, 0);
});

test("takes over a lease that expired with a crashed run", async () => {
  await seedCompletedInterview();
  await prisma.candidateProfileState.upsert({
    where: { id: PROFILE_STATE_ID },
    create: {
      id: PROFILE_STATE_ID,
      status: "running",
      leaseToken: "stale",
      leaseExpiresAt: new Date(Date.now() - 60_000),
      lastSourceAt: new Date(),
    },
    update: {},
  });

  const result = await service.refreshCandidateProfile();

  assert.equal(result.status, "success");
});

test("waits out the debounce window before an automatic refresh runs", async () => {
  await seedCompletedInterview();
  await state.markCandidateProfileDirty({ debounceMs: 60_000 });

  assert.deepEqual(await service.refreshCandidateProfile(), {
    status: "skipped",
    reason: "not_due",
  });
  // 手动刷新可以跳过防抖。
  assert.equal((await service.refreshCandidateProfile({ force: true })).status, "success");
});

test("records the failure and schedules a retry when synthesis breaks", async () => {
  await seedCompletedInterview();
  await state.markCandidateProfileDirty({ debounceMs: 0 });
  stubs.synthesisError = new Error("合成模型不可用");

  await assert.rejects(
    service.refreshCandidateProfile({ force: true }),
    /合成模型不可用/,
  );

  const failedState = await readState();
  assert.equal(failedState.status, "failed");
  assert.equal(failedState.lastError, "合成模型不可用");
  // 租约必须释放，否则后续刷新永远被 running 挡住。
  assert.equal(failedState.leaseToken, null);
  assert.ok(failedState.dueAt && failedState.dueAt > new Date());

  const run = await prisma.candidateProfileRun.findFirstOrThrow({
    orderBy: { startedAt: "desc" },
  });
  assert.equal(run.status, "failed");
});

test("groups interviews under a normalised role key", async () => {
  await seedCompletedInterview({ jobTitle: "后端工程师" });
  await seedCompletedInterview({ jobTitle: " 后端工程师 " });
  await state.markCandidateProfileDirty({ debounceMs: 0 });

  await service.refreshCandidateProfile({ force: true });

  const roles = await prisma.roleContext.findMany();
  assert.equal(roles.length, 1);
  const metrics = await prisma.candidateProfileMetric.findMany({
    where: { roleKey: { not: "all" } },
  });
  assert.ok(metrics.length > 0);
});

async function seedInsight() {
  await seedCompletedInterview();
  await state.markCandidateProfileDirty({ debounceMs: 0 });
  await service.refreshCandidateProfile({ force: true });
  return prisma.candidateInsight.findFirstOrThrow();
}

test("locks an insight whenever the user edits, hides or confirms it", async () => {
  const insight = await seedInsight();

  const hidden = await service.updateCandidateInsight({ id: insight.id, action: "hide" });
  assert.equal(hidden.status, "hidden");
  assert.equal(hidden.isUserLocked, true);

  const restored = await service.updateCandidateInsight({ id: insight.id, action: "restore" });
  assert.equal(restored.status, "active");
  assert.equal(restored.hasConflict, false);

  const edited = await service.updateCandidateInsight({
    id: insight.id,
    action: "edit",
    title: "我自己的标题",
    statement: "我自己的描述。",
  });
  assert.equal(edited.title, "我自己的标题");
  assert.ok(edited.userEditedAt);

  await assert.rejects(
    service.updateCandidateInsight({ id: insight.id, action: "edit", title: "只有标题" }),
    /请输入有效的标题和洞察内容/,
  );
});

test("keeps a user-locked insight through the next refresh", async () => {
  const insight = await seedInsight();
  await service.updateCandidateInsight({
    id: insight.id,
    action: "edit",
    title: "锁定后的标题",
    statement: "锁定后的描述。",
  });

  await seedCompletedInterview();
  await state.markCandidateProfileDirty({ debounceMs: 0 });
  await service.refreshCandidateProfile({ force: true });

  const kept = await prisma.candidateInsight.findUnique({ where: { id: insight.id } });
  assert.equal(kept?.title, "锁定后的标题");
});

test("remembers the original dimension when the user reassigns an observation", async () => {
  await seedInsight();
  const observation = await prisma.abilityObservation.findFirstOrThrow();

  await service.correctAbilityObservation({
    id: observation.id,
    action: "reassign_dimension",
    dimension: "reasoning_depth",
  });

  const moved = await prisma.abilityObservation.findUniqueOrThrow({
    where: { id: observation.id },
  });
  assert.equal(moved.dimension, "reasoning_depth");
  assert.equal(moved.originalDimension, "knowledge_accuracy");
  assert.ok(moved.userCorrectedAt);

  await service.correctAbilityObservation({ id: observation.id, action: "exclude" });
  const excluded = await prisma.abilityObservation.findUniqueOrThrow({
    where: { id: observation.id },
  });
  assert.equal(excluded.status, "excluded");

  await assert.rejects(
    service.correctAbilityObservation({
      id: observation.id,
      action: "reassign_dimension",
      dimension: "不存在的维度",
    }),
    /请选择有效的能力维度/,
  );
});

test("keeps a user correction after the interview is re-assessed", async () => {
  const interview = await seedCompletedInterview();
  await state.markCandidateProfileDirty({ debounceMs: 0 });
  await service.refreshCandidateProfile({ force: true });

  const observation = await prisma.abilityObservation.findFirstOrThrow();
  await service.correctAbilityObservation({
    id: observation.id,
    action: "reassign_dimension",
    dimension: "reasoning_depth",
  });

  await prisma.interviewQuestion.update({
    where: { id: interview.questions[0]!.id },
    data: { answer: "换一份回答，仍然包含具体机制说明与取舍。" },
  });
  await state.markCandidateProfileDirty({ debounceMs: 0 });
  await service.refreshCandidateProfile({ force: true });

  // 重新评估不能把用户的人工纠正冲掉。
  const reassessed = await prisma.abilityObservation.findFirstOrThrow({
    where: { interviewId: interview.id, status: "active" },
  });
  assert.equal(reassessed.dimension, "reasoning_depth");
});

test("merges one role view into another and removes the source", async () => {
  await seedCompletedInterview({ jobTitle: "后端工程师" });
  await seedCompletedInterview({ jobTitle: "前端工程师" });
  await state.markCandidateProfileDirty({ debounceMs: 0 });
  await service.refreshCandidateProfile({ force: true });

  const roles = await prisma.roleContext.findMany({ orderBy: { key: "asc" } });
  assert.equal(roles.length, 2);
  const [source, target] = roles;

  await service.mergeRoleContexts({ sourceKey: source!.key, targetKey: target!.key });

  assert.equal(await prisma.roleContext.count({ where: { key: source!.key } }), 0);
  assert.equal(await prisma.interview.count({ where: { roleKey: source!.key } }), 0);
  assert.equal(await prisma.abilityObservation.count({ where: { roleKey: source!.key } }), 0);
  assert.equal(await prisma.candidateProfileMetric.count({ where: { roleKey: source!.key } }), 0);
  assert.ok(await prisma.interview.count({ where: { roleKey: target!.key } }));

  await assert.rejects(
    service.mergeRoleContexts({ sourceKey: target!.key, targetKey: target!.key }),
    /请选择两个不同的岗位视角/,
  );
});
