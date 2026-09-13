import type { InterviewStage } from "../types";
import { PHASE_ORDER, type PhaseBudget } from "./brief";
import { currentPhase, phaseTurnsUsed } from "./budget";
import type { InterviewerState } from "./state";

/** 房间顶栏与回合结果里的阶段进度：现在在哪个阶段、各阶段用了几个提问回合。 */
export function interviewStage(state: InterviewerState): InterviewStage {
  const used = Object.fromEntries(PHASE_ORDER.map((kind) => [kind, phaseTurnsUsed(state, kind)])) as PhaseBudget;
  return { phase: state.phase === "ended" ? null : currentPhase(state), plan: state.brief.plan, used };
}
