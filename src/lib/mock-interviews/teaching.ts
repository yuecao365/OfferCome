import { z } from "zod";

import type { MockInterviewQuestionTeaching } from "./types";

const snapshotSchema = z.object({
  jobBlueprint: z
    .object({
      competencies: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
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

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function buildQuestionTeaching(
  contextSnapshotJson: string,
  evaluation: {
    expectedSignalsJson: string;
    generationMetadataJson: string;
    sourceKind: string;
    difficulty: string;
  },
): MockInterviewQuestionTeaching {
  const snapshot = snapshotSchema.safeParse(parseJson(contextSnapshotJson));
  const metadata = generationMetadataSchema.safeParse(
    parseJson(evaluation.generationMetadataJson),
  );
  const expectedSignals = expectedSignalsSchema.safeParse(
    parseJson(evaluation.expectedSignalsJson),
  );
  const competencyId = metadata.success
    ? metadata.data.jobCompetencyId
    : undefined;
  const competencyName =
    snapshot.success && competencyId
      ? snapshot.data.jobBlueprint?.competencies.find(
          (competency) => competency.id === competencyId,
        )?.name ?? null
      : null;

  return {
    competencyName,
    jdEvidence: metadata.success ? metadata.data.jdEvidence ?? null : null,
    expectedSignals: expectedSignals.success ? expectedSignals.data : [],
    rationale: metadata.success ? metadata.data.rationale ?? null : null,
    sourceKind: evaluation.sourceKind,
    difficulty: evaluation.difficulty,
  };
}
