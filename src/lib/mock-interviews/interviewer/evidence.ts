import { evidenceTargetForPace } from "./brief";
import { threadsOfArea, type InterviewerState, type MessageState, type ThreadState } from "./state";

/**
 * 信息量：这场面试到目前为止"摸清了多少"。纯代码从状态算，每回合重算。
 *
 * 面试的长短由它决定，不由回合数决定：候选人问"这题想考什么"、面试官给提示，
 * 都不产生信息量，也就不消耗面试。
 *
 *   领域得分 q_a = max over 该领域线程 of (1 + 已回答的追问层数) / (1 + 目标深度)，上限 1；
 *                 跳过或一句都没答的线程记 0
 *   领域覆盖 E   = Σ w_a · q_a / Σ w_a
 *   假设进度 H   = 已确认或已否定的假设 / 假设总数（没有假设时 H = E）
 *   信息量   I   = 0.8 · E + 0.2 · H
 */

const COVERAGE_WEIGHT = 0.8;

/** 面试官"问了一次"的消息类型：切入问题、追问、打断、开场请自我介绍。 */
export const QUESTION_KINDS = new Set<MessageState["kind"]>(["intro_request", "question", "probe", "interrupt"]);

/** 一条线程里"追问之后候选人有实质回答"的层数；切入问题算第 0 层。 */
export function answeredDepth(thread: ThreadState, messages: MessageState[]): number {
  const own = messages.filter((message) => message.threadId === thread.id);
  let answered = 0;
  let pendingProbe = false;
  for (const message of own) {
    if (message.role === "interviewer" && (message.kind === "probe" || message.kind === "interrupt")) {
      pendingProbe = true;
    } else if (message.role === "candidate" && message.kind === "answer" && pendingProbe) {
      answered += 1;
      pendingProbe = false;
    }
  }
  return answered;
}

/** 线程有没有拿到任何实质回答。 */
export function threadAnswered(thread: ThreadState, messages: MessageState[]): boolean {
  return (
    thread.status !== "skipped" &&
    messages.some((message) => message.threadId === thread.id && message.role === "candidate" && message.kind === "answer")
  );
}

export function areaScore(state: InterviewerState, areaId: string): number {
  const area = state.brief.areas.find((item) => item.id === areaId);
  if (!area) return 0;
  return threadsOfArea(state, areaId).reduce((best, thread) => {
    if (!threadAnswered(thread, state.messages)) return best;
    const score = Math.min(1, (1 + answeredDepth(thread, state.messages)) / (1 + area.depth));
    return Math.max(best, score);
  }, 0);
}

export type EvidenceSummary = {
  /** 领域覆盖 E */
  coverage: number;
  /** 假设进度 H */
  hypotheses: number;
  /** 信息量 I */
  total: number;
  target: number;
  areas: { id: string; name: string; score: number }[];
};

export function evidenceSummary(state: InterviewerState): EvidenceSummary {
  const areas = state.brief.areas.map((area) => ({
    id: area.id,
    name: area.name,
    weight: area.weight,
    score: areaScore(state, area.id),
  }));
  const totalWeight = areas.reduce((sum, area) => sum + area.weight, 0);
  const coverage = totalWeight > 0 ? areas.reduce((sum, area) => sum + area.weight * area.score, 0) / totalWeight : 0;
  const hypothesisCount = state.memory.hypotheses.length;
  const hypotheses =
    hypothesisCount > 0
      ? state.memory.hypotheses.filter((item) => item.status !== "open").length / hypothesisCount
      : coverage;
  const total = COVERAGE_WEIGHT * coverage + (1 - COVERAGE_WEIGHT) * hypotheses;
  return {
    coverage,
    hypotheses,
    total,
    target: evidenceTargetForPace(state.brief.pace),
    areas: areas.map(({ id, name, score }) => ({ id, name, score })),
  };
}

/** 面试官提问的次数：只数切入问题、追问、打断和开场，澄清与提示不算。 */
export function questionTurnsUsed(state: InterviewerState): number {
  return state.messages.filter((message) => message.role === "interviewer" && QUESTION_KINDS.has(message.kind)).length;
}

/** 给提示词看的信息量摘要。 */
export function renderEvidence(summary: EvidenceSummary): string {
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const areas = summary.areas.map((area) => `${area.name} ${percent(area.score)}`).join("，");
  return `本场的信息量目标是 ${percent(summary.target)}，目前 ${percent(summary.total)}（${areas}；简历假设验证进度 ${percent(summary.hypotheses)}）。`;
}
