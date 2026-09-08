import type { ActionName } from "./actions";
import { MAX_AREA_DEPTH } from "./brief";
import { evidenceSummary, questionTurnsUsed, threadAnswered } from "./evidence";
import { activeThread, areaById, closedThreads, threadsOfArea, type InterviewerState } from "./state";

/**
 * 预算与不变量：模型不可越过的边界，全部由代码持有。
 *
 * 面试的长短由信息量决定（evidence.ts）：信息够了就允许收尾；回合数只留一个
 * 远高于正常值的安全上限防止跑飞。每个领域的深度是目标，允许超一层。
 */

export const RESCUES_PER_THREAD = 1;
export const CLARIFIES_PER_THREAD = 2;
export const INTERRUPTS_PER_THREAD = 1;
export const THREADS_PER_AREA = 2;
/** 追问可以比简报里的目标深度多走一层。 */
export const DEPTH_SLACK = 1;
/** 连续这么多回合没有推进动作，代码强制推进。 */
export const IDLE_TURNS_BEFORE_FORCE = 2;
/** 连续这么多条线程候选人一句都答不上，允许提前收尾。 */
const FAILED_THREADS_BEFORE_CLOSE = 2;

export type ActionCheck = { ok: true } | { ok: false; reason: string };

/** 一个线程允许的最大追问层数。 */
export function probeLimit(state: InterviewerState, areaId: string): number {
  const target = areaById(state, areaId)?.depth ?? 1;
  return Math.min(MAX_AREA_DEPTH, target + DEPTH_SLACK);
}

/** 提问回合的安全上限：备课预计回合的 1.5 倍再加 4，只数面试官提问的回合。 */
export function safetyCap(state: InterviewerState): number {
  return Math.round(state.brief.plannedTurns * 1.5) + 4;
}

export function atSafetyCap(state: InterviewerState): boolean {
  return questionTurnsUsed(state) >= safetyCap(state);
}

/** 每个领域至少一个已结束（含跳过）的线程。 */
export function coverageComplete(state: InterviewerState): boolean {
  return state.brief.areas.every((area) =>
    threadsOfArea(state, area.id).some((thread) => thread.status !== "active"),
  );
}

export function areasOpenable(state: InterviewerState): string[] {
  return state.brief.areas
    .filter((area) => threadsOfArea(state, area.id).length < THREADS_PER_AREA)
    .map((area) => area.id);
}

/** 尚未覆盖的领域优先，按简报顺序。 */
export function nextAreaToOpen(state: InterviewerState): string | null {
  const openable = areasOpenable(state);
  const uncovered = openable.filter(
    (areaId) => !threadsOfArea(state, areaId).some((thread) => thread.status !== "active"),
  );
  return uncovered[0] ?? openable[0] ?? null;
}

/** 最近关闭的几条线程候选人都一句没答上：继续问也拿不到信息。 */
function recentThreadsFailed(state: InterviewerState): boolean {
  const recent = closedThreads(state).slice(-FAILED_THREADS_BEFORE_CLOSE);
  return recent.length === FAILED_THREADS_BEFORE_CLOSE && recent.every((thread) => !threadAnswered(thread, state.messages));
}

/**
 * 收尾的条件（任一）：信息量达标；所有领域都考察过；连续两条线程失守；
 * 到安全上限；没有线程也没有可开的领域。
 */
export function canClose(state: InterviewerState): boolean {
  const evidence = evidenceSummary(state);
  if (evidence.total >= evidence.target) return true;
  if (coverageComplete(state) || recentThreadsFailed(state) || atSafetyCap(state)) return true;
  return !activeThread(state) && areasOpenable(state).length === 0;
}

export function canAct(
  state: InterviewerState,
  action: ActionName,
  args: { areaId?: string } = {},
): ActionCheck {
  if (state.phase === "ended") return { ok: false, reason: "面试已结束" };
  const active = activeThread(state);
  const capped = atSafetyCap(state);

  switch (action) {
    case "ask_intro":
      if (state.phase !== "opening") return { ok: false, reason: "只能在开场请候选人自我介绍" };
      if (!state.brief.askIntro) return { ok: false, reason: "本轮不需要自我介绍" };
      return { ok: true };
    case "open_thread": {
      if (active) return { ok: false, reason: "当前线程尚未结束，先 close_thread" };
      if (capped) return { ok: false, reason: "提问次数已到安全上限，请 close_interview" };
      const areaId = args.areaId ?? "";
      if (!areaById(state, areaId)) return { ok: false, reason: "areaId 不在简报里" };
      if (threadsOfArea(state, areaId).length >= THREADS_PER_AREA) {
        return { ok: false, reason: "该领域的线程数已达上限" };
      }
      return { ok: true };
    }
    case "probe":
    case "interrupt":
      if (!active) return { ok: false, reason: "没有进行中的线程，先 open_thread" };
      if (capped) return { ok: false, reason: "提问次数已到安全上限，请 close_thread" };
      if (active.depth >= probeLimit(state, active.areaId)) {
        return { ok: false, reason: "本线程已到深度上限，请 close_thread" };
      }
      if (action === "interrupt" && active.interrupts >= INTERRUPTS_PER_THREAD) {
        return { ok: false, reason: "本线程已打断过一次" };
      }
      return { ok: true };
    case "rescue":
      if (!active) return { ok: false, reason: "没有进行中的线程" };
      if (active.rescues >= RESCUES_PER_THREAD) return { ok: false, reason: "本线程已给过提示，可以 clarify 解释题目或 close_thread" };
      return { ok: true };
    case "clarify":
      if (!active) return { ok: false, reason: "没有进行中的线程" };
      if (active.clarifies >= CLARIFIES_PER_THREAD) return { ok: false, reason: "本线程已澄清两次，请推进" };
      return { ok: true };
    case "close_thread":
      if (!active) return { ok: false, reason: "没有进行中的线程" };
      return { ok: true };
    case "close_interview":
      if (canClose(state)) return { ok: true };
      return { ok: false, reason: "信息量还没达标，继续考察" };
  }
}
