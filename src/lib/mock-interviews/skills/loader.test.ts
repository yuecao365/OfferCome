import assert from "node:assert/strict";
import test from "node:test";

import { loadSkillPacks, parseSkillMarkdown } from "./loader";

test("parses frontmatter fields and body from SKILL.md", () => {
  const pack = parseSkillMarkdown(`---
name: java
description: Java 怎么面。
keywords: [java, spring]
layer: detail
domains: [backend, ai-agent]
---

## 面试官在意什么
内容`);
  assert.equal(pack?.name, "java");
  assert.deepEqual(pack?.keywords, ["java", "spring"]);
  assert.equal(pack?.layer, "detail");
  assert.deepEqual(pack?.domains, ["backend", "ai-agent"]);
  assert.equal(pack?.body.startsWith("## 面试官在意什么"), true);
});

test("rejects invalid names, missing layers, detail packs without domains, and domain packs with domains", () => {
  assert.equal(parseSkillMarkdown("没有 frontmatter"), null);
  assert.equal(
    parseSkillMarkdown(`---\nname: Bad Name\ndescription: x\nlayer: base\n---\nbody`),
    null,
  );
  assert.equal(
    parseSkillMarkdown(`---\nname: a\ndescription: x\nlayer: detail\n---\nbody`),
    null,
  );
  assert.equal(
    parseSkillMarkdown(`---\nname: a\ndescription: x\nlayer: domain\ndomains: [backend]\n---\nbody`),
    null,
  );
});

test("loads the bundled packs; every detail pack points at existing domain packs", async () => {
  const packs = await loadSkillPacks();
  const names = new Set(packs.map((pack) => pack.name));
  assert.equal(names.has("project-deep-dive"), true);
  assert.equal(names.has("backend"), true);
  assert.equal(names.has("java"), true);
  for (const pack of packs) {
    for (const domain of pack.domains) assert.equal(packs.find((item) => item.name === domain)?.layer, "domain", `${pack.name} → ${domain}`);
    assert.equal(pack.body.length > 100, true);
  }
});
