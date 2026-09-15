import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { estimate } from "./estimator";
import { claimHistory, decay, memoryOf, priorsFrom, type InterviewMemory } from "./memory";

const now = new Date("2026-09-15T00:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

const memory: InterviewMemory = {
  sessions: 2,
  claims: [
    { text: "验证压测", evidence: "压测", status: "refuted", note: "没有讲清楚", at: daysAgo(3) },
    { text: "验证压测", evidence: "压测", status: "confirmed", note: "讲了 QPS 与工具", at: daysAgo(40) },
    { text: "验证数字", evidence: "50%", status: "confirmed", note: null, at: daysAgo(3) },
  ],
  competencies: [
    { competencyId: "c1", mean: 0.8, confidence: 0.6, samples: 5, at: daysAgo(30) },
    { competencyId: "c1", mean: 0.6, confidence: 0.5, samples: 2, at: daysAgo(0) },
  ],
  weaknesses: [
    { point: "缓存一致性只说了名词", quote: "延迟双删", areaName: "缓存一致性", at: daysAgo(3) },
    { point: "缓存一致性没说双写顺序", quote: null, areaName: "缓存一致性", at: daysAgo(3) },
    { point: "没讲清重试上限", quote: null, areaName: "工具调用", at: daysAgo(10) },
  ],
  askedQuestions: [{ text: "先讲主循环里你负责哪一段？", at: daysAgo(3) }],
};

test("衰减：半衰期 30 天；先验按样本数 × 衰减折成伪计数，每场每项最多 3", () => {
  assert.equal(decay(daysAgo(30), now), 0.5);
  assert.equal(decay(daysAgo(0), now), 1);
  const [prior] = priorsFrom(memory, now);
  // 30 天前 5 段 → 3 × 0.5 = 1.5 伪计数 @0.8；今天 2 段 → 2 @0.6。
  assert.equal(prior.competencyId, "c1");
  assert.ok(Math.abs(prior.alpha - (1.5 * 0.8 + 2 * 0.6)) < 1e-9);
  assert.ok(Math.abs(prior.beta - (1.5 * 0.2 + 2 * 0.4)) < 1e-9);
  const withPrior = estimate([{ id: "c1", name: "c1", priority: "core" }], [], priorsFrom(memory, now))[0];
  assert.ok(withPrior.mean > 0.6 && withPrior.mean < 0.7, String(withPrior.mean));
  assert.ok(withPrior.confidence > 0.6);
  assert.equal(withPrior.samples, 0);
});

test("说法的历史：按简历原句对上；前后场结论相反算冲突；没对上的不出现", () => {
  const brief = testBrief({ hypotheses: [{ id: "h1", text: "验证压测", evidence: "压测", projectId: "proj-1" }, { id: "h2", text: "验证数字", evidence: "50%", projectId: "proj-1" }, { id: "h3", text: "验证部署", evidence: "k8s 部署", projectId: "proj-1" }] });
  const histories = claimHistory(brief.hypotheses, memory);
  assert.deepEqual(histories.map((item) => [item.hypothesisId, item.status]), [["h1", "conflict"], ["h2", "confirmed"]]);
});

test("快照里的记忆：没有或坏的按空", () => {
  assert.equal(memoryOf(null).sessions, 0);
  assert.equal(memoryOf("{oops").sessions, 0);
  assert.equal(memoryOf(JSON.stringify({ memory })).claims.length, 3);
});
