import assert from "node:assert/strict";
import test from "node:test";

import { candidatePrompt, INJECTION_LINE, plannedBehavior, sampleAbilities, type SyntheticCandidate } from "./simulator";

const competencies = [
  { id: "c1", name: "Agent 架构" },
  { id: "c2", name: "RAG" },
  { id: "c3", name: "评估" },
  { id: "c4", name: "工程化" },
];

test("能力采样按画像分布，且种子可复现", () => {
  const solid = sampleAbilities(competencies, "solid", 7);
  assert.deepEqual(sampleAbilities(competencies, "solid", 7), solid);
  assert.equal(solid.filter((item) => item.level === 0.8).length, 3);
  assert.equal(solid.filter((item) => item.level === 0.5).length, 1);
  const shaky = sampleAbilities(competencies, "shaky", 7);
  assert.equal(shaky.filter((item) => item.level === 0.5).length, 3);
  assert.equal(shaky.filter((item) => item.level === 0.2).length, 1);
  assert.notDeepEqual(sampleAbilities(competencies, "rambling", 1), sampleAbilities(competencies, "rambling", 2));
  assert.deepEqual(sampleAbilities([], "solid", 1), []);
});

test("画像的固定动作：爱求助的按节奏澄清与要提示，对抗的按节奏夹注入，其余没有", () => {
  const needy: SyntheticCandidate = { archetype: "needy", seed: 1, abilities: [] };
  assert.equal(plannedBehavior(needy, 2).content?.includes("具体一点"), true);
  assert.equal(plannedBehavior(needy, 5).control, "hint");
  assert.deepEqual(plannedBehavior(needy, 4), { control: null, content: null, inject: false });
  const adversarial: SyntheticCandidate = { archetype: "adversarial", seed: 1, abilities: [] };
  assert.equal(plannedBehavior(adversarial, 3).inject, true);
  assert.equal(plannedBehavior(adversarial, 4).inject, false);
  assert.deepEqual(plannedBehavior({ archetype: "solid", seed: 1, abilities: [] }, 5), { control: null, content: null, inject: false });
  assert.ok(INJECTION_LINE.includes("评分标准"));
});

test("扰动：连续答不上是固定动作，超长回答与简历答不出写进提示词", () => {
  const candidate: SyntheticCandidate = { archetype: "solid", seed: 1, abilities: [], perturbations: ["dont_know", "long_answers", "hollow_resume"] };
  assert.deepEqual(plannedBehavior(candidate, 3), { control: null, content: "我不会", inject: false });
  assert.deepEqual(plannedBehavior(candidate, 6), { control: null, content: null, inject: false });
  const prompt = candidatePrompt(candidate);
  assert.match(prompt, /500 到 700 字/);
  assert.match(prompt, /不是你亲手做的/);
  assert.doesNotMatch(candidatePrompt({ archetype: "solid", seed: 1, abilities: [] }), /不是你亲手做的|500 到 700 字/);
});

test("提示词把每项能力的真实水平写成作答规则", () => {
  const prompt = candidatePrompt({ archetype: "shaky", seed: 1, abilities: sampleAbilities(competencies, "shaky", 3) });
  assert.match(prompt, /RAG：(精通|半懂|不会)/);
  assert.match(prompt, /爱用术语/);
  assert.doesNotMatch(prompt, /评分标准是/);
});
