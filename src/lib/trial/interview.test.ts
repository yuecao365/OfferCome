import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import {
  applyTurnPayload,
  completeTrialInterview,
  createTrialInterview,
  isTrialInterview,
  retryGeneration,
  segmentsToEvaluate,
  setSegmentEvaluation,
  TRIAL_INTERVIEW_VERSION,
  withBlueprint,
  withBrief,
  withGenerationError,
  type TrialSegment,
} from "./interview";

/** 体验版会话文档的状态迁移：与本地版落库同语义的纯函数。 */

const blueprint = { summary: "岗位摘要", completeness: "complete" as const, missingInformation: [], business: null, competencies: [] };

function fresh() {
  return createTrialInterview({
    job: { companyName: "示例公司", jobTitle: "后端工程师", jobDescription: "负责服务端开发。" },
    resume: { text: "简历正文", projects: [] },
    pace: "standard",
  });
}

test("备课两步各自落文档，失败后重试只重跑失败的那一步", () => {
  const created = fresh();
  assert.equal(created.status, "generating");
  assert.equal(created.generationPhase, "job_blueprint");
  const withPlan = withBlueprint(created, blueprint);
  assert.equal(withPlan.generationPhase, "brief");
  const failed = withGenerationError(withPlan, "模型超时");
  assert.equal(failed.status, "generation_failed");
  const retried = retryGeneration(failed);
  assert.equal(retried.generationPhase, "brief", "蓝图已有，重试直接备课");
  const ready = withBrief(retried, testBrief());
  assert.equal(ready.status, "in_progress");
  assert.deepEqual(ready.ledger, []);
});

test("回合结果应用到文档：消息追加、证据账累计、结束进入待评分", () => {
  const interview = withBrief(withBlueprint(fresh(), blueprint), testBrief());
  const progress = { covered: 0, quota: 6 };
  const opened = applyTurnPayload(interview, {
    newMessages: [{ id: "m0", turnIndex: 0, role: "interviewer", kind: "say", content: "你好，先介绍一下自己。" }],
    phase: "running",
    progress,
    endedBy: null,
    coveredCount: 0,
    ledger: null,
  });
  assert.ok(opened.startedAt);
  assert.equal(opened.messages.length, 1);
  assert.deepEqual(opened.ledger, []);
  const ended = applyTurnPayload(opened, {
    newMessages: [
      { id: "c1", turnIndex: 1, role: "candidate", kind: "control", content: "我们结束吧。" },
      { id: "m1", turnIndex: 1, role: "interviewer", kind: "closing", content: "好的，今天就到这里。" },
    ],
    phase: "ended",
    progress,
    endedBy: "candidate",
    coveredCount: 0,
    ledger: { materialId: "p1-overview", text: "说到主循环是自己写的" },
  });
  assert.equal(ended.status, "ready_to_evaluate");
  assert.deepEqual(ended.ledger, [{ materialId: "p1-overview", text: "说到主循环是自己写的" }]);
  assert.equal(ended.messages.length, 3);
});

test("切段的评分状态迁移与交卷", () => {
  const segment: TrialSegment = {
    id: "s1",
    question: "问题",
    answer: "回答",
    category: "resume_project",
    sourceKind: "project",
    skipped: false,
    rubric: [],
    expectedSignals: [],
    metadata: {},
    evaluationStatus: "pending",
    evaluation: null,
  };
  const interview = { ...withBrief(fresh(), testBrief()), questions: [segment] };
  assert.equal(segmentsToEvaluate(interview).length, 1);
  const running = setSegmentEvaluation(interview, "s1", { evaluationStatus: "running" });
  assert.equal(segmentsToEvaluate(running).length, 0);
  const done = completeTrialInterview(running, { version: 3, totalScore: 80, summary: "总结", strengths: [], weaknesses: [], hypotheses: [] });
  assert.equal(done.status, "completed");
  assert.ok(done.completedAt);
});

test("版本不匹配的旧文档一律丢弃", () => {
  const current = fresh();
  assert.equal(isTrialInterview(current), true);
  assert.equal(isTrialInterview({ ...current, version: TRIAL_INTERVIEW_VERSION - 1 }), false);
  assert.equal(isTrialInterview({ ...current, messages: undefined }), false);
});
