import {
  PROFILE_DIMENSIONS,
  type ProfileDimension,
  type ProfileInsightKind,
  type ProfileSourceType,
} from "@/lib/candidate-profile/types";

export type ProfileGraphEvidence = {
  id: string;
  interviewId: string;
  questionId: string | null;
  observationId: string | null;
  observationStatus: string;
  polarity: string;
  excerpt: string;
  sourceKind: ProfileSourceType;
  companyName: string;
  jobTitle: string;
  question: string;
  answer: string;
  interviewAt: string | null;
};

export type ProfileGraphInsight = {
  id: string;
  roleKey: string;
  dimension: ProfileDimension;
  kind: ProfileInsightKind;
  title: string;
  statement: string;
  confidence: number;
  level: number | null;
  levelLabel: string;
  trend: string;
  confidenceLabel: string;
  status: string;
  isUserLocked: boolean;
  hasConflict: boolean;
  evidence: ProfileGraphEvidence[];
};

export type InsightRelation = {
  id: string;
  source: string;
  target: string;
  strength: number;
  reasons: Array<"shared_observation" | "shared_question" | "shared_interview" | "same_dimension">;
};

export type EvidenceBridge = {
  id: string;
  key: string;
  evidence: ProfileGraphEvidence;
  insightIds: string[];
};

export type EvidenceCluster = EvidenceBridge & { shared: boolean };

export type OrganicLayoutNode = {
  id: string;
  kind: "root" | "dimension" | "insight" | "bridge";
  dimension?: ProfileDimension;
  insightIds?: string[];
};

export type OrganicLayoutLink = {
  source: string;
  target: string;
  strength: number;
  length: number;
};

export type GraphPosition = { x: number; y: number };
export type GraphNodePriorityInput = {
  data?: { nodeKind?: unknown } | null;
} | null;

export function compareGraphNodePriority(
  left?: GraphNodePriorityInput,
  right?: GraphNodePriorityInput,
): -1 | 0 | 1 {
  const priority = (nodeKind: unknown) =>
    nodeKind === "insight"
      ? 4
      : nodeKind === "dimension"
        ? 3
        : nodeKind === "root"
          ? 2
          : 1;
  const difference =
    priority(right?.data?.nodeKind) - priority(left?.data?.nodeKind);
  return difference < 0 ? -1 : difference > 0 ? 1 : 0;
}

const CANVAS_WIDTH = 1_000;
const CANVAS_HEIGHT = 700;
const DIMENSION_ANCHORS: Record<ProfileDimension, GraphPosition> = {
  answer_relevance: { x: 175, y: 130 },
  knowledge_accuracy: { x: 445, y: 90 },
  reasoning_depth: { x: 770, y: 145 },
  problem_solving: { x: 870, y: 350 },
  experience_evidence: { x: 720, y: 585 },
  communication_clarity: { x: 405, y: 620 },
  delivery_fluency: { x: 125, y: 465 },
  reflection_growth: { x: 245, y: 315 },
};

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function evidenceQuestionKey(evidence: ProfileGraphEvidence): string | null {
  return evidence.questionId
    ? `${evidence.interviewId}:${evidence.questionId}`
    : null;
}

function profileEvidenceKey(evidence: ProfileGraphEvidence): string {
  return evidence.observationId
    ? `observation:${evidence.observationId}`
    : evidenceQuestionKey(evidence) ?? `evidence:${evidence.id}`;
}

function sourceRelationWeight(evidence: ProfileGraphEvidence): number {
  return evidence.sourceKind === "mock_text" ? 0.5 : 1;
}

function evidenceWeights(
  evidence: ProfileGraphEvidence[],
  keyForEvidence: (item: ProfileGraphEvidence) => string | null,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of evidence) {
    const key = keyForEvidence(item);
    if (!key) continue;
    result.set(key, Math.max(result.get(key) ?? 0, sourceRelationWeight(item)));
  }
  return result;
}

function weightedIntersection(left: Map<string, number>, right: Map<string, number>): number {
  let weight = 0;
  for (const [key, leftWeight] of left) {
    const rightWeight = right.get(key);
    if (rightWeight !== undefined) weight += Math.min(leftWeight, rightWeight);
  }
  return weight;
}

export function buildInsightRelations(insights: ProfileGraphInsight[]): InsightRelation[] {
  const candidates: InsightRelation[] = [];
  for (let leftIndex = 0; leftIndex < insights.length; leftIndex += 1) {
    const left = insights[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < insights.length; rightIndex += 1) {
      const right = insights[rightIndex];
      const leftObservations = evidenceWeights(left.evidence, (item) => item.observationId);
      const rightObservations = evidenceWeights(right.evidence, (item) => item.observationId);
      const leftQuestions = evidenceWeights(left.evidence, evidenceQuestionKey);
      const rightQuestions = evidenceWeights(right.evidence, evidenceQuestionKey);
      const leftInterviews = evidenceWeights(left.evidence, (item) => item.interviewId);
      const rightInterviews = evidenceWeights(right.evidence, (item) => item.interviewId);
      const sharedObservations = weightedIntersection(leftObservations, rightObservations);
      const sharedQuestions = weightedIntersection(leftQuestions, rightQuestions);
      const sharedInterviews = weightedIntersection(leftInterviews, rightInterviews);
      const sameDimension = left.dimension === right.dimension;
      const reasons: InsightRelation["reasons"] = [];
      if (sharedObservations > 0) reasons.push("shared_observation");
      if (sharedQuestions > 0) reasons.push("shared_question");
      if (sharedInterviews > 0) reasons.push("shared_interview");
      if (sameDimension) reasons.push("same_dimension");
      const strength =
        sharedObservations * 5 +
        sharedQuestions * 3 +
        Math.min(2, sharedInterviews) * 0.8 +
        (sameDimension ? 0.45 : 0);
      if (strength < 0.45) continue;
      candidates.push({
        id: `relation:${[left.id, right.id].sort().join(":")}`,
        source: left.id,
        target: right.id,
        strength,
        reasons,
      });
    }
  }

  const degree = new Map<string, number>();
  return candidates
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
    .filter((relation) => {
      const sourceDegree = degree.get(relation.source) ?? 0;
      const targetDegree = degree.get(relation.target) ?? 0;
      const strong = relation.strength >= 3;
      if (!strong && (sourceDegree >= 2 || targetDegree >= 2)) return false;
      if (sourceDegree >= 4 || targetDegree >= 4) return false;
      degree.set(relation.source, sourceDegree + 1);
      degree.set(relation.target, targetDegree + 1);
      return true;
    })
    .slice(0, 36);
}

