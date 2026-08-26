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

const generationMetadataSchema = z.object({
  jobCompetencyId: z.string().optional(),
  jdEvidence: z.string().optional(),
  rationale: z.string().optional(),
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

  return {
    competencyName: competency?.name ?? null,
    competencyOrigin: competency?.origin ?? null,
    sourceUrl: competency?.sourceUrl ?? null,
    jdEvidence: metadata.success ? metadata.data.jdEvidence ?? null : null,
    expectedSignals: expectedSignals.success ? expectedSignals.data : [],
    rationale: metadata.success ? metadata.data.rationale ?? null : null,
    sourceKind: evaluation.sourceKind,
    difficulty: evaluation.difficulty,
  };
}
