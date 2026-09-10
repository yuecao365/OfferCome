import type { AreaKind, InterviewArea, RubricItem } from "./brief";
import type { MessageState, ThreadState } from "./state";

/**
 * 线程 → 对话段。关闭线程时由代码确定性地切出：
 * 题目 = 切入问题 + 追问，回答 = 候选人在该线程内的全部实质回答（插话不算）。这一段写成 InterviewQuestion，评分、复盘、画像照旧。
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
    skipped: thread.status === "skipped" || answer.length === 0,
    probeCount: probes.length,
    answerSeconds: timed.length > 0 ? Math.round(timed.reduce((sum, value) => sum + value, 0) / 1000) : null,
  };
}

/** 切段写成兼容题目时的过程信号，评分与报告页读它（本地版存 generationMetadataJson）。 */
export type SegmentMetadata = {
  areaId: string;
  areaName: string | null;
  areaKind: AreaKind | null;
  areaStyle: string | null;
  /** 溯源：这段考的是 JD 明确要求的，还是技能包补的岗位常见要求。 */
  competencyOrigin: "jd" | "baseline" | null;
  skillPack: string | null;
  note: string | null;
  depth: number;
  probeCount: number;
  hinted: boolean;
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

export function categoryForArea(area: Pick<InterviewArea, "kind"> | null): string {
  if (area?.kind === "project") return "resume_project";
  if (area?.kind === "behavioral") return "general";
  return "technical";
}

export function segmentRecord(area: InterviewArea | null, thread: ThreadState, segment: ThreadSegment): SegmentRecord {
  return {
    question: segment.question,
    answer: segment.skipped ? null : segment.answer,
    skipped: segment.skipped,
    category: categoryForArea(area),
    sourceKind: area?.kind ?? "technical",
    rubric: area?.rubric ?? [],
    expectedSignals: area?.expectedSignals ?? [],
    metadata: {
      areaId: thread.areaId,
      areaName: area?.name ?? null,
      areaKind: area?.kind ?? null,
      areaStyle: area?.style ?? null,
      competencyOrigin: !area ? null : area.competencyIds.length > 0 ? "jd" : area.baseline ? "baseline" : null,
      skillPack: area?.baseline?.skill ?? null,
      note: thread.note,
      depth: thread.depth,
      probeCount: segment.probeCount,
      hinted: thread.hinted,
      answerSeconds: segment.answerSeconds,
    },
  };
}

/** 给提示词看的已结束线程摘要：不带原文，只带判断。 */
export function closedThreadSummary(thread: ThreadState, areaName: string): string {
  const verdict = thread.status === "skipped" ? thread.note ?? "候选人跳过" : thread.note ?? "已结束";
  return `- ${areaName}（${thread.depth} 层追问）：${verdict}`;
}
