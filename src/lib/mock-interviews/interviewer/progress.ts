import type { InterviewStage } from "../types";
import { planItemStatus, turnsUsed, type InterviewerState } from "./state";

/** 房间顶栏与回合结果里的进度：面试官的计划各项走到哪了、用了几回合。 */
export function interviewStage(state: InterviewerState): InterviewStage {
  return {
    turnsUsed: turnsUsed(state),
    turnsTotal: state.brief.turns,
    items: (state.plan?.items ?? []).map((item) => ({ id: item.id, label: item.label, kind: item.kind, status: planItemStatus(state, item) })),
  };
}
