import type { AreaKind, InterviewBrief, InterviewPace } from "@/lib/mock-interviews/brief/brief";

/**
 * 参考值，不是配额（agent-freedom-plan §2）：一场聊几份材料由备课的模型定，每份材料问几句由面试官临场定。
 * 这里的数字只出现在规划卡、议程与状态卡上作提示：每种材料的前几份是"主线"（按节奏参考数），其余是"备选"；
 * 每份材料"一般几句"是常规长度。代码不按它截断、不按它补题、不按它退回动作。没有时钟。
 */

/** 各节奏一般聊几份材料（主线的数量）。 */
export const REFERENCE_COUNT: Record<InterviewPace, Record<AreaKind, number>> = {
  quick: { project: 1, quick: 2, scenario: 1 },
  standard: { project: 2, quick: 3, scenario: 1 },
  deep: { project: 3, quick: 4, scenario: 2 },
};
/** 每份材料一般问几句（切入 + 追问；状态卡参考）。 */
export const REFERENCE_TURNS: Record<AreaKind, number> = { project: 4, quick: 2, scenario: 3 };
/** 材料的顺序：真实一面的顺序。 */
const KIND_ORDER: AreaKind[] = ["project", "quick", "scenario"];

export type MaterialLane = "main" | "backup";
export type PlannedMaterial = { id: string; kind: AreaKind; reference: number; lane: MaterialLane };
export type Plan = PlannedMaterial[];

/** 这场的材料（按种类排序）、各自的参考句数与主线 / 备选。备课写得多的排在后面当备选。 */
export function planMaterials(brief: Pick<InterviewBrief, "pace" | "areas">): Plan {
  const plan: Plan = [];
  for (const kind of KIND_ORDER) {
    const mains = REFERENCE_COUNT[brief.pace][kind];
    brief.areas.filter((item) => item.kind === kind).forEach((area, index) => plan.push({ id: area.id, kind, reference: REFERENCE_TURNS[kind], lane: index < mains ? "main" : "backup" }));
  }
  return plan;
}
