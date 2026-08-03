import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRoleTitle, roleContextKey } from "./role-context";

test("groups deterministic seniority variants without an LLM", () => {
  assert.equal(normalizeRoleTitle("高级 前端开发工程师"), "前端开发工程师");
  assert.equal(normalizeRoleTitle("Senior 前端开发工程师"), "前端开发工程师");
  assert.equal(roleContextKey("高级 前端开发工程师"), roleContextKey("Senior 前端开发工程师"));
});

test("does not silently merge different role families", () => {
  assert.notEqual(roleContextKey("前端开发工程师"), roleContextKey("后端开发工程师"));
});
