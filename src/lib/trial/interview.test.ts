import assert from "node:assert/strict";
import test from "node:test";

import type { InterviewBrief } from "@/lib/mock-interviews/interviewer/brief";
import type { TurnPayload } from "@/lib/mock-interviews/interviewer/turn-payload";

import {
  applyTurnPayload,
  createTrialInterview,
  interviewerState,
  isTrialInterview,
  retryGeneration,
  segmentsToEvaluate,
  setSegmentEvaluation,
  withBlueprint,
  withBrief,
  withGenerationError,
} from "./interview";

/**
 * 体验版会话文档的状态迁移。这一层是纯函数，服务端无状态，所有推进逻辑都在这里；
 * 回合结果的形状与本地版落库的是同一个 TurnPayload。
 */

const brief: InterviewBrief = {
  version: 5,
  source: "model",
  pace: "quick",
  plannedTurns: 10,
  round: "first_interview",
  askIntro: true,
  skillPacks: ["backend"],
  areas: [
    {
      id: "a1",
      name: "缓存一致性",
      kind: "technical",
      style: "scenario",
      description: "缓存与数据库双写",
      projectId: null,
      competencyIds: ["c1"],
      jdEvidence: null,
      baseline: null,
      weight: 3,
      depth: 2,
      entryQuestion: "缓存和数据库双写时你怎么保证一致性？",
      ladder: [{ text: "先删缓存还是先写库？", style: "principle" }, { text: "失败怎么补偿？", style: "tradeoff" }],
      expectedSignals: ["延迟双删"],
      rubric: [{ name: "技术正确性", description: "", weight: 50 }, { name: "分析与取舍", description: "", weight: 30 }, { name: "表达结构", description: "", weight: 20 }],
    },
  ],
  droppedAreas: [],
  hypotheses: [],
};

const blueprint = { summary: "后端", completeness: "complete" as const, missingInformation: [], competencies: [] };

function seeded() {
  const created = createTrialInterview({
    job: { companyName: "示例公司", jobTitle: "后端工程师", jobDescription: "负责服务端开发。" },
    resume: { text: "三年后端开发经验。", projects: [] },
    round: "first_interview",
    pace: "quick",
  });
  return withBrief(withBlueprint(created, blueprint), brief, { established: [], doubtful: [], failed: [], hypotheses: [] });
}

test("备课两步各自落文档，失败后重试只重跑失败的那一步", () => {
  const created = createTrialInterview({
    job: { companyName: "示例公司", jobTitle: "后端工程师", jobDescription: "负责服务端开发。" },
    resume: { text: "简历", projects: [] },
    round: null,
    pace: "standard",
  });
  assert.equal(created.status, "generating");
  assert.equal(created.generationPhase, "job_blueprint");
  assert.equal(retryGeneration(withGenerationError(created, "网络断了")).generationPhase, "job_blueprint");

  const withPlan = withBlueprint(created, blueprint);
  assert.equal(withPlan.generationPhase, "brief");
  const failed = withGenerationError(withPlan, "超时");
  assert.equal(failed.status, "generation_failed");
  assert.equal(failed.generationError, "超时");
  // 蓝图已在文档里，重试直接备课。
  assert.equal(retryGeneration(failed).generationPhase, "brief");

  const ready = seeded();
  assert.equal(ready.status, "in_progress");
  assert.equal(interviewerState(ready).phase, "opening");
});

test("回合结果应用到文档：消息、线程、记忆、切段与决策记录，与本地版落库同语义", () => {
  const interview = seeded();
  const thread = { id: "t1", areaId: "a1", entryQuestion: brief.areas[0].entryQuestion, status: "closed" as const, depth: 1, hinted: false, openedAtTurn: 1, closedAtTurn: 3, note: "机制清楚" };
  const payload: TurnPayload = {
    newMessages: [
      { id: "m1", turnIndex: 3, role: "candidate", kind: "answer", content: "先写库再删缓存。", threadId: "t1", toolName: null },
      { id: "m2", turnIndex: 3, role: "interviewer", kind: "closing", content: "这一块够了。", threadId: "t1", toolName: "close_thread" },
    ],
    threads: [thread],
    memory: { established: [{ areaId: "a1", text: "知道延迟双删", turn: 3 }], doubtful: [], failed: [], hypotheses: [] },
    phase: "running",
    effects: [
      { type: "thread_closed", thread, segment: { question: "缓存和数据库双写时你怎么保证一致性？\n追问 1：先删缓存还是先写库？", answer: "我们用延迟双删。\n\n先写库再删缓存。", skipped: false, probeCount: 1, answerSeconds: 40 } },
    ],
    decision: { turnIndex: 3, runId: "trial-turn:3", proposedAction: "close_thread", appliedAction: "close_thread", followUp: null, replacedReason: null, anchorHit: null, memoryPatch: null, evidenceBefore: 0.4, evidenceAfter: 0.8, skillsLoaded: 0, effects: ["thread_closed"] },
  };

  const next = applyTurnPayload(interview, payload);
  assert.equal(next.messages.length, 2);
  assert.deepEqual(next.threads, [thread]);
  assert.equal(next.memory.established[0]?.text, "知道延迟双删");
  assert.equal(next.decisions.length, 1);
  assert.ok(next.startedAt);
  assert.equal(next.status, "in_progress");

  const [segment] = next.questions;
  assert.equal(segment.threadId, "t1");
  assert.equal(segment.category, "technical");
  assert.equal(segment.sourceKind, "technical");
  assert.deepEqual(segment.rubric.map((item) => item.name), ["技术正确性", "分析与取舍", "表达结构"]);
  assert.equal(segment.metadata.areaName, "缓存一致性");
  assert.equal(segment.metadata.competencyOrigin, "jd");
  assert.equal(segment.metadata.note, "机制清楚");
  assert.equal(segment.evaluationStatus, "pending");
  assert.deepEqual(segmentsToEvaluate(next).map((item) => item.id), [segment.id]);

  const evaluated = setSegmentEvaluation(next, segment.id, {
    evaluationStatus: "completed",
    evaluation: { score: 80, dimensions: [], strengths: [], weaknesses: [], advice: [], feedback: "好", exemplar: null },
  });
  assert.equal(segmentsToEvaluate(evaluated).length, 0);
  assert.equal(evaluated.questions[0].evaluation?.score, 80);

  const ended = applyTurnPayload(evaluated, { ...payload, newMessages: [], effects: [{ type: "interview_ended" }], decision: { ...payload.decision, turnIndex: 4 } });
  assert.equal(ended.status, "ready_to_evaluate");
  assert.equal(interviewerState(ended).phase, "ended");
});

test("版本不匹配的旧文档一律丢弃", () => {
  assert.equal(isTrialInterview({ version: 2, id: "x", questions: [], answers: [], evaluations: [] }), false);
  assert.equal(isTrialInterview(seeded()), true);
});
