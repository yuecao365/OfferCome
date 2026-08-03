import assert from "node:assert/strict";
import test from "node:test";

import {
  BOSS_CONTACT_SELECTORS,
  buildBossContactExtractionExpression,
} from "./extract-expression";

test("builds a browser expression without tsx helper references", () => {
  const expression = buildBossContactExtractionExpression(BOSS_CONTACT_SELECTORS);

  assert.ok(expression.includes("document.querySelectorAll"));
  assert.ok(expression.includes("companyNames"));
  assert.equal(expression.includes("__name"), false);
});
