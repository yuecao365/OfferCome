import { OPENING_MINUTES } from "./brief";
import {
  activeThread,
  areaById,
  areaTurnsUsed,
  threadsOfArea,
  type InterviewerState,
} from "./state";

/**
 * 预算与不变量：模型不可越过的边界，全部由代码持有。
 * 吸收了旧的 follow-up-policy（每题一次追问、整场按题数封顶）。
 */

export const LADDER_MAX_DEPTH = 4;
export const RESCUES_PER_THREAD = 1;
export const THREADS_PER_AREA = 2;
/** 一个回合折算的分钟数，用来把时长预算换成回合预算。 */
export const MINUTES_PER_TURN = 1.5;
/** 连续这么多回合没有推进动作，代码强制推进。 */
export const IDLE_TURNS_BEFORE_FORCE = 2;

export type ActionName =
  | "ask_intro"
  | "open_thread"
  | "probe"
  | "rescue"
  | "close_thread"
  | "close_interview";

export type ActionCheck = { ok: true } | { ok: false; reason: string };

export function areaMinutesLeft(state: InterviewerState, areaId: string): number {
  const area = areaById(state, areaId);
  if (!area) return 0;
  return area.minutes - areaTurnsUsed(state, areaId) * MINUTES_PER_TURN;
}

export function totalMinutesUsed(state: InterviewerState): number {
  return state.turnIndex * MINUTES_PER_TURN;
}

export function timeExhausted(state: InterviewerState): boolean {
  return totalMinutesUsed(state) >= state.brief.durationMinutes + OPENING_MINUTES;
}

/** 每个领域至少一个已结束（含跳过）的线程。 */
export function coverageComplete(state: InterviewerState): boolean {
  return state.brief.areas.every((area) =>
    threadsOfArea(state, area.id).some((thread) => thread.status !== "active"),
  );
}

export function areasOpenable(state: InterviewerState): string[] {
  return state.brief.areas
    .filter(
      (area) =>
        threadsOfArea(state, area.id).length < THREADS_PER_AREA &&
        areaMinutesLeft(state, area.id) > 0,
    )
    .map((area) => area.id);
}

/** 尚未覆盖的领域优先；都覆盖过就选剩余时间最多的。 */
export function nextAreaToOpen(state: InterviewerState): string | null {
  const openable = areasOpenable(state);
  if (openable.length === 0) return null;
  const uncovered = openable.filter(
    (areaId) => !threadsOfArea(state, areaId).some((thread) => thread.status !== "active"),
  );
  const pool = uncovered.length > 0 ? uncovered : openable;
  return pool.toSorted(
    (left, right) => areaMinutesLeft(state, right) - areaMinutesLeft(state, left),
  )[0] ?? null;
}

export function canAct(
  state: InterviewerState,
  action: ActionName,
  args: { areaId?: string } = {},
): ActionCheck {
  if (state.phase === "ended") return { ok: false, reason: "面试已结束" };
  const active = activeThread(state);

  switch (action) {
    case "ask_intro":
      if (state.phase !== "opening") return { ok: false, reason: "只能在开场请候选人自我介绍" };
      if (!state.brief.askIntro) return { ok: false, reason: "本轮不需要自我介绍" };
      return { ok: true };
    case "open_thread": {
      if (active) return { ok: false, reason: "当前线程尚未结束，先 close_thread" };
      if (!args.areaId || !areaById(state, args.areaId)) {
        return { ok: false, reason: "areaId 不在简报里" };
      }
      if (threadsOfArea(state, args.areaId).length >= THREADS_PER_AREA) {
        return { ok: false, reason: "该领域的线程数已达上限" };
      }
      if (areaMinutesLeft(state, args.areaId) <= 0) {
        return { ok: false, reason: "该领域的时间已用尽" };
      }
      return { ok: true };
    }
    case "probe":
      if (!active) return { ok: false, reason: "没有进行中的线程，先 open_thread" };
      if (active.depth >= LADDER_MAX_DEPTH) return { ok: false, reason: "本线程已到深度上限，请 close_thread" };
      if (areaMinutesLeft(state, active.areaId) <= 0) {
        return { ok: false, reason: "该领域的时间已用尽，请 close_thread" };
      }
      return { ok: true };
    case "rescue":
      if (!active) return { ok: false, reason: "没有进行中的线程" };
      if (active.rescues >= RESCUES_PER_THREAD) return { ok: false, reason: "本线程已给过提示" };
      return { ok: true };
    case "close_thread":
      if (!active) return { ok: false, reason: "没有进行中的线程" };
      return { ok: true };
    case "close_interview":
      if (coverageComplete(state) || timeExhausted(state)) return { ok: true };
      return { ok: false, reason: "还有领域没有考察，不能收尾" };
  }
}
