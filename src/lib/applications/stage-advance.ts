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
