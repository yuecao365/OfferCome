import type { CareerFlowSnapshot } from "@/lib/applications/analytics";
import type { CandidateProfileContextInsight } from "@/lib/candidate-profile/types";
import type {
  RealInterviewRoundCounts,
  RealInterviewStatusCounts,
} from "./types";

export type InterviewStageProgress = {
  firstInterview: number;
  secondInterview: number;
  thirdInterview: number;
  hrInterview: number;
  offer: number;
  rejected: number;
};

export type RatioMetric = {
  key: "offer" | "advancement" | "completion";
  label: string;
  numerator: number;
  denominator: number;
  value: number | null;
  helper: string;
};

type InterviewStatusCountRow = {
  status: string;
  _count: { _all: number };
};

type InterviewRoundCountRow = {
  round: string | null;
  _count: { _all: number };
};

type HistorySummaryInput = {
  realInterviewCounts: RealInterviewStatusCounts;
  completedMockCount: number;
  averageMockScore: number | null;
  progress: InterviewStageProgress;
  insights: CandidateProfileContextInsight[];
};

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

export function toRealInterviewStatusCounts(
  rows: InterviewStatusCountRow[],
): RealInterviewStatusCounts {
  const counts: RealInterviewStatusCounts = {
    total: 0,
    scheduled: 0,
    completed: 0,
    canceled: 0,
  };

  for (const row of rows) {
    const status = row.status.trim().toLowerCase();
    counts.total += row._count._all;
    if (status === "scheduled") counts.scheduled += row._count._all;
    if (status === "completed") counts.completed += row._count._all;
    if (status === "canceled" || status === "cancelled") {
      counts.canceled += row._count._all;
    }
  }

  return counts;
}

export function toRealInterviewRoundCounts(
  rows: InterviewRoundCountRow[],
): RealInterviewRoundCounts {
  const counts: RealInterviewRoundCounts = {
    firstInterview: 0,
    secondInterview: 0,
    thirdInterview: 0,
    hrInterview: 0,
    other: 0,
  };

  for (const row of rows) {
    const count = row._count._all;
    if (row.round === "first_interview") counts.firstInterview += count;
    else if (row.round === "second_interview") counts.secondInterview += count;
    else if (row.round === "third_interview") counts.thirdInterview += count;
    else if (row.round === "hr_interview") counts.hrInterview += count;
    else counts.other += count;
  }

  return counts;
}

export function buildInterviewStageProgress(
  flow: CareerFlowSnapshot,
): InterviewStageProgress {
  const { rounds } = flow;
  return {
    firstInterview:
      rounds.firstInterview +
      rounds.secondInterview +
      rounds.thirdInterview +
      rounds.hrInterview +
      rounds.offer,
    secondInterview:
      rounds.secondInterview +
      rounds.thirdInterview +
      rounds.hrInterview +
      rounds.offer,
    thirdInterview:
      rounds.thirdInterview + rounds.hrInterview + rounds.offer,
    hrInterview: rounds.hrInterview + rounds.offer,
    offer: rounds.offer,
    rejected: flow.rejected,
  };
}

export function mergeInterviewRoundEvidence(
  progress: InterviewStageProgress,
  rounds: RealInterviewRoundCounts,
): InterviewStageProgress {
  const firstReached =
    rounds.firstInterview +
    rounds.secondInterview +
    rounds.thirdInterview +
    rounds.hrInterview;
  const secondReached =
    rounds.secondInterview + rounds.thirdInterview + rounds.hrInterview;
  const thirdReached = rounds.thirdInterview + rounds.hrInterview;

  return {
    ...progress,
    firstInterview: Math.max(progress.firstInterview, firstReached),
    secondInterview: Math.max(progress.secondInterview, secondReached),
    thirdInterview: Math.max(progress.thirdInterview, thirdReached),
    hrInterview: Math.max(progress.hrInterview, rounds.hrInterview),
  };
}

export function buildInterviewConversionMetrics(
  progress: InterviewStageProgress,
  realInterviewCounts: RealInterviewStatusCounts,
): RatioMetric[] {
  const concluded =
    realInterviewCounts.completed + realInterviewCounts.canceled;

  return [
    {
      key: "offer",
      label: "Offer 转化率",
      numerator: progress.offer,
      denominator: progress.firstInterview,
      value: ratio(progress.offer, progress.firstInterview),
      helper: "Offer 岗位 ÷ 至少进入一面的岗位",
    },
    {
      key: "advancement",
      label: "面试推进率",
      numerator: progress.secondInterview,
      denominator: progress.firstInterview,
      value: ratio(progress.secondInterview, progress.firstInterview),
      helper: "至少进入二面的岗位 ÷ 至少进入一面的岗位",
    },
    {
      key: "completion",
      label: "面试完成率",
      numerator: realInterviewCounts.completed,
      denominator: concluded,
      value: ratio(realInterviewCounts.completed, concluded),
      helper: "已完成真实面试 ÷ 已完成与已取消记录",
    },
  ];
}

export function buildInterviewHistorySummary({
  realInterviewCounts,
  completedMockCount,
  averageMockScore,
  progress,
  insights,
}: HistorySummaryInput): { title: string; body: string; dataSufficient: boolean } {
  const hasHistory =
    realInterviewCounts.total > 0 || completedMockCount > 0 || progress.firstInterview > 0;

  if (!hasHistory) {
    return {
      title: "完成第一次训练后，这里会形成总结",
      body: "当前还没有足够的真实面试或模拟训练记录。完成一次模拟面试或补充历史面试后，工作台会基于真实证据归纳优势和训练重点。继续准备，祝你早日拿到理想 Offer。",
      dataSufficient: false,
    };
  }

  const parts: string[] = [];
  if (realInterviewCounts.total > 0) {
    parts.push(
      `已记录 ${realInterviewCounts.total} 场真实面试，其中 ${realInterviewCounts.completed} 场已完成。`,
    );
  }
  if (progress.secondInterview > 0) {
    parts.push(`目前至少有 ${progress.secondInterview} 个岗位推进到二面或更后阶段。`);
  } else if (progress.firstInterview > 0) {
    parts.push(`目前至少有 ${progress.firstInterview} 个岗位进入面试阶段。`);
  }
  if (completedMockCount > 0) {
    parts.push(
      averageMockScore === null
        ? `已完成 ${completedMockCount} 次模拟训练。`
        : `已完成 ${completedMockCount} 次模拟训练，平均 ${averageMockScore} 分。`,
    );
  }

  const strength = insights.find((insight) => insight.kind === "strength");
  const focus = insights.find(
    (insight) => insight.kind === "training_focus" || insight.kind === "weakness",
  );
  if (strength) {
    parts.push(`能力画像显示，“${strength.title}”是当前相对稳定的优势。`);
  }
  if (focus) {
    parts.push(`下一阶段建议优先关注“${focus.title}”，并结合复盘持续练习。`);
  } else {
    parts.push("建议继续记录回答与复盘证据，让训练重点逐步变得更准确。");
  }
  parts.push("保持节奏，继续加油，祝你早日拿到理想 Offer。");

  return {
    title: "你的面试进展正在形成可复用经验",
    body: parts.join(""),
    dataSufficient: true,
  };
}
