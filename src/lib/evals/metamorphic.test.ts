import assert from "node:assert/strict";
import test from "node:test";

import type { MockInterviewQuestionEvaluation } from "@/lib/mock-interviews/question-evaluation";

import type { ScorerCase } from "./fixtures";
import { insertClaim } from "./generate";
import { judgeScorerCase, locatesWrongClaim, summarizeScorer, textsOverlap, type ScorerCaseResult, type VariantRun } from "./metamorphic";

const CLAIM = "RabbitMQ 的 ack 机制保证消息只会被消费一次，不需要做幂等";

function evaluation(overrides: Partial<MockInterviewQuestionEvaluation> = {}): MockInterviewQuestionEvaluation {
  return { dimensions: [], strengths: [], weaknesses: [], advice: [], feedback: "", ...overrides };
}

function run(score: number, evaluationValue = evaluation(), quoteMissing = 0): VariantRun {
  return { score, evaluation: evaluationValue, metrics: { quoteMissing, unexplainedLowScore: 0 }, durationMs: 1000, totalTokens: 2000 };
}

const scorerCase = {
  id: "c1",
  truth: { wrongClaim: CLAIM, whyWrong: "ack 只保证不丢，不保证不重", droppedMechanism: "x" },
} as ScorerCase;

function result(scores: Partial<Record<keyof ScorerCaseResult["runs"], number[]>>, errEvaluation = evaluation()): ScorerCaseResult {
  const runs = {} as ScorerCaseResult["runs"];
  for (const [variant, values] of Object.entries(scores)) {
    runs[variant as keyof ScorerCaseResult["runs"]] = values!.map((score) => run(score, variant === "err" ? errEvaluation : evaluation()));
  }
  return { caseId: "c1", runs };
}

test("textsOverlap ignores punctuation and quotes and needs a shared run of characters", () => {
  assert.ok(textsOverlap("“RabbitMQ 的 ack 机制保证消息只会被消费一次”", CLAIM));
  assert.ok(!textsOverlap("Redis 的持久化有 RDB 和 AOF", CLAIM));
  assert.ok(!textsOverlap("ack", CLAIM));
});

test("locatesWrongClaim accepts an error quote, a weakness point or a dimension gap that names the claim", () => {
  assert.ok(locatesWrongClaim(evaluation({ weaknesses: [{ point: "对 ack 语义理解有误", quote: "ack 机制保证消息只会被消费一次", kind: "error" }] }), CLAIM));
  assert.ok(locatesWrongClaim(evaluation({ dimensions: [{ name: "技术正确性", score: 40, evidence: "", gap: "认为 ack 保证消息只会被消费一次，不需要做幂等，这是错的" }] }), CLAIM));
  assert.ok(!locatesWrongClaim(evaluation({ weaknesses: [{ point: "没讲清重试策略", quote: null, kind: "missing" }] }), CLAIM));
  // missing 类短板即使引用了错句也不算"指出错误"，除非文字本身点名。
  assert.ok(!locatesWrongClaim(evaluation({ weaknesses: [{ point: "追问没答", quote: "ack 机制保证消息只会被消费一次", kind: "missing" }] }), CLAIM));
});

test("judgeScorerCase checks ordering, paraphrase tolerance, error location and retest spread", () => {
  const good = result(
    { base: [80, 82, 78], drop: [60, 62, 58], fluff: [30, 32, 28], para: [76, 79, 81], offtopic: [15, 12, 18], err: [65, 63, 66] },
    evaluation({ weaknesses: [{ point: "错误", quote: CLAIM, kind: "error" }] }),
  );
  const verdict = judgeScorerCase(scorerCase, good);
  assert.equal(verdict.ordering, true);
  assert.equal(verdict.paraphraseStable, true);
  assert.equal(verdict.errorLocated, true);
  assert.equal(verdict.errorLowered, true);
  assert.ok(verdict.retestStd.base! < 3);

  const bad = result({ base: [70], drop: [75], fluff: [30], para: [50], offtopic: [80], err: [70] });
  const badVerdict = judgeScorerCase(scorerCase, bad);
  assert.equal(badVerdict.ordering, false);
  assert.equal(badVerdict.paraphraseStable, false);
  assert.equal(badVerdict.errorLocated, false);
  assert.equal(badVerdict.errorLowered, false);

  const partial = judgeScorerCase(scorerCase, result({ base: [70] }));
  assert.equal(partial.ordering, null);
  assert.equal(partial.errorLocated, null);
});

test("summarizeScorer aggregates rates, unstable variants and quote metrics", () => {
  const good = result(
    { base: [80, 82], drop: [60, 61], fluff: [30, 31], para: [79, 80], offtopic: [10, 12], err: [50, 52] },
    evaluation({ weaknesses: [{ point: "错误", quote: CLAIM, kind: "error" }] }),
  );
  const shaky = result({ base: [80, 50], drop: [60, 61], fluff: [30, 31], para: [79, 80], offtopic: [10, 12], err: [50, 52] });
  shaky.caseId = "c2";
  const verdicts = [judgeScorerCase(scorerCase, good), judgeScorerCase({ ...scorerCase, id: "c2" }, shaky)];
  const metrics = summarizeScorer(verdicts, [good, shaky]);
  assert.deepEqual(metrics.orderingRate, { value: 1, numerator: 2, denominator: 2 });
  assert.deepEqual(metrics.errorLocatedRate, { value: 0.5, numerator: 1, denominator: 2 });
  assert.deepEqual(metrics.unstable, ["c2/base"]);
  assert.ok(metrics.retestStdMax! > 12);
  assert.equal(metrics.unexplainedLowScoreRate.value, 0);
  assert.ok(metrics.falseErrorRate.denominator > 0 && metrics.errorFlaggedRate.denominator > 0);
  assert.equal(metrics.tokensPerCall, 2000);
});

test("insertClaim puts the claim verbatim in the middle of the base answer", () => {
  const base = "第一句。第二句。第三句。第四句。";
  const inserted = insertClaim(base, CLAIM);
  assert.ok(inserted.includes(`${CLAIM}。`));
  assert.ok(inserted.startsWith("第一句。第二句。"));
  assert.ok(inserted.endsWith("第三句。第四句。"));
  assert.equal(insertClaim("没有句号的回答", "断言"), "没有句号的回答断言。");
});
