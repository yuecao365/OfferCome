import type { InterviewRound } from "@/lib/interviews/types";

import { APPLICATION_STAGES, type ApplicationStage } from "./types";

/** 记录了某一轮真实面试后，投递至少应该到达的阶段。 */
const STAGE_BY_ROUND: Record<InterviewRound, ApplicationStage> = {
  first_interview: "first_interview",
  second_interview: "second_interview",
  third_interview: "third_interview",
  hr_interview: "hr_interview",
  // 轮次不明时只能确认"已经面过"，按一面处理。
  other: "first_interview",
};

/** offer 与 rejected 是终态，不因为补记面试而回退。 */
const TERMINAL_STAGES: ReadonlySet<ApplicationStage> = new Set([
  "offer",
  "rejected",
]);

function stageRank(stage: ApplicationStage): number {
  return APPLICATION_STAGES.indexOf(stage);
}

/**
 * 根据新记录的面试轮次推进投递阶段，只升不降。
 * 返回 null 表示无需更新。
 */
export function advancedStage(
  currentStage: ApplicationStage,
  interviewRound: InterviewRound | null,
): ApplicationStage | null {
  if (TERMINAL_STAGES.has(currentStage)) {
    return null;
  }

  const target = interviewRound
    ? STAGE_BY_ROUND[interviewRound]
    : STAGE_BY_ROUND.other;
  return stageRank(target) > stageRank(currentStage) ? target : null;
}

/**
 * Boss 上出现新互动时，建议推进到的下一个阶段。返回 null 表示不给建议。
 *
 * 这张表是刻意写死而不是"取下一档"算出来的——每一条都是一次明确的判断，
 * 不在表里就意味着我们承认猜不准：
 * - 「已投递」的新互动太模糊（可能只是 HR 打了个招呼），猜错的纠正成本
 *   高于省下的一次点击，交给用户判断；
 * - 「HR 面」之后是 Offer / 拒绝这两个终态，代价太重，永远不猜；
 * - 终态本身不再推进。
 */
const NEW_ACTIVITY_SUGGESTIONS: Partial<
  Record<ApplicationStage, ApplicationStage>
> = {
  assessment: "first_interview",
  first_interview: "second_interview",
  second_interview: "third_interview",
  third_interview: "hr_interview",
};

/**
 * 岗位被下架时的建议。
 *
 * 同样只列出敢下判断的档位：还没面过就被下架，基本等于这条线走完了；
 * 但已经进入面试轮次之后，岗位关闭是有歧义的——可能是招到人了（甚至就是你），
 * 也可能流程还在走，这时推一个「拒绝」猜错的代价更难受，宁可不给。
 */
const CLOSED_JOB_SUGGESTIONS: Partial<
  Record<ApplicationStage, ApplicationStage>
> = {
  applied: "rejected",
  assessment: "rejected",
};

export function suggestedStageForSourceChange(input: {
  currentStage: ApplicationStage;
  /** 「有新活动」：Boss 侧最后互动时间前进了。 */
  hasNewActivity: boolean;
  /** 「刚被下架」：本次同步里岗位状态从在招变成了失效。 */
  hasJobClosed: boolean;
}): ApplicationStage | null {
  // 下架是比"互动时间戳动了"强得多的信号，优先判定。
  if (input.hasJobClosed) {
    return CLOSED_JOB_SUGGESTIONS[input.currentStage] ?? null;
  }
  if (!input.hasNewActivity) return null;
  return NEW_ACTIVITY_SUGGESTIONS[input.currentStage] ?? null;
}
