import { z } from "zod";

import type { MockInterviewQuestionTeaching } from "./types";

/** 切段时写进题目的过程信号（interviewer/segments.ts 的 SegmentMetadata），坏数据按缺省处理。 */
const metadataSchema = z.object({
  areaName: z.string().nullable().optional(),
  areaStyle: z.string().nullable().optional(),
  competencyOrigin: z.enum(["jd", "baseline"]).nullable().optional(),
  skillPack: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  answerSeconds: z.number().nullable().optional(),
});

const expectedSignalsSchema = z.array(z.string());

/** 报告页"这道题在考察什么"：领域、来源、风格、期望信号、面试官关线程时的判断。 */
export function buildQuestionTeaching(input: {
  metadata: unknown;
  expectedSignals: unknown;
  sourceKind: string;
}): MockInterviewQuestionTeaching {
  const metadata = metadataSchema.safeParse(input.metadata);
  const expectedSignals = expectedSignalsSchema.safeParse(input.expectedSignals);
  const data = metadata.success ? metadata.data : {};
  return {
    areaName: data.areaName ?? null,
    competencyOrigin: data.competencyOrigin ?? null,
    skillPack: data.skillPack ?? null,
    areaStyle: data.areaStyle ?? null,
    answerSeconds: data.answerSeconds ?? null,
    expectedSignals: expectedSignals.success ? expectedSignals.data : [],
    note: data.note ?? null,
    sourceKind: input.sourceKind,
  };
}
