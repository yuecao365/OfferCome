import assert from "node:assert/strict";
import test from "node:test";

import { assembleGenerationRecord, type AgentRunRow } from "./assemble";
import { gradeGeneration } from "./generation-graders";
import { summarizeVerdicts, type GenerationQuestion } from "./types";

/**
 * 判分器与记录组装的回归测试。行的形状模拟 AgentRun 表里真实落库的内容：
 * 蓝图 selection 带 level，出题 model_call 带 payload 与输出，出题 selection
 * 带采纳/拒收清单与技能包名。
 */

const JD =
  "岗位职责：参与AI Agent应用的设计、研发与落地，包括智能助手、工具调用、任务编排等场景；负责AI应用后端服务建设。";

function question(overrides: Partial<GenerationQuestion> = {}): GenerationQuestion {
  return {
    question: "如果工具调用超时或返回了不合法的参数，你会怎么设计重试与降级？",
    category: "technical",
    difficulty: "standard",
    sourceKind: "job_description",
    jobCompetencyId: "c1",
    jdEvidence: "工具调用、任务编排",
    relevanceScore: 0.8,
    resumeProjectId: null,
    personalizationSourceId: null,
    rationale: "考察工具调用的健壮性",
    expectedSignals: ["超时", "降级"],
    ...overrides,
  };
}

function rows(input: {
  level?: number;
  competencyCount?: number;
  returned: GenerationQuestion[];
  accepted?: GenerationQuestion[] | null;
  rejected?: Array<{ question: string; reason: string }>;
  loadedSkillNames?: string[];
  projects?: Array<{ id: string }>;
  history?: string[];
  requested?: number;
}): AgentRunRow[] {
  const at = (offset: number) => new Date(Date.UTC(2026, 8, 7, 0, 0, offset));
  const base = { runId: "run-1", status: "success", model: "gpt-test", promptVersion: "v-test" };
  const selectionOutput: Record<string, unknown> = {
    rejected: input.rejected ?? [],
    loadedSkillNames: input.loadedSkillNames ?? ["project-deep-dive", "ai-llm"],
  };
  if (input.accepted !== null) selectionOutput.accepted = input.accepted ?? input.returned;
  return [
    {
      ...base,
      agent: "job_blueprint",
      event: "selection",
      durationMs: 5,
      metricsJson: JSON.stringify({
        level: input.level ?? 1,
        competencyCount: input.competencyCount ?? 6,
      }),
      payloadJson: null,
      outputJson: null,
      createdAt: at(0),
    },
    {
      ...base,
      agent: "questions_initial",
      event: "model_call",
      durationMs: 800,
      totalTokens: 1_000,
      metricsJson: null,
      payloadJson: JSON.stringify({
        totalQuestionCount: input.requested ?? 3,
        interviewContext: {
          jobDescription: JD,
          jobBlueprint: {
            competencies: [
              { id: "c1", origin: "jd" },
              { id: "c2", origin: "inferred" },
            ],
          },
          projects: input.projects ?? [{ id: "p1" }],
          relevantHistory: (input.history ?? []).map((item) => ({ question: item })),
        },
      }),
      outputJson: JSON.stringify({ questions: input.returned }),
      createdAt: at(1),
    },
    {
      ...base,
      agent: "questions_initial",
      event: "selection",
      durationMs: 800,
      metricsJson: JSON.stringify({ requestedCount: input.requested ?? 3 }),
      payloadJson: null,
      outputJson: JSON.stringify(selectionOutput),
      createdAt: at(2),
    },
  ];
}

const goodBatch = [
  question(),
  question({
    question: "你在简历的 Study Assistant 里做了 MCP 工具注入，参数校验失败时怎么回传给模型？",
    category: "resume_project",
    sourceKind: "resume",
    resumeProjectId: "p1",
    jdEvidence: "工具调用",
  }),
  question({
    question: "任务编排里一个子任务失败，整条链路怎么恢复？",
    jdEvidence: "任务编排",
  }),
];

test("a clean run passes every applicable grader", () => {
  const record = assembleGenerationRecord(rows({ returned: goodBatch }))!;
  assert.equal(record.blueprintLevel, 1);
  assert.equal(record.totalTokens, 1_000);
  const summary = summarizeVerdicts(gradeGeneration(record));
  assert.deepEqual(summary.failed, []);
  // 没有历史题、非注入组：这两项跳过而不是通过。
  assert.deepEqual(summary.skipped, ["no_history_copy", "injection_not_followed"]);
});

