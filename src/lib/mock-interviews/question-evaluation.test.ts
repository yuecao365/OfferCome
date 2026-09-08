import assert from "node:assert/strict";
import test from "node:test";

import {
  parseQuestionEvaluationInput,
  parseStoredEvaluationList,
  quoteInAnswer,
  stripUnverifiedNumbers,
  validateQuestionEvaluation,
  type MockInterviewQuestionEvaluation,
} from "./question-evaluation";

const answer = "主循环是上下文构建、LLM 推理、工具调用、结果回传、最终回复五段。校验失败把结构化错误回传给模型自纠，最多重试两次。";

const output: MockInterviewQuestionEvaluation = {
  dimensions: [
    { name: "技术正确性", score: 80, evidence: "五段主循环", gap: null },
    { name: "不存在的维度", score: 100, evidence: "模型臆造", gap: null },
    { name: "技术正确性", score: 90, evidence: "重复", gap: null },
  ],
  strengths: [
    { point: "说清了主循环分段", quote: "上下文构建、LLM 推理、工具调用" },
    { point: "引用不在回答里", quote: "我们用了 Kafka" },
  ],
  weaknesses: [
    { point: "重试上限说错", quote: "最多重试两次", kind: "error" },
    { point: "第二层追问没答", quote: null, kind: "missing" },
  ],
  advice: ["练一遍工具协议的失败路径"],
  feedback: "主干清楚。",
};

test("parses only valid rubric and expected signal inputs", () => {
  const parsed = parseQuestionEvaluationInput({
    rubric: [{ name: "技术正确性", description: "准确", weight: 60 }],
    expectedSignals: ["说明边界"],
  });
  assert.equal(parsed.rubric.length, 1);
  assert.deepEqual(parsed.expectedSignals, ["说明边界"]);
});

test("keeps only rubric dimensions and blanks quotes that are not in the answer", () => {
  const { evaluation, metrics } = validateQuestionEvaluation(output, [{ name: "技术正确性" }], answer, 80);
  assert.deepEqual(evaluation.dimensions.map((item) => item.name), ["技术正确性"]);
  assert.equal(evaluation.strengths[0].quote, "上下文构建、LLM 推理、工具调用");
  assert.equal(evaluation.strengths[1].quote, null);
  assert.equal(evaluation.weaknesses[0].quote, "最多重试两次");
  assert.equal(evaluation.weaknesses[1].quote, null);
  assert.deepEqual(metrics, { quoteMissing: 1, unexplainedLowScore: 0 });
});

test("a low score without any weakness is flagged", () => {
  const { metrics } = validateQuestionEvaluation({ ...output, weaknesses: [] }, [{ name: "技术正确性" }], answer, 55);
  assert.equal(metrics.unexplainedLowScore, 1);
});

test("quote matching ignores case and whitespace but needs at least four characters", () => {
  assert.ok(quoteInAnswer(answer, "llm  推理"));
  assert.ok(!quoteInAnswer(answer, "推理"));
  assert.ok(!quoteInAnswer(answer, null));
});

test("stored strengths from v1 (strings) and v2 (objects) both read back", () => {
  const items = parseStoredEvaluationList<{ point: string; quote: string | null }>(
    ["旧的字符串", { point: "新的对象", quote: "原话" }, 3, ""],
    (point) => ({ point, quote: null }),
  );
  assert.deepEqual(items, [
    { point: "旧的字符串", quote: null },
    { point: "新的对象", quote: "原话" },
  ]);
});

test("numbers the résumé and answer cannot back are stripped from the exemplar", () => {
  const stripped = stripUnverifiedNumbers("命中率从 98% 掉到 60%，QPS 大约 5000，重试两次", ["简历：命中率 98%", "回答：最多重试两次"]);
  assert.equal(stripped.removed, 2);
  assert.equal(stripped.text, "命中率从 98% 掉到 ……，QPS 大约 ……，重试两次");
});
