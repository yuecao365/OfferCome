import assert from "node:assert/strict";
import test from "node:test";

import type { MockInterviewContext } from "./context";
import { selectRelevantPersonalization } from "./relevance";
import type { MockInterviewJobBlueprint } from "./types";

const jobDescription = `团队结合大模型、Agent 与端侧能力建设客户端基础设施。
1、面向客户端研发场景，搭建稳定、高效 Agent Harness（移动运行时知识库、Skills&CLI、规模化验证），基于 Trace 优化长程执行。
2、整合 Issue Diagnosis、Coding、回顾、Validation，提升系统稳定性、可控性和执行效率。`;

const blueprint: MockInterviewJobBlueprint = {
  summary: "建设客户端 Agent 基础设施",
  completeness: "partial",
  missingInformation: ["缺少完整任职要求"],
  competencies: [
    {
      id: "agent_harness",
      name: "Agent Harness 设计",
      description: "搭建移动端 Agent 运行、工具和验证基础设施",
      priority: "core",
      jdEvidence: "搭建稳定、高效 Agent Harness",
    },
    {
      id: "trace_reliability",
      name: "Trace 与可靠性",
      description: "使用 Trace 优化长程执行和定位稳定性问题",
      priority: "core",
      jdEvidence: "基于 Trace 优化长程执行",
    },
  ],
};

function contextWithHistory(
  questions: { id: string; question: string; jobTitle?: string }[],
): MockInterviewContext {
  return {
    jobDescription,
    resume: { id: "resume", name: "resume.pdf", text: "Agent 项目" },
    projects: [],
    history: questions.map((item) => ({
      interviewId: `interview-${item.id}`,
      companyName: "历史公司",
      jobTitle: item.jobTitle ?? "Agent 开发工程师",
      questionId: item.id,
      question: item.question,
      answer: "示例回答",
      category: "technical",
    })),
    profile: { revision: 1, insights: [] },
  };
}

test("keeps JD-related history but filters adjacent model theory", () => {
  const context = contextWithHistory([
    {
      id: "harness",
      question: "如何设计 Agent Harness 的 Skills CLI 与规模化验证机制？",
    },
    {
      id: "mixed-precision",
      question: "混合精度训练对模型显存和性能有什么影响？",
    },
    {
      id: "transformer",
      question: "Transformer 自注意力为何优于传统 RNN？",
    },
  ]);

  const selected = selectRelevantPersonalization({
    context,
    blueprint,
    jobTitle: "AI Agent 开发实习生-App Infra",
  });

  assert.deepEqual(
    selected.history.map((item) => item.questionId),
    ["harness"],
  );
  assert.equal(selected.history[0]?.jobCompetencyId, "agent_harness");
});

test("force-injects a seeded history item and maps zero relevance to a core competency", () => {
  const context = contextWithHistory([
    {
      id: "seed",
      question: "请介绍一次完全不同领域的沟通经历。",
      jobTitle: "销售",
    },
  ]);

  const selected = selectRelevantPersonalization({
    context,
    blueprint,
    jobTitle: "AI Agent 开发实习生",
    seedQuestionId: "seed",
  });

  assert.equal(selected.history[0]?.questionId, "seed");
  assert.equal(selected.history[0]?.jobCompetencyId, "agent_harness");
  assert.equal(selected.history[0]?.jobRelevance, 0);
});

test("force-injects a seeded profile insight below the normal relevance threshold", () => {
  const context = contextWithHistory([]);
  context.profile.insights.push({
    id: "insight-seed",
    dimension: "communication_clarity",
    kind: "training_focus",
    title: "表达精炼",
    statement: "回答时先给结论。",
    confidence: 0.8,
  });

  const selected = selectRelevantPersonalization({
    context,
    blueprint,
    jobTitle: "AI Agent 开发实习生",
    seedInsightId: "insight-seed",
  });

  assert.equal(selected.profileInsights[0]?.id, "insight-seed");
  assert.equal(selected.profileInsights[0]?.jobCompetencyId, "agent_harness");
});
