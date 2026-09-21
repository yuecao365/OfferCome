import type { AreaKind, InterviewBrief, InterviewPace } from "@/lib/mock-interviews/brief/brief";

import { planQuota } from "./progress";

/**
 * 面试状态（重建 v5 §2）：从事件推导、不单独存。每份材料的状态、余额、角度与证据账，候选人的信号计数。
 * 它渲染成模型每回合看到的唯一"记忆"（renderState），也是动作约束（constraints.ts）与 trace / 评测的输入。
 * 这里只认 StateEvent 这个最小形状：事件日志（events.ts）在第 3 步改成它的超集。
 */

/** 候选人这句是什么（模型判）。 */
export const SIGNALS = ["answered", "thin", "dont_know", "help", "not_mine", "refuse", "wants_end"] as const;
export type Signal = (typeof SIGNALS)[number];
/** 没有信息的三类：连续计数决定能不能收尾。 */
export const NO_INFO_SIGNALS: ReadonlySet<Signal> = new Set<Signal>(["dont_know", "not_mine", "refuse"]);

/** 面试官这回合做的事（模型提、代码校验）。 */
export const ACTIONS = ["probe", "switch", "clarify", "end"] as const;
export type Action = (typeof ACTIONS)[number];

export type StateEvent =
  | { type: "candidate_said"; seq: number; signal: Signal | null; control: "hint" | "skip" | "repeat" | "end" | null }
  | { type: "interviewer_said"; seq: number; action: Action; materialId: string | null; facet: number | null }
  | { type: "ledger_written"; seq: number; materialId: string; text: string }
  | { type: "ended"; seq: number };

export type FacetState = { text: string; probes: number; status: "untouched" | "asked" | "done" };
export type MaterialState = {
  id: string;
  kind: AreaKind;
  name: string;
  entryQuestion: string;
  status: "untouched" | "open" | "done" | "skipped";
  /** 问了几句（答疑不算）/ 上限。 */
  asked: number;
  budget: number;
  facets: FacetState[];
  /** 证据账：模型每回合写的一行（对候选人那段的摘要与存疑）。 */
  ledger: { seq: number; text: string }[];
};
export type InterviewState = {
  /** 面试官说过几句（含答疑、告别）。 */
  turn: number;
  materials: MaterialState[];
  /** 当前正在聊的材料 id；开场或收尾后为 null。 */
  currentId: string | null;
  /** 当前追的角度序号（项目）；没有为 null。 */
  currentFacet: number | null;
  candidate: { noInfoStreak: number; noInfoTotal: number; helpCount: number; wantsToEnd: boolean };
  phase: "opening" | "running" | "ended";
  /** 这场的节奏（开场白说时长用）。 */
  pace: InterviewPace;
};

/** 同一角度最多追这么多句。 */
export const FACET_PROBE_MAX = 2;

