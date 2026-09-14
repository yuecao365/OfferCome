import { THREAD_VERDICT_LABELS, type ThreadVerdict } from "./actions";
import { AREA_KIND_LABELS, HR_ROUND, rubricForArea, type AreaKind, type InterviewArea, type RubricItem } from "./brief";
import type { MessageState, ThreadState } from "./state";

/**
 * 线程 → 对话段。离开话题时由代码确定性地切出：
 * 题目 = 进入时的第一问 + 之后的每一问，回答 = 候选人在该话题内说的全部话。这一段写成 InterviewQuestion，评分、复盘、画像照旧。
 */

export type ThreadSegment = {
  question: string;
  answer: string;
  skipped: boolean;
  probeCount: number;
  /** 候选人在这条线程里的作答总时长（秒）；没有记录时为 null。只作辅助信号。 */
  answerSeconds: number | null;
};

export function threadSegment(thread: ThreadState, messages: MessageState[]): ThreadSegment {
  const own = messages.filter((message) => message.threadId === thread.id);
  const probes = own.filter((message) => message.role === "interviewer" && message.kind === "probe");
  const answers = own.filter((message) => message.role === "candidate" && message.kind === "answer");
  const answerText = answers.map((message) => message.content.trim()).filter(Boolean);
  const question = [
    thread.entryQuestion.trim(),
    ...probes.map((probe, index) => `追问 ${index + 1}：${probe.content.trim()}`),
  ].join("\n");
  const answer = answerText.join("\n\n");
  const timed = answers.map((message) => message.metrics?.composeMs ?? null).filter((value): value is number => value !== null);
  return {
    question,
    answer,
    skipped: thread.verdict === "skipped" || answer.length === 0,
    probeCount: probes.length,
    answerSeconds: timed.length > 0 ? Math.round(timed.reduce((sum, value) => sum + value, 0) / 1000) : null,
  };
}

/** 切段写成兼容题目时的过程信号，评分与报告页读它（本地版存 generationMetadataJson）。 */
export type SegmentMetadata = {
  areaId: string;
  areaName: string | null;
  areaKind: AreaKind | null;
  /** 溯源：这段考的是 JD 明确要求的（场景题），还是技能包里的岗位常见考点（基础题）。 */
  competencyOrigin: "jd" | "baseline" | null;
  skillPack: string | null;
  note: string | null;
  depth: number;
  probeCount: number;
  /** 面试官离开话题时对这段的判断；没交代就换了话题的为 null。 */
  verdict: ThreadVerdict | null;
  answerSeconds: number | null;
};

/** 一条线程压成的"题 + 答"：本地版写 InterviewQuestion + Evaluation，体验版存进会话文档。 */
export type SegmentRecord = {
  question: string;
  answer: string | null;
  skipped: boolean;
  category: string;
  sourceKind: AreaKind;
  rubric: RubricItem[];
  expectedSignals: string[];
  metadata: SegmentMetadata;
};

/** 兼容层题目的分类：项目题、HR 面的软素质题、技术题（复盘页按它筛）。 */
export function categoryForKind(kind: AreaKind, round: string | null): string {
  if (kind === "project") return "resume_project";
  if (round === HR_ROUND) return "general";
  return "technical";
}

/** 话题对应简报里的材料时用材料的评分表与期望信号；计划外的话题按种类用固定评分表。 */
export function segmentRecord(area: InterviewArea | null, thread: ThreadState, segment: ThreadSegment, round: string | null): SegmentRecord {
  return {
    question: segment.question,
    answer: segment.skipped ? null : segment.answer,
    skipped: segment.skipped,
    category: categoryForKind(thread.kind, round),
    sourceKind: thread.kind,
    rubric: area?.rubric ?? rubricForArea(thread.kind, round),
    expectedSignals: area?.expectedSignals ?? [],
    metadata: {
      areaId: thread.areaId ?? thread.id,
      areaName: thread.label,
      areaKind: thread.kind,
      competencyOrigin: !area ? null : area.jdEvidence ? "jd" : area.topic ? "baseline" : null,
      skillPack: area?.topic?.skill ?? null,
      note: thread.note,
      depth: thread.depth,
      probeCount: segment.probeCount,
      verdict: thread.verdict,
      answerSeconds: segment.answerSeconds,
    },
  };
}

/** 给提示词看的已结束话题摘要：不带原文，只带判断。 */
export function closedThreadSummary(thread: ThreadState): string {
  const verdict = thread.verdict ? `，${THREAD_VERDICT_LABELS[thread.verdict]}` : "";
  return `- ${thread.label}（${AREA_KIND_LABELS[thread.kind]}，问了 ${thread.depth + 1} 轮${verdict}）：${thread.note ?? "已结束"}`;
}
