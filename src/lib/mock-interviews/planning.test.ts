import assert from "node:assert/strict";
import test from "node:test";

import type { MockInterviewContext } from "./context";
import { getQuestionSourceAllocation, selectValidQuestions } from "./planning";
import type { RelevantPersonalizationContext } from "./relevance";
import type {
  MockInterviewJobBlueprint,
  MockInterviewQuestionDraft,
} from "./types";

const jd = "负责 Agent Harness 的规模化验证，并基于 Trace 提升长程执行稳定性。";
const blueprint: MockInterviewJobBlueprint = {
  summary: "Agent 基础设施",
  completeness: "complete",
  missingInformation: [],
  competencies: [
    {
      id: "harness",
      name: "Agent Harness",
      description: "规模化验证",
      priority: "core",
      jdEvidence: "Agent Harness 的规模化验证",
    },
    {
      id: "trace",
      name: "Trace",
      description: "长程执行稳定性",
      priority: "core",
      jdEvidence: "基于 Trace 提升长程执行稳定性",
    },
  ],
};
const context: MockInterviewContext = {
  jobDescription: jd,
  resume: { id: "resume", name: "resume.pdf", text: "Agent 项目" },
  projects: [
    { id: "project", name: "Agent 项目", type: "project", organization: "", description: "" },
  ],
  history: [],
  profile: { revision: 0, insights: [] },
};
const personalization: RelevantPersonalizationContext = {
  history: [],
  profileInsights: [],
};

function question(
  overrides: Partial<MockInterviewQuestionDraft> = {},
): MockInterviewQuestionDraft {
  return {
    question: "请设计 Agent Harness 的规模化验证方案。",
    category: "technical",
    difficulty: "standard",
    sourceKind: "job_description",
    jobCompetencyId: "harness",
    jdEvidence: "Agent Harness 的规模化验证",
    relevanceScore: 0.95,
    resumeProjectId: null,
    personalizationSourceId: null,
    rationale: "直接考察岗位职责",
    expectedSignals: ["验证分层"],
    ...overrides,
  };
}

test("allocates a majority of questions to direct JD coverage", () => {
  assert.deepEqual(getQuestionSourceAllocation(10), {
    directJobDescriptionMin: 5,
    resumeMax: 3,
    personalizationMax: 2,
    secondaryCompetencyMax: 1,
  });
  assert.deepEqual(getQuestionSourceAllocation(5), {
    directJobDescriptionMin: 3,
    resumeMax: 1,
    personalizationMax: 1,
    secondaryCompetencyMax: 1,
  });
});

test("rejects invalid JD evidence and duplicate questions", () => {
  const result = selectValidQuestions({
    candidates: [
      question(),
      question({ question: "请设计 Agent Harness 的规模化验证方案和流程。" }),
      question({
        question: "如何使用 Trace 分析长程执行失败？",
        jobCompetencyId: "trace",
        jdEvidence: "JD 中并不存在的文字",
      }),
    ],
    questionCount: 5,
    context,
    blueprint,
    personalization,
  });

  assert.equal(result.accepted.length, 1);
  assert.deepEqual(
    result.rejected.map((item) => item.reason),
    ["duplicate", "invalid_jd_evidence"],
  );
});

test("requires a valid resume project for resume-sourced questions", () => {
  const result = selectValidQuestions({
    candidates: [
      question({
        question: "结合你的项目说明如何实现 Agent 验证。",
        category: "resume_project",
        sourceKind: "resume",
        resumeProjectId: "missing",
      }),
      question({
        question: "结合 Agent 项目说明你如何设计规模化验证。",
        category: "resume_project",
        sourceKind: "resume",
        resumeProjectId: "project",
      }),
    ],
    questionCount: 5,
    context,
    blueprint,
    personalization,
  });

  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0]?.resumeProjectId, "project");
  assert.equal(result.rejected[0]?.reason, "invalid_resume_project");
});

test("rejects a broad model-training question with no mapped competency overlap", () => {
  const result = selectValidQuestions({
    candidates: [
      question({
        question: "请解释混合精度训练对模型显存和吞吐的影响。",
        jobCompetencyId: "harness",
        jdEvidence: "Agent Harness 的规模化验证",
      }),
    ],
    questionCount: 5,
    context,
    blueprint,
    personalization,
  });

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0]?.reason, "weak_job_relevance");
});
