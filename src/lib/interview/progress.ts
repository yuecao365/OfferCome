import type { AreaKind, InterviewArea, InterviewBrief, InterviewPace } from "@/lib/mock-interviews/brief/brief";

import type { TranscriptLine } from "./events";

/**
 * 覆盖配额（设计修订 v3 §10）：一场的长短由信息量决定，不由分钟数决定。
 * 节奏定这场聊几份材料（配额），每份材料最多问几句（预算）；一份材料"够了"就换下一份，配额里的材料都聊完就结束。
 * 没有时钟：用户中途离开、写得长、说得慢都不影响。这里全是纯函数，从逐字稿现算，可重放。
 */

/** 配额：每档聊几份材料。 */
export const QUOTA: Record<InterviewPace, Record<AreaKind, number>> = {
  quick: { project: 1, quick: 2, scenario: 1 },
  standard: { project: 2, quick: 3, scenario: 1 },
  deep: { project: 3, quick: 4, scenario: 2 },
};
/** 预算：每份材料最多问几句（切入 + 追问）。 */
export const BUDGET: Record<AreaKind, number> = { project: 4, quick: 2, scenario: 3 };
/** 项目不够配额时，缺的项目的预算分给现有项目，每个项目最多这么多句。 */
export const MAX_PROJECT_BUDGET = 6;
/** 同一个角度最多连追几句。 */
export const FACET_RUN_MAX = 2;
/** 材料的顺序：真实一面的顺序。 */
const KIND_ORDER: AreaKind[] = ["project", "quick", "scenario"];

export type PlannedMaterial = { id: string; kind: AreaKind; budget: number };
export type Plan = PlannedMaterial[];

/**
 * 这场要聊的材料（按顺序）与各自预算。项目不够配额：缺的预算平均分给现有项目（每个最多 6 句），分不完的不补；
 * 简历没有项目：项目配额让给题池（题池 4 道封顶）。
 */
export function planQuota(brief: Pick<InterviewBrief, "pace" | "areas">): Plan {
  const quota = QUOTA[brief.pace];
  const byKind = (kind: AreaKind) => brief.areas.filter((area) => area.kind === kind);
  const projects = byKind("project").slice(0, quota.project);
  const missing = quota.project - projects.length;
  const projectBudget = projects.length === 0 ? BUDGET.project : Math.min(MAX_PROJECT_BUDGET, BUDGET.project + Math.floor((missing * BUDGET.project) / projects.length));
  const quickCount = quota.quick + (projects.length === 0 ? quota.project : 0);
  const plan: Plan = [];
  for (const kind of KIND_ORDER) {
    const areas = kind === "project" ? projects : byKind(kind).slice(0, kind === "quick" ? quickCount : quota.scenario);
    for (const area of areas) plan.push({ id: area.id, kind, budget: kind === "project" ? projectBudget : BUDGET[kind] });
  }
  return plan;
}

/** 房间与事件里的进度：聊到第几份材料、共几份。 */
export type ProgressSummary = { covered: number; quota: number };

/** 当前材料的账：问了几句、每个角度追了几句、哪些角度讲透了。 */
export type Progress = ProgressSummary & {
  plan: Plan;
  /** 当前材料（还没进第一份为 null）。 */
  current: PlannedMaterial | null;
  /** 当前材料已问几句（含切入）。 */
  asked: number;
  budgetLeft: number;
  /** 当前材料上一句追问的角度（切入为 null）。 */
  facet: number | null;
  /** 每个角度追了几句。 */
  facetProbes: Record<number, number>;
  /** 模型说已经讲透的角度。 */
  doneFacets: number[];
};

/** 当前材料：最近一句面试官的话记的材料 id（往回找第一个非空的）。 */
export function currentTopic(transcript: Pick<TranscriptLine, "role" | "topic">[]): string | null {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const line = transcript[index];
    if (line.role === "interviewer" && line.topic) return line.topic;
  }
  return null;
}

/** 聊过的材料 id（按第一次出现的顺序）。 */
export function coveredIds(transcript: Pick<TranscriptLine, "role" | "topic">[]): string[] {
  const seen: string[] = [];
  for (const line of transcript) if (line.role === "interviewer" && line.topic && !seen.includes(line.topic)) seen.push(line.topic);
  return seen;
}

export function progressOf(plan: Plan, transcript: TranscriptLine[]): Progress {
  const topic = currentTopic(transcript);
  const index = topic ? plan.findIndex((item) => item.id === topic) : -1;
  const current = index >= 0 ? plan[index] : null;
  const lines = current ? transcript.filter((line) => line.role === "interviewer" && line.topic === current.id && line.kind !== "closing") : [];
  const facetProbes: Record<number, number> = {};
  const doneFacets: number[] = [];
  let facet: number | null = null;
  for (const line of lines) {
    if (typeof line.facet === "number") facetProbes[line.facet] = (facetProbes[line.facet] ?? 0) + 1;
    if (typeof line.doneFacet === "number" && !doneFacets.includes(line.doneFacet)) doneFacets.push(line.doneFacet);
    facet = typeof line.facet === "number" ? line.facet : null;
  }
  return { plan, quota: plan.length, covered: index + 1, current, asked: lines.length, budgetLeft: current ? Math.max(0, current.budget - lines.length) : 0, facet, facetProbes, doneFacets };
}

/** 计划里当前材料之后的那份；还没开始就是第一份；没有了为 null。 */
export function nextMaterial(progress: Pick<Progress, "plan" | "current">): PlannedMaterial | null {
  const index = progress.current ? progress.plan.findIndex((item) => item.id === progress.current!.id) : -1;
  return progress.plan[index + 1] ?? null;
}

/** 确定性的伪随机（FNV-1a 哈希 → [0, 1)）：同一场同一处抽同一个角度，可重放。 */
export function seededRandom(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

/**
 * 下一个追问的角度：还没讲透、也没追满 FACET_RUN_MAX 句的角度里，项目按岗位相关度加权随机抽（备课按相关度排序，位置就是权重），
 * 基础题与场景题按顺序（唯一一层追问 / 引导阶梯）。没有了为 null。
 */
export function pickFacet(area: Pick<InterviewArea, "kind" | "guides">, progress: Pick<Progress, "facet" | "facetProbes" | "doneFacets">, seed: string): number | null {
  const open = area.guides
    .map((_, index) => index)
    .filter((index) => index !== progress.facet && !progress.doneFacets.includes(index) && (progress.facetProbes[index] ?? 0) < FACET_RUN_MAX);
  if (open.length === 0) return null;
  if (area.kind !== "project") return open[0];
  const weights = open.map((index) => area.guides.length - index);
  let roll = seededRandom(seed) * weights.reduce((sum, weight) => sum + weight, 0);
  for (let position = 0; position < open.length; position += 1) {
    roll -= weights[position];
    if (roll < 0) return open[position];
  }
  return open[open.length - 1];
}

/** 当前角度还能不能接着追（没讲透、没追满）。 */
export function facetOpen(progress: Pick<Progress, "facet" | "facetProbes" | "doneFacets">): boolean {
  if (progress.facet === null) return false;
  return !progress.doneFacets.includes(progress.facet) && (progress.facetProbes[progress.facet] ?? 0) < FACET_RUN_MAX;
}

export function renderProgress(progress: Progress): string {
  if (!progress.current) return `进度：还没进第一份材料，共 ${progress.quota} 份。`;
  return `进度：第 ${progress.covered} 份材料，共 ${progress.quota} 份；这份已问 ${progress.asked} 句，还能问 ${progress.budgetLeft} 句。`;
}
