import assert from "node:assert/strict";
import test from "node:test";

import { loadSkillPacks, parseSkillMarkdown } from "./loader";

test("parses frontmatter fields and body from SKILL.md", () => {
  const pack = parseSkillMarkdown(`---
name: backend-java
description: Java 出题。
keywords: [java, spring]
layer: stack
parent: backend
---

## 出题原则
内容`);
  assert.equal(pack?.name, "backend-java");
  assert.deepEqual(pack?.keywords, ["java", "spring"]);
  assert.equal(pack?.layer, "stack");
  assert.equal(pack?.parent, "backend");
  assert.equal(pack?.body.startsWith("## 出题原则"), true);
});

test("rejects invalid names, missing layers, and orphan stacks", () => {
  assert.equal(parseSkillMarkdown("没有 frontmatter"), null);
  assert.equal(
    parseSkillMarkdown(`---\nname: Bad Name\ndescription: x\nlayer: base\n---\nbody`),
    null,
  );
  assert.equal(
    parseSkillMarkdown(`---\nname: a\ndescription: x\nlayer: stack\n---\nbody`),
    null,
  );
});

test("loads the bundled packs with intact parent links", async () => {
  const packs = await loadSkillPacks();
  const names = new Set(packs.map((pack) => pack.name));
  assert.equal(names.has("project-deep-dive"), true);
  assert.equal(names.has("backend"), true);
  assert.equal(names.has("backend-java"), true);
  for (const pack of packs) {
    if (pack.parent) assert.equal(names.has(pack.parent), true);
    assert.equal(pack.body.length > 100, true);
  }
});
