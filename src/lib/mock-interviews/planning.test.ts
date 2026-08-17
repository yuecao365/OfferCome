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
      origin: "jd",
      sourceUrl: null,
    },
    {
      id: "trace",
      name: "Trace",
      description: "长程执行稳定性",
      priority: "core",
      jdEvidence: "基于 Trace 提升长程执行稳定性",
      origin: "jd",
      sourceUrl: null,
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
    generalRoleMax: 0,
  });
  assert.deepEqual(getQuestionSourceAllocation(5), {
    directJobDescriptionMin: 3,
    resumeMax: 1,
    personalizationMax: 1,
    secondaryCompetencyMax: 1,
    generalRoleMax: 0,
  });
});

test("reserves a personalization slot for short seeded interviews", () => {
  assert.deepEqual(getQuestionSourceAllocation(3), {
    directJobDescriptionMin: 2,
    resumeMax: 1,
    personalizationMax: 0,
    secondaryCompetencyMax: 1,
    generalRoleMax: 0,
  });
  assert.deepEqual(getQuestionSourceAllocation(3, true), {
    directJobDescriptionMin: 1,
    resumeMax: 1,
    personalizationMax: 1,
    secondaryCompetencyMax: 1,
    generalRoleMax: 0,
  });
});

test("allocates general role questions only when inferred competencies exist", () => {
  const enriched = {
    ...blueprint,
    competencies: [
      ...blueprint.competencies,
      {
        id: "inferred",
        name: "通用协作",
        description: "跨团队协作",
        priority: "secondary" as const,
        jdEvidence: "该岗位的通用要求，非用户提供",
        origin: "inferred" as const,
        sourceUrl: null,
      },
    ],
  };
  assert.equal(getQuestionSourceAllocation(8, false, enriched).generalRoleMax, 4);
});

test("accepts inferred competencies only as general role questions", () => {
  const inferred = {
    id: "inferred",
    name: "Agent 可靠性",
    description: "保障 Agent 可靠运行",
    priority: "core" as const,
    jdEvidence: "该岗位的通用要求，非用户提供",
    origin: "inferred" as const,
    sourceUrl: null,
  };
  const enriched = { ...blueprint, competencies: [blueprint.competencies[0]!, inferred] };
  const result = selectValidQuestions({
    candidates: [
      question({
        question: "如何保障 Agent 系统的可靠运行？",
        sourceKind: "general_role",
        jobCompetencyId: "inferred",
        jdEvidence: inferred.jdEvidence,
      }),
    ],
    questionCount: 5,
    context,
    blueprint: enriched,
    personalization,
  });
  assert.equal(result.accepted.length, 1);
});

test("keeps paraphrased-evidence questions instead of dropping them", () => {
  const result = selectValidQuestions({
    candidates: [
      question(),
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

  // 意译证据降权但保留；没有任何硬拒。
  assert.equal(result.accepted.length, 2);
  assert.deepEqual(result.rejected, []);
});

test("defers near-duplicates and only uses them as fillers when short", () => {
  const nearDuplicate = "请设计 Agent Harness 的规模化验证方案和流程。";
  const scarce = selectValidQuestions({
    candidates: [question(), question({ question: nearDuplicate })],
    questionCount: 5,
    context,
    blueprint,
    personalization,
  });
  // 缺题时允许一道相近的题回填（仍挡掉几乎逐字重复）。
  assert.equal(scarce.accepted.length >= 1, true);

  const abundant = selectValidQuestions({
    candidates: [
      question(),
      question({ question: nearDuplicate }),
      question({
        question: "如何使用 Trace 分析长程执行失败？",
        jobCompetencyId: "trace",
        jdEvidence: "基于 Trace 提升长程执行稳定性",
      }),
    ],
    questionCount: 2,
    context,
    blueprint,
    personalization,
  });
  // 够题时优先选互不重复的两道，而不是把相近题排进来。
  assert.equal(abundant.accepted.length, 2);
  assert.notEqual(abundant.accepted[1]?.question, nearDuplicate);
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

test("ranks weakly related questions below on-target ones", () => {
  const offTarget = "请解释混合精度训练对模型显存和吞吐的影响。";
  const result = selectValidQuestions({
    candidates: [
      question({
        question: offTarget,
        jobCompetencyId: "harness",
        jdEvidence: "Agent Harness 的规模化验证",
      }),
      question(),
    ],
    questionCount: 1,
    context,
    blueprint,
    personalization,
  });

  // 相关性弱不再硬拒，但在名额有限时必须输给贴合岗位的题。
  assert.equal(result.accepted.length, 1);
  assert.notEqual(result.accepted[0]?.question, offTarget);

  const lastResort = selectValidQuestions({
    candidates: [
      question({
        question: offTarget,
        jobCompetencyId: "harness",
        jdEvidence: "Agent Harness 的规模化验证",
      }),
    ],
    questionCount: 3,
    context,
    blueprint,
    personalization,
  });
  // 只有它可用时宁可收下，也不空手。
  assert.equal(lastResort.accepted.length, 1);
});