export function buildEvidenceBridges(insights: ProfileGraphInsight[]): EvidenceBridge[] {
  return buildEvidenceClusters(insights).filter((cluster) => cluster.shared);
}

export function buildEvidenceClusters(insights: ProfileGraphInsight[]): EvidenceCluster[] {
  const groups = new Map<string, { evidence: ProfileGraphEvidence; insightIds: Set<string> }>();
  for (const insight of insights) {
    for (const evidence of insight.evidence) {
      const key = profileEvidenceKey(evidence);
      const group = groups.get(key) ?? { evidence, insightIds: new Set<string>() };
      group.insightIds.add(insight.id);
      groups.set(key, group);
    }
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      id: `evidence:${stableHash(key).toString(36)}`,
      key,
      evidence: group.evidence,
      insightIds: [...group.insightIds].sort(),
      shared: group.insightIds.size > 1,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function buildOrganicLayout(
  nodes: OrganicLayoutNode[],
  links: OrganicLayoutLink[],
): Map<string, GraphPosition> {
  const positions = new Map<string, GraphPosition>();
  const fixed = new Set<string>();
  positions.set("profile:root", { x: 515, y: 345 });
  fixed.add("profile:root");
  for (const dimension of PROFILE_DIMENSIONS) {
    const id = `dimension:${dimension}`;
    positions.set(id, { ...DIMENSION_ANCHORS[dimension] });
    fixed.add(id);
  }
  for (const node of nodes.filter((item) => item.kind === "insight")) {
    const anchor = DIMENSION_ANCHORS[node.dimension!];
    const angle = ((stableHash(node.id) % 10_000) / 10_000) * Math.PI * 2;
    const radius = 72 + (stableHash(`${node.id}:radius`) % 86);
    positions.set(node.id, {
      x: anchor.x + Math.cos(angle) * radius,
      y: anchor.y + Math.sin(angle) * radius,
    });
  }
  for (const node of nodes.filter((item) => item.kind === "bridge")) {
    const linked = (node.insightIds ?? []).flatMap((id) => positions.get(id) ? [positions.get(id)!] : []);
    const average = linked.length
      ? {
          x: linked.reduce((sum, point) => sum + point.x, 0) / linked.length,
          y: linked.reduce((sum, point) => sum + point.y, 0) / linked.length,
        }
      : { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
    const jitter = ((stableHash(node.id) % 41) - 20) * 0.7;
    positions.set(node.id, { x: average.x + jitter, y: average.y - jitter });
  }

  const movable = nodes.filter((node) => !fixed.has(node.id));
  for (let iteration = 0; iteration < 130; iteration += 1) {
    const forces = new Map(movable.map((node) => [node.id, { x: 0, y: 0 }]));
    for (let leftIndex = 0; leftIndex < movable.length; leftIndex += 1) {
      const left = movable[leftIndex];
      const leftPosition = positions.get(left.id)!;
      for (let rightIndex = leftIndex + 1; rightIndex < movable.length; rightIndex += 1) {
        const right = movable[rightIndex];
        const rightPosition = positions.get(right.id)!;
        const dx = leftPosition.x - rightPosition.x;
        const dy = leftPosition.y - rightPosition.y;
        const distanceSquared = Math.max(36, dx * dx + dy * dy);
        const distance = Math.sqrt(distanceSquared);
        const desired = left.kind === "bridge" || right.kind === "bridge" ? 54 : 112;
        if (distance >= desired * 2.1) continue;
        const force = (desired * desired) / distanceSquared * 2.2;
        forces.get(left.id)!.x += (dx / distance) * force;
        forces.get(left.id)!.y += (dy / distance) * force;
        forces.get(right.id)!.x -= (dx / distance) * force;
        forces.get(right.id)!.y -= (dy / distance) * force;
      }
    }
    for (const link of links) {
      const source = positions.get(link.source);
      const target = positions.get(link.target);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const spring = (distance - link.length) * 0.006 * Math.min(4, link.strength);
      if (!fixed.has(link.source) && forces.has(link.source)) {
        forces.get(link.source)!.x += (dx / distance) * spring;
        forces.get(link.source)!.y += (dy / distance) * spring;
      }
      if (!fixed.has(link.target) && forces.has(link.target)) {
        forces.get(link.target)!.x -= (dx / distance) * spring;
        forces.get(link.target)!.y -= (dy / distance) * spring;
      }
    }
    const step = 0.8 - iteration * 0.0045;
    for (const node of movable) {
      const position = positions.get(node.id)!;
      const force = forces.get(node.id)!;
      position.x = Math.min(950, Math.max(50, position.x + force.x * step));
      position.y = Math.min(655, Math.max(45, position.y + force.y * step));
    }
  }
  return positions;
}
