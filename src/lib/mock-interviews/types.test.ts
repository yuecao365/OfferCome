import assert from "node:assert/strict";
import test from "node:test";

import { storedJobBlueprintSchema } from "./types";

test("parses legacy blueprints with default competency provenance", () => {
  const parsed = storedJobBlueprintSchema.parse({
    summary: "旧快照",
    completeness: "complete",
    missingInformation: [],
    competencies: [
      {
        id: "one",
        name: "能力一",
        description: "描述",
        priority: "core",
        jdEvidence: "依据一",
      },
      {
        id: "two",
        name: "能力二",
        description: "描述",
        priority: "secondary",
        jdEvidence: "依据二",
      },
    ],
  });
  assert.equal(parsed.competencies[0]?.origin, "jd");
  assert.equal(parsed.competencies[0]?.sourceUrl, null);
});
