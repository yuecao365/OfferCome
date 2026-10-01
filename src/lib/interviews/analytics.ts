import type { CareerFlowSnapshot } from "@/lib/applications/analytics";
import type { CandidateProfileContextInsight } from "@/lib/candidate-profile/types";
import { defineMessages, type Locale } from "@/lib/i18n/locale";
import type {
  RealInterviewRoundCounts,
  RealInterviewStatusCounts,
} from "./types";

const messages = defineMessages({
  "zh-CN": {
    offerLabel: "Offer 转化率",
    offerHelper: "Offer 岗位 ÷ 至少进入一面的岗位",
    advancementLabel: "面试推进率",
    advancementHelper: "至少进入二面的岗位 ÷ 至少进入一面的岗位",
    completionLabel: "面试完成率",
    completionHelper: "已完成真实面试 ÷ 已完成与已取消记录",
    emptyTitle: "完成第一次训练后，这里会形成总结",
    emptyBody: "当前还没有足够的真实面试或模拟训练记录。完成一次模拟面试或补充历史面试后，工作台会基于真实证据归纳优势和训练重点。继续准备，祝你早日拿到理想 Offer。",
    realCount: (total: number, completed: number) => `已记录 ${total} 场真实面试，其中 ${completed} 场已完成。`,
    reachedSecond: (n: number) => `目前至少有 ${n} 个岗位推进到二面或更后阶段。`,
    reachedFirst: (n: number) => `目前至少有 ${n} 个岗位进入面试阶段。`,
    mockCount: (n: number) => `已完成 ${n} 次模拟训练。`,
    mockCountWithScore: (n: number, score: number) => `已完成 ${n} 次模拟训练，平均 ${score} 分。`,
    strength: (title: string) => `能力画像显示，“${title}”是当前相对稳定的优势。`,
    focus: (title: string) => `下一阶段建议优先关注“${title}”，并结合复盘持续练习。`,
    keepRecording: "建议继续记录回答与复盘证据，让训练重点逐步变得更准确。",
    closing: "保持节奏，继续加油，祝你早日拿到理想 Offer。",
    title: "你的面试进展正在形成可复用经验",
    separator: "",
  },
  en: {
    offerLabel: "Offer rate",
    offerHelper: "Roles with an offer ÷ roles that reached at least a 1st round",
    advancementLabel: "Advancement rate",
    advancementHelper: "Roles that reached at least a 2nd round ÷ roles that reached at least a 1st round",
    completionLabel: "Completion rate",
    completionHelper: "Completed real interviews ÷ completed and canceled records",
    emptyTitle: "Your summary appears after your first practice",
    emptyBody: "There aren't enough real interviews or mock sessions yet. Finish a mock interview or add a past interview, and the workspace will summarize your strengths and practice focus from real evidence. Keep preparing — good luck landing the offer you want.",
    realCount: (total: number, completed: number) => `${total} real interview${total === 1 ? "" : "s"} recorded, ${completed} completed.`,
    reachedSecond: (n: number) => `At least ${n} role${n === 1 ? " has" : "s have"} reached a 2nd round or later.`,
    reachedFirst: (n: number) => `At least ${n} role${n === 1 ? " has" : "s have"} reached the interview stage.`,
    mockCount: (n: number) => `${n} mock session${n === 1 ? "" : "s"} completed.`,
    mockCountWithScore: (n: number, score: number) => `${n} mock session${n === 1 ? "" : "s"} completed, averaging ${score}.`,
    strength: (title: string) => `Your profile shows "${title}" as a fairly stable strength.`,
    focus: (title: string) => `Next, focus on "${title}" and keep practicing with your reviews.`,
    keepRecording: "Keep recording answers and review evidence so your practice focus gets sharper over time.",
    closing: "Keep the pace — good luck landing the offer you want.",
    title: "Your interviews are turning into reusable experience",
    separator: " ",
  },
});

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
  locale: Locale = "zh-CN",
): RatioMetric[] {
  const t = messages[locale];
  const concluded =
    realInterviewCounts.completed + realInterviewCounts.canceled;

  return [
    {
      key: "offer",
      label: t.offerLabel,
      numerator: progress.offer,
      denominator: progress.firstInterview,
      value: ratio(progress.offer, progress.firstInterview),
      helper: t.offerHelper,
    },
    {
      key: "advancement",
      label: t.advancementLabel,
      numerator: progress.secondInterview,
      denominator: progress.firstInterview,
      value: ratio(progress.secondInterview, progress.firstInterview),
      helper: t.advancementHelper,
    },
    {
      key: "completion",
      label: t.completionLabel,
      numerator: realInterviewCounts.completed,
      denominator: concluded,
      value: ratio(realInterviewCounts.completed, concluded),
      helper: t.completionHelper,
    },
  ];
}

export function buildInterviewHistorySummary({
  realInterviewCounts,
  completedMockCount,
  averageMockScore,
  progress,
  insights,
}: HistorySummaryInput, locale: Locale = "zh-CN"): { title: string; body: string; dataSufficient: boolean } {
  const t = messages[locale];
  const hasHistory =
    realInterviewCounts.total > 0 || completedMockCount > 0 || progress.firstInterview > 0;

  if (!hasHistory) {
    return { title: t.emptyTitle, body: t.emptyBody, dataSufficient: false };
  }

  const parts: string[] = [];
  if (realInterviewCounts.total > 0) {
    parts.push(t.realCount(realInterviewCounts.total, realInterviewCounts.completed));
  }
  if (progress.secondInterview > 0) {
    parts.push(t.reachedSecond(progress.secondInterview));
  } else if (progress.firstInterview > 0) {
    parts.push(t.reachedFirst(progress.firstInterview));
  }
  if (completedMockCount > 0) {
    parts.push(
      averageMockScore === null
        ? t.mockCount(completedMockCount)
        : t.mockCountWithScore(completedMockCount, averageMockScore),
    );
  }

  const strength = insights.find((insight) => insight.kind === "strength");
  const focus = insights.find(
    (insight) => insight.kind === "training_focus" || insight.kind === "weakness",
  );
  if (strength) parts.push(t.strength(strength.title));
  parts.push(focus ? t.focus(focus.title) : t.keepRecording);
  parts.push(t.closing);

  return {
    title: t.title,
    body: parts.join(t.separator),
    dataSufficient: true,
  };
}
