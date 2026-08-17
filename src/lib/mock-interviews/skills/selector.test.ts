import assert from "node:assert/strict";
import test from "node:test";

import { loadSkillPacks } from "./loader";
import { recommendSkillPacks } from "./selector";

test("resume tech stack drives stack selection and pulls in the parent domain", async () => {
  const packs = await loadSkillPacks();
  const recommended = recommendSkillPacks(
    {
      jobTitle: "后端开发工程师",
      jobDescription: "负责业务系统开发。",
      resumeText: "熟悉 Java、Spring Boot、MySQL，做过订单系统。",
    },
    packs,
  );
  assert.deepEqual(recommended, ["project-deep-dive", "backend", "backend-java"]);
});

test("falls back to cs-fundamentals when nothing matches", async () => {
  const packs = await loadSkillPacks();
  const recommended = recommendSkillPacks(
    { jobTitle: "产品经理", jobDescription: "无", resumeText: "无" },
    packs,
  );
  assert.deepEqual(recommended, ["project-deep-dive", "cs-fundamentals"]);
});

test("caps stacks at two even when many keywords hit", async () => {
  const packs = await loadSkillPacks();
  const recommended = recommendSkillPacks(
    {
      jobTitle: "全栈工程师",
      jobDescription: "React 前端 + Go 服务端 + Java 中间件维护",
      resumeText: "React、Vue、Go、Java 都写过",
    },
    packs,
  );
  const stacks = recommended.filter((name) =>
    ["backend-java", "backend-go", "frontend-react", "frontend-vue"].includes(name),
  );
  assert.equal(stacks.length, 2);
  assert.equal(recommended.includes("project-deep-dive"), true);
});
