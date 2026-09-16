import type { InterviewArea, InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import { classifyReply, type TranscriptLine } from "./events";
import { FACET_RUN_MAX, facetOpen, nextMaterial, pickFacet, planQuota, progressOf, type PlannedMaterial, type Progress } from "./progress";

export { coveredIds, currentTopic } from "./progress";

/**
 * 一个决策（设计修订 v3 §1.4、§10）：代码把配额进度、候选人这句的类型合成"这回合的动作"，面试官只看这一个。
 * 何时换角度、换材料、收尾都在这里裁决；唯一交给模型判断的是"候选人刚才这段把当前角度讲透了没有"（facetDone），
 * 讲透与没讲透两种情况下该问什么都在决策里写好，模型只是选一边并措辞。纯函数，可重放。
 */

/** clarify：答疑——换个说法把题说具体（候选人求助或第一次答不上），不占材料预算。 */
export type Move = "continue" | "clarify" | "switch" | "close";

/** 这句问什么：哪份材料、哪个角度（切入为 null）；close 为 null。 */
export type Target = { topic: string; facet: number | null } | null;

export type Decision = {
  move: Move;
  reason: string;
  /** 模型没说"讲透了"时这句问的材料与角度。 */
  target: Target;
  /** 模型说"讲透了"时改问的材料与角度；null = 讲透了就告别；undefined = 这回合不问模型的判断。 */
  ifDone?: Target;
};

export const MOVE_LABELS: Record<Move, string> = { continue: "继续", clarify: "答疑", switch: "换题", close: "收尾" };

/** 候选人最近连续答不上了几次（隔着面试官的话不算断；不按话题分，模型误报材料也照数——F2 冒烟里一次误报就让"两次答不上换题"没触发）。 */
export function trailingDontKnows(transcript: TranscriptLine[]): number {
  let count = 0;
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const line = transcript[index];
    if (line.role !== "candidate") continue;
    if (classifyReply(line) !== "dont_know") break;
    count += 1;
  }
  return count;
}

const label = (area: InterviewArea | undefined, item: PlannedMaterial) => `「${area?.name ?? item.id}」（${item.id}）`;
const facetLabel = (area: InterviewArea, facet: number | null) => (facet === null ? "切入问法" : `角度「${area.guides[facet] ?? `第 ${facet + 1} 条`}」`);

export function decideMove(input: { brief: InterviewBrief; transcript: TranscriptLine[]; opening: boolean; seed: string }): Decision {
  const { brief, transcript } = input;
  if (input.opening) return { move: "continue", reason: "开场：先问候，请候选人用一两分钟介绍与这个岗位相关的经历，不要问别的", target: null };
  const progress = progressOf(planQuota(brief), transcript);
  const areaOf = (id: string) => brief.areas.find((area) => area.id === id);
  const next = nextMaterial(progress);
  const entryOf = (item: PlannedMaterial | null): Target => (item ? { topic: item.id, facet: null } : null);
  const switchTo = (why: string): Decision =>
    next ? { move: "switch", reason: `${why}：换到${label(areaOf(next.id), next)}，用它的切入问法起头`, target: entryOf(next) } : { move: "close", reason: `${why}；配额里的材料都聊完了：告别，不再提问`, target: null };

  if (!progress.current) return switchTo("开场结束");
  const last = transcript.at(-1);
  const reply = last?.role === "candidate" ? classifyReply(last) : "normal";
  const area = areaOf(progress.current.id)!;
  const here: Target = { topic: area.id, facet: progress.facet };
  if (reply === "skip") return switchTo("候选人要求跳过");
  if (reply === "dont_know" && trailingDontKnows(transcript) >= 2) return switchTo("候选人连续两次答不上，不纠缠");
  // 答疑先于预算（2026-09-16 用户实测：预算刚用完时说"什么意思"，被直接换到下一题），答疑不占预算。
  if (reply === "help") return { move: "clarify", reason: "候选人要求具体或没听懂：换个说法把上一句问的题说具体，还是这个角度，不换题、不追新的点", target: here };
  if (reply === "dont_know") return { move: "clarify", reason: "候选人答不上：把上一句问的题说具体或降一层再问一次，还是这个角度；再答不上就换", target: here };
  if (progress.budgetLeft <= 0) return switchTo("这份材料的预算用完了");

  const nextFacet = pickFacet(area, progress, `${input.seed}:${area.id}:${progress.asked}`);
  const after: Target = nextFacet !== null ? { topic: area.id, facet: nextFacet } : entryOf(next);
  const afterLabel = nextFacet !== null ? `换到${facetLabel(area, nextFacet)}${nextFacet === 0 && area.kind === "project" ? "（岗位最关心）" : ""}` : next ? `换到下一份材料${label(areaOf(next.id), next)}，用它的切入问法起头` : "告别（closing 填 true）";
  // 刚问完切入：项目直接进第一个角度；基础题 / 场景题看答得实不实——讲透了就换材料。
  if (progress.facet === null) {
    if (area.kind === "project" && nextFacet !== null) return { move: "continue", reason: `切入问完了：追问${facetLabel(area, nextFacet)}，从候选人刚说的话切过去`, target: { topic: area.id, facet: nextFacet } };
    const skipLabel = next ? `换到下一份材料${label(areaOf(next.id), next)}，用它的切入问法起头` : "告别（closing 填 true）";
    return { move: "continue", reason: `候选人答了切入问法。若这段已经答实、没什么可追（facetDone 填 true），${skipLabel}；否则追问${nextFacet !== null ? facetLabel(area, nextFacet) : "一句"}`, target: nextFacet !== null ? { topic: area.id, facet: nextFacet } : here, ifDone: entryOf(next) };
  }
  if (!facetOpen(progress)) {
    if (nextFacet === null) return switchTo(`${facetLabel(area, progress.facet)}已经追满，没有别的角度了`);
    return { move: "continue", reason: `${facetLabel(area, progress.facet)}已经追了 ${FACET_RUN_MAX} 句：换到${facetLabel(area, nextFacet)}，从候选人刚说的话切过去`, target: { topic: area.id, facet: nextFacet } };
  }
  return {
    move: "continue",
    reason: `上一句问的是${facetLabel(area, progress.facet)}。若候选人这段把它讲透了或明显讲不出更多（facetDone 填 true），${afterLabel}；否则接着这个角度问深一层，验证一件事`,
    target: here,
    ifDone: after,
  };
}

/** 底线替换这句话时改问的材料：换材料的回合就是决策指的那份；追问的回合改问计划里的下一份（当前这份的切入问法已经问过，不能再问）。 */
export function areaToAsk(brief: InterviewBrief, transcript: TranscriptLine[], decision: Decision): InterviewArea | null {
  const wanted = decision.move === "switch" ? decision.target?.topic : nextMaterial(progressOf(planQuota(brief), transcript))?.id;
  return wanted ? (brief.areas.find((area) => area.id === wanted) ?? null) : null;
}

export type { Progress };
