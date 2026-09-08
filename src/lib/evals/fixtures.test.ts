import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  JD_DIRECTIONS,
  loadCandidateScripts,
  loadJdFixtures,
  loadPersonas,
  loadResumeText,
  loadScorerCases,
  personaSchema,
  writeFixture,
} from "./fixtures";

/**
 * 数据集自检：每条 JD 按 schema 解析、id 与文件名一致、方向齐全；
 * 静态脚本与冻结的人设 / 评分器用例都能加载。改坏一条 fixture 立刻在这里失败。
 */

const fixtures = loadJdFixtures();

test("the JD dataset is large enough and covers every direction", () => {
  assert.ok(fixtures.length >= 30, `只有 ${fixtures.length} 条 JD`);
  const directions = new Set(fixtures.map((jd) => jd.direction));
  for (const direction of JD_DIRECTIONS) assert.ok(directions.has(direction), `缺少方向 ${direction}`);
  assert.equal(new Set(fixtures.map((jd) => jd.id)).size, fixtures.length, "id 重复");
});

test("real postings keep both sections and are long enough", () => {
  for (const jd of fixtures.filter((item) => item.status !== "synthetic")) {
    assert.ok(jd.jobDescription.includes("职位描述"), `${jd.id} 缺职位描述段`);
    assert.ok(jd.jobDescription.includes("职位要求"), `${jd.id} 缺职位要求段`);
    assert.ok(jd.jobDescription.length >= 80, `${jd.id} 短于 80 字`);
    assert.match(jd.source, /^https?:\/\//, `${jd.id} 缺来源链接`);
  }
});

test("the synthetic resume reads like a resume", () => {
  const text = loadResumeText("synthetic-backend");
  assert.ok(text.includes("项目经历"));
  assert.ok(text.length > 800);
});

test("static scripts, personas and scorer cases load and reference known JDs and resumes", () => {
  const ids = new Set(fixtures.map((jd) => jd.id));
  const scripts = loadCandidateScripts();
  assert.ok(scripts.length >= 4, "至少四份静态脚本");
  for (const script of [...scripts, ...loadPersonas()]) {
    assert.ok(ids.has(script.jd), `${script.id} 引用了不存在的 JD ${script.jd}`);
    assert.ok(loadResumeText(script.resume).length > 0);
  }
  const injection = scripts.find((script) => script.id === "injection");
  assert.ok(injection?.canary, "注入脚本要带 canary");
  assert.ok(injection!.messages.some((message) => message.content?.includes(injection!.canary!)), "canary 要在消息里");
  for (const item of loadScorerCases()) {
    assert.ok(item.answers.err.includes(item.truth.wrongClaim), `${item.id} 的 err 变体没有包含错句`);
    assert.ok(!item.answers.base.includes(item.truth.wrongClaim), `${item.id} 的 base 不该含错句`);
  }
});

test("writeFixture freezes files and refuses to overwrite by default", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "eval-fixtures-"));
  mkdirSync(path.join(root, "personas"));
  const persona = personaSchema.parse({
    id: "p",
    jd: "x",
    resume: "y",
    style: "简洁",
    strong: ["a"],
    weak: { topic: "t", wrongClaim: "一句明确错误的断言", whyWrong: "因为" },
    unsupportable: "降为 0",
  });
  assert.equal(writeFixture("personas", persona, root), true);
  assert.equal(writeFixture("personas", persona, root), false);
  assert.equal(writeFixture("personas", persona, root, true), true);
  assert.equal(loadPersonas(root).length, 1);
  assert.equal(loadPersonas(root)[0].offtopic, false);
  writeFileSync(path.join(root, "personas", "wrong.json"), JSON.stringify({ ...persona, id: "other" }));
  assert.throws(() => loadPersonas(root), /id 与文件名不一致/);
});
