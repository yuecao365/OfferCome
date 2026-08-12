import assert from "node:assert/strict";
import test from "node:test";

import { characterNgrams, normalizedText, questionSimilarity } from "./similarity";

test("normalizes text and creates deterministic character ngrams", () => {
  assert.equal(normalizedText("  React   KEY "), "react key");
  assert.deepEqual([...characterNgrams("abcd")], ["abc", "bcd"]);
});

test("detects near-copy questions while allowing different job scenarios", () => {
  assert.ok(questionSimilarity("请详述 Transformer 中自注意力机制的工作原理，以及为何优于传统 RNN。", "Transformer 的 self-attention 工作原理是什么？为什么它比 RNN 更有优势？") > 0.3);
  assert.ok(questionSimilarity("如何设计 Agent Harness 的规模化验证？", "如何通过 Trace 定位长链路工具调用失败？") < 0.4);
});
