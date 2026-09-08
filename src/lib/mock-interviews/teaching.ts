import { z } from "zod";

import { parseJsonValue } from "@/lib/json";

import type { MockInterviewQuestionTeaching } from "./types";

const snapshotSchema = z.object({
  jobBlueprint: z
    .object({
      competencies: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          origin: z.enum(["jd", "inferred"]).default("jd"),
          sourceUrl: z.string().nullable().default(null),
        }),
      ),
    })
    .nullable()
    .optional(),
});

/** 旧分步流程写 jobCompetencyId / jdEvidence / rationale；对话式线程写 areaName / areaKind / note。 */
const generationMetadataSchema = z.object({
  jobCompetencyId: z.string().optional(),
  jdEvidence: z.string().optional(),
  rationale: z.string().optional(),
  areaName: z.string().nullable().optional(),
  areaKind: z.string().nullable().optional(),
  areaStyle: z.string().nullable().optional(),
  competencyOrigin: z.enum(["jd", "baseline"]).nullable().optional(),
  skillPack: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  answerSeconds: z.number().nullable().optional(),
});

const expectedSignalsSchema = z.array(z.string());

export function buildQuestionTeaching(
  contextSnapshotJson: string,
  evaluation: {
    expectedSignalsJson: string;
    generationMetadataJson: string;
    sourceKind: string;
    difficulty: string;
  },
): MockInterviewQuestionTeaching {
  const snapshot = snapshotSchema.safeParse(parseJsonValue(contextSnapshotJson));
  const metadata = generationMetadataSchema.safeParse(
    parseJsonValue(evaluation.generationMetadataJson),
  );
  const expectedSignals = expectedSignalsSchema.safeParse(
    parseJsonValue(evaluation.expectedSignalsJson),
  );
  const competencyId = metadata.success
    ? metadata.data.jobCompetencyId
    : undefined;
  const competency =
    snapshot.success && competencyId
      ? snapshot.data.jobBlueprint?.competencies.find(
          (competency) => competency.id === competencyId,
        ) ?? null
      : null;

  const areaName = metadata.success ? metadata.data.areaName ?? null : null;
  return {
    competencyName: competency?.name ?? areaName,
    competencyOrigin: competency?.origin ?? (metadata.success ? metadata.data.competencyOrigin ?? null : null),
    skillPack: metadata.success ? metadata.data.skillPack ?? null : null,
    areaStyle: metadata.success ? metadata.data.areaStyle ?? null : null,
    answerSeconds: metadata.success ? metadata.data.answerSeconds ?? null : null,
    sourceUrl: competency?.sourceUrl ?? null,
    jdEvidence: metadata.success ? metadata.data.jdEvidence ?? null : null,
    expectedSignals: expectedSignals.success ? expectedSignals.data : [],
    rationale: metadata.success ? metadata.data.rationale ?? metadata.data.note ?? null : null,
    sourceKind: evaluation.sourceKind,
    difficulty: evaluation.difficulty,
  };
}
