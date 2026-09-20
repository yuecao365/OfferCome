import { rubricForArea, type AreaKind, type InterviewArea, type RubricItem } from "@/lib/mock-interviews/brief/brief";
import type { ThreadVerdict } from "@/lib/mock-interviews/verdicts";

import type { Segment } from "./cut";

/**
 * 一段 → 兼容题目（InterviewQuestion + Evaluation 行）：让原有的逐题评分、复盘、画像链路不用改就能消费。
 * 题目 = 第一问 + "追问 n：…"；回答 = 候选人在这段里的话；评分表与期望信号取对应材料的。判断（verdict / difficulty / competencyId）由评分写回线程。
 */

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

/** 写进 generationMetadataJson 的过程信号：评分按阶段的方法与达到的深度给分，报告按它解释这段。 */
export type SegmentMetadata = {
  areaId: string | null;
  areaName: string;
  areaKind: AreaKind;
  competencyOrigin: "jd" | "baseline" | null;
  /** 问过的角度（材料 guides 的文字）、材料的全部角度。 */
  facets: string[];
  facetsAll: string[];
  depth: number;
  probeCount: number;
  verdict: ThreadVerdict;
  startSeq: number;
  endSeq: number;
};

export function categoryForKind(kind: AreaKind): string {
  if (kind === "project") return "resume_project";
  return kind === "scenario" ? "system_design" : "technical";
}

export function segmentRecord(area: InterviewArea, segment: Segment): SegmentRecord {
  const question = [segment.entryQuestion, ...segment.probes.map((probe, index) => `追问 ${index + 1}：${probe}`)].join("\n");
  const answer = segment.answers.join("\n\n").trim();
  return {
    question,
    answer: answer || null,
    // 一句没答、只按了跳过、或每句都是"我不会"：不评分。
    skipped: segment.skipped || segment.unanswered || !answer,
    category: categoryForKind(segment.kind),
    sourceKind: segment.kind,
    rubric: area.rubric.length > 0 ? area.rubric : rubricForArea(segment.kind),
    expectedSignals: area.expectedSignals,
    metadata: {
      areaId: segment.areaId,
      areaName: segment.label,
      areaKind: segment.kind,
      competencyOrigin: area.jdEvidence ? "jd" : "baseline",
      facets: segment.facets,
      facetsAll: segment.allFacets,
      depth: segment.depth,
      probeCount: segment.probes.length,
      verdict: segment.skipped || !answer ? "skipped" : segment.unanswered ? "failed" : "answered",
      startSeq: segment.startSeq,
      endSeq: segment.endSeq,
    },
  };
}
