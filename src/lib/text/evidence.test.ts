import assert from "node:assert/strict";
import test from "node:test";

import { isVerbatimEvidence } from "./evidence";

test("quote-wrapped and prefixed evidence still counts as verbatim", () => {
  const jd = "1、负责 AI 应用后端服务建设，包括接口设计、服务开发、数据处理；\n2、熟悉 Prompt、RAG、Function Calling、MCP 者优先。";
  assert.equal(isVerbatimEvidence(jd, "接口设计、服务开发"), true);
  assert.equal(isVerbatimEvidence(jd, "“接口设计、服务开发、数据处理”"), true);
  assert.equal(isVerbatimEvidence(jd, "该岗位需要“熟悉 Prompt、RAG、Function Calling、MCP 者优先”"), true);
  assert.equal(isVerbatimEvidence(jd, "「数据处理」。"), true);
  // 意译仍然不算逐字。
  assert.equal(isVerbatimEvidence(jd, "“负责智能体后端的搭建”"), false);
  assert.equal(isVerbatimEvidence(jd, "“”"), false);
});
