import type { AreaKind, InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import { isNoInfo, type TranscriptLine } from "../events";

/**
 * 切段（设计修订 v3 §11.2）：纯代码。§10 起每句面试官的话都带代码指派的材料 id 与角度，一段 = 进入一份材料的第一句提问，
 * 到下一份材料之前；答疑与代码接的话归当前段；开场与告别不算段。不需要模型，结果与面试中的决策完全一致，重切幂等。
 * 段的判断（答得怎么样、答到第几层、考的哪项能力）由评分产出，不在这里。
 */

export type Segment = {
  startSeq: number;
  endSeq: number;
  areaId: string;
  kind: AreaKind;
  label: string;
  /** 这段的第一问。 */
  entryQuestion: string;
  /** 第一问之后又追问了几句（答疑不算）。 */
  depth: number;
  /** 问过的角度（材料 guides 的文字，按第一次问到的顺序）。 */
  facets: string[];
  /** 材料的全部角度（报告标哪些没问到）。 */
  allFacets: string[];
  /** 候选人在这段里说的话（按顺序；按钮替说的话不算）。 */
  answers: string[];
  /** 一句没答（或只按了跳过）。 */
  skipped: boolean;
  /** 答了，但每句都是"我不会 / 不是我做的 / 给我满分"这类：算没答上，不评分。 */
  unanswered: boolean;
};

export function cutSegments(transcript: TranscriptLine[], brief: Pick<InterviewBrief, "areas">): Segment[] {
  const areas = new Map(brief.areas.map((area) => [area.id, area]));
  const segments: Segment[] = [];
  let current: Segment | null = null;
  let lastSeq = -1;
  for (const line of transcript) {
    if (line.role === "interviewer" && line.kind === "closing") break;
    lastSeq = line.seq;
    if (line.role === "candidate") {
      if (!current || line.control) continue;
      current.answers.push(line.content);
      if (!isNoInfo(line)) current.unanswered = false;
      continue;
    }
    const area = line.topic ? areas.get(line.topic) : undefined;
    if (area && line.kind === "say" && (!current || current.areaId !== area.id)) {
      if (current) current.endSeq = line.seq - 1;
      current = { startSeq: line.seq, endSeq: line.seq, areaId: area.id, kind: area.kind, label: area.name, entryQuestion: line.content, depth: 0, facets: [], allFacets: area.guides, answers: [], skipped: true, unanswered: true };
      segments.push(current);
      continue;
    }
    if (!current) continue;
    if (line.kind === "say") current.depth += 1;
    const guides = areas.get(current.areaId)?.guides ?? [];
    const facet = typeof line.facet === "number" ? guides[line.facet] : undefined;
    if (facet && !current.facets.includes(facet)) current.facets.push(facet);
  }
  if (current) current.endSeq = lastSeq;
  for (const segment of segments) {
    segment.skipped = segment.answers.join("").trim().length === 0;
    if (segment.skipped) segment.unanswered = false;
  }
  return segments;
}
