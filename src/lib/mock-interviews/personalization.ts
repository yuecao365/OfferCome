import { z } from "zod";

const personalizationSourceIdsSchema = z.object({
  selectedProfileInsightIds: z.array(z.string()).optional(),
  selectedHistoryQuestionIds: z.array(z.string()).optional(),
});

export type PersonalizationSourceIds = {
  profileInsightIds: string[];
  historyQuestionIds: string[];
};

export function parsePersonalizationSourceIds(
  contextSnapshotJson: string,
): PersonalizationSourceIds {
  try {
    const parsed = personalizationSourceIdsSchema.safeParse(
      JSON.parse(contextSnapshotJson) as unknown,
    );
    if (!parsed.success) {
      return { profileInsightIds: [], historyQuestionIds: [] };
    }

    return {
      profileInsightIds: [...new Set(parsed.data.selectedProfileInsightIds ?? [])],
      historyQuestionIds: [
        ...new Set(parsed.data.selectedHistoryQuestionIds ?? []),
      ],
    };
  } catch {
    return { profileInsightIds: [], historyQuestionIds: [] };
  }
}
