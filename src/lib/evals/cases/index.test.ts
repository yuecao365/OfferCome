import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGenerationCases,
  JD_DIRECTIONS,
  loadJdFixtures,
  loadSyntheticResumeText,
} from "./index";

/**
 * 数据集的自检：每条 JD 都能按 schema 解析、id 与文件名一致、方向覆盖齐全、
 * 注入组带 canary、合成简历可读。改坏一条 fixture 立刻在这里失败。
 */

const fixtures = loadJdFixtures();

test("the JD dataset is large enough and covers every direction", () => {
  assert.ok(fixtures.length >= 30, `只有 ${fixtures.length} 条 JD`);
  const directions = new Set(fixtures.map((jd) => jd.direction));
  for (const direction of JD_DIRECTIONS) {
    assert.ok(directions.has(direction), `缺少方向 ${direction}`);
  }
  assert.equal(new Set(fixtures.map((jd) => jd.id)).size, fixtures.length, "id 重复");
});

test("real postings keep both sections and are long enough to skip the review pause", () => {
  for (const jd of fixtures.filter((item) => item.status !== "synthetic")) {
    assert.ok(jd.jobDescription.includes("职位描述"), `${jd.id} 缺职位描述段`);
    assert.ok(jd.jobDescription.includes("职位要求"), `${jd.id} 缺职位要求段`);
    assert.ok(jd.jobDescription.length >= 80, `${jd.id} 短于 80 字会触发 JD 审查暂停`);
    assert.match(jd.source, /^https?:\/\//, `${jd.id} 缺来源链接`);
  }
});

test("injection fixtures carry a canary and the thin JD relaxes the blueprint bar", () => {
  const injections = fixtures.filter((jd) => jd.id.startsWith("edge-injection"));
  assert.ok(injections.length >= 2);
  for (const jd of injections) {
    assert.ok(jd.expect?.canary, `${jd.id} 缺 canary`);
    assert.ok(jd.jobDescription.includes(jd.expect!.canary!), `${jd.id} 的 canary 不在正文里`);
  }
  const thin = fixtures.find((jd) => jd.id === "edge-thin-jd")!;
  assert.equal(thin.expect?.maxBlueprintLevel, 2);
  assert.deepEqual(thin.resumes, ["synthetic-backend"]);
});

test("cases are the JD × resume product, honouring per-fixture resume limits", () => {
  const cases = buildGenerationCases(fixtures);
  const limited = fixtures.filter((jd) => jd.resumes).reduce((sum, jd) => sum + jd.resumes!.length, 0);
  const open = fixtures.filter((jd) => !jd.resumes).length * 2;
  assert.equal(cases.length, limited + open);
  assert.ok(cases.every((item) => item.questionCount === 8));
  const injected = cases.find((item) => item.jd.id === "edge-injection-system-override")!;
  assert.equal(injected.expect.canary, "CANARY-7731");
});

test("the synthetic resume reads like a resume", () => {
  const text = loadSyntheticResumeText("synthetic-backend");
  assert.ok(text.includes("项目经历"));
  assert.ok(text.includes("课程问答助手"));
  assert.ok(text.length > 800);
});
