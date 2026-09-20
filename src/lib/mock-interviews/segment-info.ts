import { z } from "zod";

import type { MockInterviewSegmentInfo } from "./types";

/** 切段时写进题目的过程信号（aftermath/segments.ts 的 SegmentMetadata），坏数据按缺省处理。 */
const metadataSchema = z.object({
  areaName: z.string().nullable().optional(),
  verdict: z.string().nullable().optional(),
});

/** 报告页逐段折叠行要的：这段是哪份材料、什么阶段、切段时的判断（没答上 / 跳过）。 */
export function buildSegmentInfo(input: { metadata: unknown; sourceKind: string }): MockInterviewSegmentInfo {
  const metadata = metadataSchema.safeParse(input.metadata);
  const data = metadata.success ? metadata.data : {};
  return { areaName: data.areaName ?? null, kind: input.sourceKind, verdict: data.verdict ?? null };
}
