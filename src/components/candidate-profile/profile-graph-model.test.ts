import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvidenceBridges,
  buildEvidenceClusters,
  buildInsightRelations,
  buildOrganicLayout,
  compareGraphNodePriority,
  type OrganicLayoutLink,
  type OrganicLayoutNode,
  type ProfileGraphEvidence,
  type ProfileGraphInsight,
} from "./profile-graph-model";

test("label priority sorting tolerates transient missing G6 nodes", () => {
  assert.equal(compareGraphNodePriority(undefined, undefined), 0);
  assert.equal(
    compareGraphNodePriority(
      { data: { nodeKind: "dimension" } },
      { data: { nodeKind: "insight" } },
    ),
    1,
  );
});

function evidence(overrides: Partial<ProfileGraphEvidence> = {}): ProfileGraphEvidence {
  return {
    id: "evidence-1",
    interviewId: "interview-1",
    questionId: "question-1",
    observationId: "observation-1",
    observationStatus: "active",
    polarity: "supports",
    excerpt: "我比较了两种方案并说明了取舍。",
    sourceKind: "real_transcript",
    companyName: "示例公司",
    jobTitle: "开发工程师",
    question: "你如何选择方案？",
    answer: "我比较了两种方案并说明了取舍。",
    interviewAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function insight(overrides: Partial<ProfileGraphInsight> = {}): ProfileGraphInsight {
  return {
    id: "insight-1",
    roleKey: "all",
    dimension: "reasoning_depth",
    kind: "strength",
    title: "能够解释方案取舍",
    statement: "回答包含替代方案与选择依据。",
    confidence: 0.8,
    level: 4,
    levelLabel: "突出",
    trend: "stable",
    confidenceLabel: "较高",
    status: "active",
    isUserLocked: false,
    hasConflict: false,
    evidence: [evidence()],
    ...overrides,
  };
}

test("turns shared observations into cross-dimension relations and bridge nodes", () => {
  const insights = [
    insight(),
    insight({
      id: "insight-2",
      dimension: "problem_solving",
      title: "方案拆解完整",
      evidence: [evidence({ id: "evidence-2" })],
    }),
  ];
  const relations = buildInsightRelations(insights);
  assert.equal(relations.length, 1);
  assert.ok(relations[0].reasons.includes("shared_observation"));
  assert.ok(relations[0].strength >= 5);
  const bridges = buildEvidenceBridges(insights);
  assert.equal(bridges.length, 1);
  assert.deepEqual(bridges[0].insightIds, ["insight-1", "insight-2"]);
});

test("gives real interview relations more visual strength than AI simulation", () => {
  const realRelation = buildInsightRelations([
    insight(),
    insight({ id: "real-2", dimension: "problem_solving" }),
  ])[0];
  const mockEvidence = evidence({ sourceKind: "mock_text" });
  const mockRelation = buildInsightRelations([
    insight({ id: "mock-1", evidence: [mockEvidence] }),
    insight({
      id: "mock-2",
      dimension: "problem_solving",
      evidence: [mockEvidence],
    }),
  ])[0];

  assert.ok(realRelation.strength > mockRelation.strength);
});

test("keeps unique evidence as quiet graph nodes instead of dropping it", () => {
  const clusters = buildEvidenceClusters([
    insight(),
    insight({
      id: "insight-2",
      evidence: [evidence({ id: "evidence-2", observationId: "observation-2" })],
    }),
  ]);
  assert.equal(clusters.length, 2);
  assert.equal(clusters.every((cluster) => !cluster.shared), true);
});

test("organic layout is deterministic and keeps related nodes near their anchors", () => {
  const nodes: OrganicLayoutNode[] = [
    { id: "profile:root", kind: "root" },
    { id: "dimension:reasoning_depth", kind: "dimension", dimension: "reasoning_depth" },
    { id: "insight-1", kind: "insight", dimension: "reasoning_depth" },
    { id: "insight-2", kind: "insight", dimension: "reasoning_depth" },
  ];
  const links: OrganicLayoutLink[] = [
    { source: "dimension:reasoning_depth", target: "insight-1", strength: 2.4, length: 112 },
    { source: "dimension:reasoning_depth", target: "insight-2", strength: 2.4, length: 112 },
    { source: "insight-1", target: "insight-2", strength: 1, length: 150 },
  ];
  const first = buildOrganicLayout(nodes, links);
  const second = buildOrganicLayout(nodes, links);
  assert.deepEqual([...first.entries()], [...second.entries()]);
  const anchor = first.get("dimension:reasoning_depth")!;
  for (const id of ["insight-1", "insight-2"]) {
    const point = first.get(id)!;
    assert.ok(Math.hypot(point.x - anchor.x, point.y - anchor.y) < 230);
  }
});
