import assert from "node:assert/strict";
import test from "node:test";

import { loadSkillPacks } from "./loader";
import { rankSkillPacks, recommendSkillPacks, selectSkillIndex, SKILL_INDEX_LIMIT } from "./selector";

const javaBackend = {
  jobTitle: "后端开发工程师",
  jobDescription: "负责业务系统开发。",
  resumeText: "熟悉 Java、Spring Boot、MySQL，做过订单系统。",
};

test("index keeps base packs first, puts the resume's stack right after its domain, and respects the limit", async () => {
  const packs = await loadSkillPacks();
  const index = selectSkillIndex(javaBackend, packs);
  const names = index.map((pack) => pack.name);
  const baseCount = packs.filter((pack) => pack.layer === "base").length;
  assert.ok(index.length <= SKILL_INDEX_LIMIT);
  assert.deepEqual(
    names.slice(0, baseCount),
    packs.filter((pack) => pack.layer === "base").map((pack) => pack.name),
  );
  assert.ok(names.indexOf("backend") < names.indexOf("backend-java"), "父级领域包排在栈包前面");
  assert.ok(names.indexOf("backend-java") < baseCount + 3, "简历命中的栈包靠前");
});

test("ranking never drops packs, so the agent can still load a pack the keywords missed", async () => {
  const packs = await loadSkillPacks();
  assert.equal(rankSkillPacks(javaBackend, packs).length, packs.length);
});

test("legacy recommendation: resume stack pulls in its parent domain and caps stacks at two", async () => {
  const packs = await loadSkillPacks();
  const recommended = recommendSkillPacks(javaBackend, packs);
  assert.ok(recommended.includes("backend"));
  assert.ok(recommended.includes("backend-java"));

  const mixed = recommendSkillPacks(
    {
      jobTitle: "全栈工程师",
      jobDescription: "React 前端 + Go 服务端 + Java 中间件维护",
      resumeText: "React、Vue、Go、Java 都写过",
    },
    packs,
  );
  const stacks = mixed.filter((name) => packs.find((pack) => pack.name === name)?.layer === "stack");
  assert.equal(stacks.length, 2);
});

test("legacy recommendation falls back to cs-fundamentals when nothing matches", async () => {
  const packs = await loadSkillPacks();
  const recommended = recommendSkillPacks(
    { jobTitle: "xyzzy", jobDescription: "无", resumeText: "无" },
    packs,
  );
  assert.ok(recommended.includes("cs-fundamentals"));
  assert.equal(recommended.some((name) => packs.find((pack) => pack.name === name)?.layer === "stack"), false);
});
