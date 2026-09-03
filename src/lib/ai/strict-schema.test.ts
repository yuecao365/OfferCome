import assert from "node:assert/strict";
import test from "node:test";

import { jsonSchema, zodSchema } from "ai";
import { z } from "zod";

import { findStrictSchemaViolation } from "./strict-schema";

function violation(schema: Parameters<typeof zodSchema>[0]) {
  return findStrictSchemaViolation(zodSchema(schema).jsonSchema);
}

test("accepts schemas whose fields are all required, nullable allowed", () => {
  assert.equal(
    violation(
      z.object({
        summary: z.string(),
        items: z.array(
          z.object({ name: z.string(), url: z.string().nullable() }),
        ),
      }),
    ),
    null,
  );
});

test("flags optional and default fields, including nested array items", () => {
  assert.match(
    violation(z.object({ name: z.string(), note: z.string().optional() }))!,
    /^note 不在 required 里$/,
  );
  assert.match(
    violation(
      z.object({
        items: z.array(z.object({ origin: z.enum(["jd"]).default("jd") })),
      }),
    )!,
    /^items\[\]\.origin/,
  );
  assert.match(
    violation(
      z.object({ items: z.array(z.object({ tag: z.string().nullish() })) }),
    )!,
    /^items\[\]\.tag 不在 required 里$/,
  );
});

test("walks hand-written json schemas too", () => {
  const schema = jsonSchema({
    type: "object",
    properties: { a: { type: "string" }, b: { type: "string" } },
    required: ["a"],
    additionalProperties: false,
  });
  assert.equal(findStrictSchemaViolation(schema.jsonSchema), "b 不在 required 里");
});
