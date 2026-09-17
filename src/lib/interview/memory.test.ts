import assert from "node:assert/strict";
import test from "node:test";

import { estimate } from "./estimator";
import { decay, memoryOf, priorsFrom, type InterviewMemory } from "./memory";

const now = new Date("2026-09-15T00:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

const memory: InterviewMemory = {
  sessions: 2,
  competencies: [
    { competencyId: "c1", mean: 0.8, confidence: 0.6, samples: 5, at: daysAgo(30) },
    { competencyId: "c1", mean: 0.6, confidence: 0.5, samples: 2, at: daysAgo(0) },
  ],
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

test("快照里的记忆：没有或坏的按空", () => {
  assert.equal(memoryOf(null).sessions, 0);
  assert.equal(memoryOf("{oops").sessions, 0);
  assert.equal(memoryOf(JSON.stringify({ memory })).competencies.length, 2);
});