export function stateOf(brief: Pick<InterviewBrief, "pace" | "areas">, events: StateEvent[]): InterviewState {
  const plan = planQuota(brief);
  const materials: MaterialState[] = plan.map((item) => {
    const area = brief.areas.find((candidate) => candidate.id === item.id)!;
    return { id: item.id, kind: item.kind, name: area.name, entryQuestion: area.entryQuestion, status: "untouched", asked: 0, budget: item.budget, facets: area.kind === "project" ? area.guides.map((text) => ({ text, probes: 0, status: "untouched" as const })) : [], ledger: [] };
  });
  const byId = new Map(materials.map((item) => [item.id, item]));
  const state: InterviewState = { turn: 0, materials, currentId: null, currentFacet: null, candidate: { noInfoStreak: 0, noInfoTotal: 0, helpCount: 0, wantsToEnd: false }, phase: "opening", pace: brief.pace };
  const leave = (materialId: string | null) => {
    const material = materialId ? byId.get(materialId) : undefined;
    if (!material) return;
    if (material.status === "open") material.status = "done";
    for (const facet of material.facets) if (facet.status === "asked") facet.status = "done";
  };
  for (const event of events) {
    if (event.type === "candidate_said") {
      if (event.control === "skip") {
        leave(state.currentId);
        const material = state.currentId ? byId.get(state.currentId) : undefined;
        if (material) material.status = "skipped";
      }
      if (event.control === "end" || event.signal === "wants_end") state.candidate.wantsToEnd = true;
      if (event.signal === "help") state.candidate.helpCount += 1;
      if (event.signal && NO_INFO_SIGNALS.has(event.signal)) {
        state.candidate.noInfoStreak += 1;
        state.candidate.noInfoTotal += 1;
      } else if (event.signal === "answered" || event.signal === "thin") {
        state.candidate.noInfoStreak = 0;
      }
      continue;
    }
    if (event.type === "interviewer_said") {
      state.turn += 1;
      state.phase = "running";
      if (event.action === "end") {
        leave(state.currentId);
        state.currentId = null;
        state.currentFacet = null;
        state.phase = "ended";
        continue;
      }
      const material = event.materialId ? byId.get(event.materialId) : undefined;
      if (!material) continue;
      if (event.materialId !== state.currentId) {
        leave(state.currentId);
        state.currentId = event.materialId;
        state.currentFacet = null;
      }
      if (material.status === "untouched") material.status = "open";
      if (event.action === "clarify") continue;
      material.asked += 1;
      if (event.facet !== null && material.facets[event.facet]) {
        if (state.currentFacet !== null && state.currentFacet !== event.facet) {
          const previous = material.facets[state.currentFacet];
          if (previous && previous.status === "asked") previous.status = "done";
        }
        const facet = material.facets[event.facet];
        facet.probes += 1;
        facet.status = facet.probes >= FACET_PROBE_MAX ? "done" : "asked";
        state.currentFacet = event.facet;
      }
      continue;
    }
    if (event.type === "ledger_written") {
      byId.get(event.materialId)?.ledger.push({ seq: event.seq, text: event.text });
      continue;
    }
    if (event.type === "ended") state.phase = "ended";
  }
  return state;
}

const KIND_LABELS: Record<AreaKind, string> = { project: "项目", quick: "基础题", scenario: "场景题" };
const STATUS_LABELS: Record<MaterialState["status"], string> = { untouched: "还没聊", open: "正在聊", done: "聊完了", skipped: "候选人跳过" };

/** 整场的证据账（报告汇总的输入、报告页展示）：按材料归组，一份一行；没有为空串。 */
export function renderLedger(brief: Pick<InterviewBrief, "areas">, entries: { materialId: string; text: string }[]): string {
  const names = new Map(brief.areas.map((area) => [area.id, area.name]));
  const grouped = new Map<string, string[]>();
  for (const entry of entries) grouped.set(entry.materialId, [...(grouped.get(entry.materialId) ?? []), entry.text]);
  return [...grouped].map(([id, texts]) => `「${names.get(id) ?? id}」：${texts.join("；")}`).join("\n");
}

/** 模型每回合看到的状态卡正文：每份材料一段，候选人一段。只写进度，不重印议程里已有的切入问法与阶梯（那些在缓存前缀里）。 */
export function renderState(state: InterviewState): string {
  const materials = state.materials.map((material) => {
    const head = `- [${material.id}] ${KIND_LABELS[material.kind]}「${material.name}」：${STATUS_LABELS[material.status]}${material.status === "open" || material.status === "done" ? `，问了 ${material.asked} / ${material.budget} 句` : `，可问 ${material.budget} 句`}`;
    const facets = material.facets.length > 0 && material.status !== "untouched" ? `\n  角度：${material.facets.map((facet, index) => `${index + 1}. ${facet.text}（${facet.status === "done" ? "讲透了" : facet.status === "asked" ? `追了 ${facet.probes} 句` : "没问"}）`).join("；")}` : "";
    const ledger = material.ledger.length > 0 ? `\n  证据账：${material.ledger.map((item) => item.text).join("；")}` : "";
    return head + facets + ledger;
  });
  const candidate = `候选人：连续 ${state.candidate.noInfoStreak} 句没有信息（全场 ${state.candidate.noInfoTotal} 句），求助 ${state.candidate.helpCount} 次${state.candidate.wantsToEnd ? "，已表示想结束" : ""}。`;
  return `材料（${state.materials.filter((item) => item.status === "done" || item.status === "skipped").length} / ${state.materials.length} 份聊完）：\n${materials.join("\n")}\n${candidate}`;
}
