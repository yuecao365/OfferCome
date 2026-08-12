import assert from "node:assert/strict";
import test from "node:test";

import { canRequestFollowUp, followUpLimit } from "./follow-up-policy";

test("caps follow ups at one per three main questions and three total", () => {
  assert.equal(followUpLimit(2), 0);
  assert.equal(followUpLimit(3), 1);
  assert.equal(followUpLimit(12), 3);
});

test("does not request a duplicate or exceed the session cap", () => {
  assert.equal(canRequestFollowUp({ mainQuestionCount: 6, existingFollowUpCount: 1, hasFollowUpForQuestion: false }), true);
  assert.equal(canRequestFollowUp({ mainQuestionCount: 6, existingFollowUpCount: 2, hasFollowUpForQuestion: false }), false);
  assert.equal(canRequestFollowUp({ mainQuestionCount: 6, existingFollowUpCount: 0, hasFollowUpForQuestion: true }), false);
});
