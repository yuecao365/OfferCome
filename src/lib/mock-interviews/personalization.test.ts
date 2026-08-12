import assert from "node:assert/strict";
import test from "node:test";

import { parsePersonalizationSourceIds } from "./personalization";

test("parsePersonalizationSourceIds preserves snapshot order and removes duplicates", () => {
  assert.deepEqual(
    parsePersonalizationSourceIds(
      JSON.stringify({
        selectedProfileInsightIds: ["insight-2", "insight-1", "insight-2"],
        selectedHistoryQuestionIds: ["question-1"],
      }),
    ),
    {
      profileInsightIds: ["insight-2", "insight-1"],
      historyQuestionIds: ["question-1"],
    },
  );
});

test("parsePersonalizationSourceIds returns empty sources for malformed snapshots", () => {
  assert.deepEqual(parsePersonalizationSourceIds("not-json"), {
    profileInsightIds: [],
    historyQuestionIds: [],
  });
  assert.deepEqual(
    parsePersonalizationSourceIds(
      JSON.stringify({ selectedProfileInsightIds: [false] }),
    ),
    { profileInsightIds: [], historyQuestionIds: [] },
  );
});
