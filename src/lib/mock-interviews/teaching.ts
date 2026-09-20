import { z } from "zod";

import type { MockInterviewQuestionTeaching } from "./types";

/** 切段时写进题目的过程信号（interviewer/segments.ts 的 SegmentMetadata），坏数据按缺省处理。 */
const metadataSchema = z.object({
  areaName: z.string().nullable().optional(),
  competencyOrigin: z.enum(["jd", "baseline"]).nullable().optional(),
  answerSeconds: z.number().nullable().optional(),
  facets: z.array(z.string()).optional(),
  facetsAll: z.array(z.string()).optional(),
  verdict: z.string().nullable().optional(),
});

const expectedSignalsSchema = z.array(z.string());

/** 报告页"这道题在考察什么"：领域、来源、期望信号、问过的角度。 */
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
    answerSeconds: data.answerSeconds ?? null,
    expectedSignals: expectedSignals.success ? expectedSignals.data : [],
    sourceKind: input.sourceKind,
    facets: data.facets ?? [],
    facetsAll: data.facetsAll ?? [],
    verdict: data.verdict ?? null,
  };
}
