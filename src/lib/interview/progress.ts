import type { AreaKind, InterviewBrief, InterviewPace } from "@/lib/mock-interviews/brief/brief";

/**
 * 覆盖配额（设计修订 v3 §10）：一场的长短由信息量决定，不由分钟数决定。
 * 节奏定这场聊几份材料（配额），每份材料最多问几句（预算）；一份材料"够了"就换下一份，配额里的材料都聊完就结束。
 * 没有时钟：用户中途离开、写得长、说得慢都不影响。进度本身由 state.ts 从事件推导；这里只剩配额表与计划。
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