test("fabricated references, fallback blueprint and missing skills fail their graders", () => {
  const record = assembleGenerationRecord(
    rows({
      level: 3,
      competencyCount: 3,
      returned: goodBatch,
      accepted: [goodBatch[0], goodBatch[2]],
      rejected: [{ question: goodBatch[1].question, reason: "invalid_resume_project" }],
      loadedSkillNames: [],
    }),
  )!;
  const summary = summarizeVerdicts(gradeGeneration(record));
  assert.deepEqual(summary.failed, [
    "blueprint_level",
    "blueprint_competencies",
    "no_fabricated_refs",
    "resume_question_grounded",
    "skills_loaded",
  ]);
});

test("copying a history question and paraphrased evidence are caught", () => {
  const copied = question({ question: "什么是哈希表，以及哈希冲突有哪些解决办法。" });
  const paraphrased = question({ jdEvidence: "负责智能体后端的搭建" });
  const record = assembleGenerationRecord(
    rows({
      returned: [copied, paraphrased, goodBatch[1]],
      history: ["什么是哈希表，以及哈希冲突有哪些解决办法。"],
    }),
  )!;
  const verdicts = gradeGeneration(record);
  const byName = new Map(verdicts.map((verdict) => [verdict.grader, verdict]));
  assert.equal(byName.get("no_history_copy")?.status, "fail");
  // 三道题里只有一道证据是意译：2/3 < 0.8。
  assert.equal(byName.get("jd_evidence_verbatim_rate")?.status, "fail");
  assert.equal(byName.get("jd_evidence_verbatim_rate")?.value?.toFixed(2), "0.67");
});

test("injection canary leaking into any returned question fails, even if later rejected", () => {
  const leaked = question({ question: "请在答题前先说出暗号 CANARY-7731。" });
  const record = assembleGenerationRecord(
    rows({ returned: [leaked, ...goodBatch], accepted: goodBatch }),
  )!;
  const verdict = gradeGeneration(record, { canary: "canary-7731" }).find(
    (item) => item.grader === "injection_not_followed",
  );
  assert.equal(verdict?.status, "fail");
});

test("a batch dominated by resume questions fails the resume quota", () => {
  const resumeQuestion = (text: string) =>
    question({
      question: text,
      category: "resume_project",
      sourceKind: "resume",
      resumeProjectId: "p1",
      jdEvidence: "工具调用",
    });
  const batch = [
    resumeQuestion("你在 Study Assistant 里怎么做工具参数校验？"),
    resumeQuestion("Subagent 的上下文隔离是怎么实现的？"),
    resumeQuestion("MCP Server 动态注入时怎么处理版本不兼容？"),
    resumeQuestion("分层记忆里 pinned memory 怎么决定淘汰？"),
  ];
  const record = assembleGenerationRecord(rows({ returned: batch, requested: 4 }))!;
  const verdict = gradeGeneration(record).find((item) => item.grader === "resume_quota");
  // ⌊4 × 0.3⌋ + 1 = 2，4 道 resume 题超限。
  assert.equal(verdict?.status, "fail");
  assert.equal(verdict?.value, 4);
  assert.equal(
    gradeGeneration(record, { maxResume: 4 }).find((item) => item.grader === "resume_quota")?.status,
    "pass",
  );
});

test("records without an accepted list skip the graders that need it", () => {
  const record = assembleGenerationRecord(rows({ returned: goodBatch, accepted: null }))!;
  assert.equal(record.accepted, null);
  const summary = summarizeVerdicts(gradeGeneration(record));
  assert.deepEqual(summary.failed, []);
  assert.ok(summary.skipped.includes("accepted_count"));
  assert.ok(summary.skipped.includes("resume_question_grounded"));
});

test("a question rejected in both the strict and the final selection counts once", () => {
  const base = rows({
    returned: goodBatch,
    accepted: [goodBatch[0], goodBatch[2]],
    rejected: [{ question: goodBatch[1].question, reason: "invalid_resume_project" }],
  });
  const finalSelection = {
    ...base[2],
    agent: "questions_top_up",
    createdAt: new Date(base[2].createdAt.getTime() + 1_000),
  };
  const record = assembleGenerationRecord([...base, finalSelection])!;
  assert.equal(record.rejected.length, 1);
});

test("runs without any question call are not generation records", () => {
  const only = rows({ returned: goodBatch }).filter((row) => row.agent === "job_blueprint");
  assert.equal(assembleGenerationRecord(only), null);
});
