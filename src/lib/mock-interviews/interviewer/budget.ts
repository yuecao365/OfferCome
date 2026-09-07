import { MAX_AREA_DEPTH } from "./brief";
import { activeThread, areaById, threadsOfArea, type InterviewerState } from "./state";

/**
 * 预算与不变量：模型不可越过的边界，全部由代码持有。
 * 预算只有一个数：回合区间。下限之前不许收尾，上限到了强制收尾，
 * 区间内由面试官自己判断；每个领域的深度是目标，允许超一层。
 */

export const RESCUES_PER_THREAD = 1;
export const THREADS_PER_AREA = 2;
/** 追问可以比简报里的目标深度多走一层。 */
export const DEPTH_SLACK = 1;
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

/** 一个线程允许的最大追问层数。 */
export function probeLimit(state: InterviewerState, areaId: string): number {
  const target = areaById(state, areaId)?.depth ?? 1;
  return Math.min(MAX_AREA_DEPTH, target + DEPTH_SLACK);
}

export function belowMinimum(state: InterviewerState): boolean {
  return state.turnIndex < state.brief.turnRange.min;
}

export function atMaximum(state: InterviewerState): boolean {
  return state.turnIndex >= state.brief.turnRange.max;
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

/** 收尾的条件：到上限；或过了下限；或没有线程也没有可开的领域。 */
export function canClose(state: InterviewerState): boolean {
  if (atMaximum(state) || !belowMinimum(state)) return true;
  return !activeThread(state) && areasOpenable(state).length === 0;
}

export function canAct(
  state: InterviewerState,
  action: ActionName,
  args: { areaId?: string } = {},
): ActionCheck {
  if (state.phase === "ended") return { ok: false, reason: "面试已结束" };
  const active = activeThread(state);
  const maxed = atMaximum(state);

  switch (action) {
    case "ask_intro":
      if (state.phase !== "opening") return { ok: false, reason: "只能在开场请候选人自我介绍" };
      if (!state.brief.askIntro) return { ok: false, reason: "本轮不需要自我介绍" };
      return { ok: true };
    case "open_thread": {
      if (active) return { ok: false, reason: "当前线程尚未结束，先 close_thread" };
      if (maxed) return { ok: false, reason: "回合已到上限，请 close_interview" };
      const areaId = args.areaId ?? "";
      if (!areaById(state, areaId)) return { ok: false, reason: "areaId 不在简报里" };
      if (threadsOfArea(state, areaId).length >= THREADS_PER_AREA) {
        return { ok: false, reason: "该领域的线程数已达上限" };
      }
      return { ok: true };
    }
    case "probe":
      if (!active) return { ok: false, reason: "没有进行中的线程，先 open_thread" };
      if (maxed) return { ok: false, reason: "回合已到上限，请 close_thread" };
      if (active.depth >= probeLimit(state, active.areaId)) {
        return { ok: false, reason: "本线程已到深度上限，请 close_thread" };
      }
      return { ok: true };
    case "rescue":
      if (!active) return { ok: false, reason: "没有进行中的线程" };
      if (maxed) return { ok: false, reason: "回合已到上限，请 close_thread" };
      if (active.rescues >= RESCUES_PER_THREAD) return { ok: false, reason: "本线程已给过提示" };
      return { ok: true };
    case "close_thread":
      if (!active) return { ok: false, reason: "没有进行中的线程" };
      return { ok: true };
    case "close_interview":
      if (canClose(state)) return { ok: true };
      return { ok: false, reason: `还没到本场的回合下限（${state.brief.turnRange.min}），先继续考察` };
  }
}
