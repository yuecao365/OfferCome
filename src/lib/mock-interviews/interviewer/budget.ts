import type { ActionName } from "./actions";
import { AREA_KIND_LABELS, PHASE_ORDER, plannedTurns, PROBE_LIMIT, type AreaKind, type InterviewArea } from "./brief";
import { activeThread, areaById, QUESTION_KINDS, threadKind, threadOfArea, type InterviewerState } from "./state";

/**
 * 阶段、预算与不变量：模型不可越过的边界，全部由代码持有。
 *
 * 面试按阶段走（项目 → 基础 → 场景），预算按阶段给提问回合数，累计计算：一个阶段提前结束，
 * 剩下的回合自动顺延给下一阶段；一个阶段到时，进行中的线程不能再追、只能关掉进下一阶段。
 * 深度不预设：每种线程只有一个上限（项目 3、基础 1、场景 3），追不追由回答决定（见 reducer）。
 * 面试在各阶段都走完（预算用尽或没题可开）时结束，另有一个远高于正常值的安全上限防止跑飞。
 */

export type ActionCheck = { ok: true } | { ok: false; reason: string };

/** 面试官提问的次数：只数开场、切入问题和追问，提示不算。 */
export function questionTurnsUsed(state: InterviewerState): number {
  return state.messages.filter((message) => message.role === "interviewer" && QUESTION_KINDS.has(message.kind)).length;
}

/** 这个阶段用掉的提问回合：线程属于这个阶段的切入问题与追问。 */
export function phaseTurnsUsed(state: InterviewerState, kind: AreaKind): number {
  const threadIds = new Set(state.threads.filter((thread) => threadKind(state, thread) === kind).map((thread) => thread.id));
  return state.messages.filter((message) => message.role === "interviewer" && QUESTION_KINDS.has(message.kind) && message.threadId !== null && threadIds.has(message.threadId)).length;
}

/** 这个阶段的累计截止：开场 + 到它为止各阶段的预算之和。到了就该进下一阶段。 */
export function phaseEnd(state: InterviewerState, kind: AreaKind): number {
  let end = state.brief.askIntro ? 1 : 0;
  for (const phase of PHASE_ORDER) {
    end += state.brief.plan[phase];
    if (phase === kind) break;
  }
  return end;
}

/** 提问回合的安全上限：预计回合的 1.5 倍再加 4。 */
export function safetyCap(state: InterviewerState): number {
  return Math.round(plannedTurns(state.brief) * 1.5) + 4;
}

export function atSafetyCap(state: InterviewerState): boolean {
  return questionTurnsUsed(state) >= safetyCap(state);
}

/** 这个阶段还没开过的题，按简报顺序。 */
export function areasOpenable(state: InterviewerState, kind: AreaKind): InterviewArea[] {
  return state.brief.areas.filter((area) => area.kind === kind && !threadOfArea(state, area.id));
}

/**
 * 现在处于哪个阶段：有进行中的线程就是它所属的阶段；否则按顺序找第一个"预算没到、还有题可开"的阶段；
 * 都没有就是该收尾了（null）。
 */
export function currentPhase(state: InterviewerState): AreaKind | null {
  const active = activeThread(state);
  if (active) return threadKind(state, active);
  const used = questionTurnsUsed(state);
  return PHASE_ORDER.find((kind) => used < phaseEnd(state, kind) && areasOpenable(state, kind).length > 0) ?? null;
}

export function nextAreaToOpen(state: InterviewerState): InterviewArea | null {
  const phase = currentPhase(state);
  return phase ? (areasOpenable(state, phase)[0] ?? null) : null;
}

/** 各阶段都走完，或到了安全上限。 */
export function canClose(state: InterviewerState): boolean {
  return atSafetyCap(state) || (!activeThread(state) && currentPhase(state) === null);
}

export function canAct(state: InterviewerState, action: ActionName, args: { areaId?: string } = {}): ActionCheck {
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
      const area = areaById(state, args.areaId ?? "");
      if (!area) return { ok: false, reason: "areaId 不在简报里" };
      if (threadOfArea(state, area.id)) return { ok: false, reason: "这道题已经问过，每道题只问一次" };
      const phase = currentPhase(state);
      if (!phase) return { ok: false, reason: "各阶段都已走完，请 close_interview" };
      if (area.kind !== phase) return { ok: false, reason: `现在是${AREA_KIND_LABELS[phase]}阶段，只能开这个阶段的题` };
      return { ok: true };
    }
    case "probe": {
      if (!active) return { ok: false, reason: "没有进行中的线程，先 open_thread" };
      if (capped) return { ok: false, reason: "提问次数已到安全上限，请 close_thread" };
      const kind = threadKind(state, active);
      if (active.depth >= PROBE_LIMIT[kind]) {
        return { ok: false, reason: kind === "quick" ? "基础题只追一层，请 close_thread 换下一题" : "这道题已追到上限，请 close_thread" };
      }
      if (questionTurnsUsed(state) >= phaseEnd(state, kind)) {
        return { ok: false, reason: `${AREA_KIND_LABELS[kind]}阶段的时间到了，请 close_thread 进入下一阶段` };
      }
      return { ok: true };
    }
    case "hint":
      if (!active) return { ok: false, reason: "没有进行中的线程" };
      if (threadKind(state, active) === "quick") return { ok: false, reason: "基础题不给提示，答不上就下一题" };
      if (active.hinted) return { ok: false, reason: "本线程已给过提示" };
      return { ok: true };
    case "close_thread":
      if (!active) return { ok: false, reason: "没有进行中的线程" };
      return { ok: true };
    case "close_interview":
      if (canClose(state)) return { ok: true };
      return { ok: false, reason: "还有阶段没走完，继续考察" };
  }
}
