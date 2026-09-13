import assert from "node:assert/strict";
import test from "node:test";

import { loadSkillPacks } from "./loader";
import { packsForInterview, packsForTopics, rankSkillPacks } from "./selector";

const javaBackend = {
  jobTitle: "后端开发工程师",
  jobDescription: "负责业务系统开发。",
  resumeText: "熟悉 Java、Spring Boot、MySQL，做过订单系统。",
};

test("ranking keeps base packs first, puts the resume's stack right after its domain, and never drops packs", async () => {
  const packs = await loadSkillPacks();
  const ranked = rankSkillPacks(javaBackend, packs);
  const names = ranked.map((pack) => pack.name);
  const baseCount = packs.filter((pack) => pack.layer === "base").length;
  assert.equal(ranked.length, packs.length);
  assert.deepEqual(
    names.slice(0, baseCount),
    packs.filter((pack) => pack.layer === "base").map((pack) => pack.name),
  );
  assert.ok(names.indexOf("backend") < names.indexOf("backend-java"), "父级领域包排在栈包前面");
  assert.ok(names.indexOf("backend-java") < baseCount + 3, "简历命中的栈包靠前");
});

test("the job decides the domain: a backend resume applying to a frontend job still gets the frontend pack first", async () => {
  const packs = await loadSkillPacks();
  const names = rankSkillPacks(
    {
      jobTitle: "前端开发工程师",
      jobDescription: "负责小程序与 Web 前端开发，熟悉浏览器渲染、性能优化、工程化。",
      resumeText: "熟悉 Java、Spring Boot、MySQL、Redis、RabbitMQ，做过订单系统与 RAG 问答机器人。",
    },
    packs,
  ).map((pack) => pack.name);
  const baseCount = packs.filter((pack) => pack.layer === "base").length;
  assert.equal(names[baseCount], "frontend", "岗位对应的领域包排在最前");
});

test("topic packs: the job's domain pack comes first, one resume stack follows with its parent, HR rounds only use behavioral", async () => {
  const packs = await loadSkillPacks();
  assert.deepEqual(packsForTopics(javaBackend, packs, "first_interview").map((pack) => pack.name), ["backend", "backend-java"]);
  // Agent 岗 + Python 简历：领域包是 ai-llm，栈包只补一个，父级 backend 跟着进来但排在后面。
  const agent = packsForTopics(
    { jobTitle: "Agent开发工程师 - 豆包", jobDescription: "负责 Agent 技术研发，Memory 机制、RAG、工具调用；熟练掌握 Python/Java/Go 至少一门语言。", resumeText: "Python 写的 Agent Harness，FastAPI 服务。" },
    packs,
    "first_interview",
  ).map((pack) => pack.name);
  assert.equal(agent[0], "ai-llm");
  assert.equal(agent.filter((name) => packs.find((pack) => pack.name === name)?.layer === "stack").length, 1);
  assert.deepEqual(packsForTopics(javaBackend, packs, "hr_interview").map((pack) => pack.name), ["behavioral"]);
});

test("topic packs fall back to cs-fundamentals when nothing matches", async () => {
  const packs = await loadSkillPacks();
  const names = packsForTopics({ jobTitle: "xyzzy", jobDescription: "无", resumeText: "无" }, packs, null).map((pack) => pack.name);
  assert.deepEqual(names, ["cs-fundamentals"]);
});

test("packs for the interview follow the brief order and bring in parents", async () => {
  const packs = await loadSkillPacks();
  const names = packsForInterview(["backend-java", "project-deep-dive"], packs).map((pack) => pack.name);
  assert.deepEqual(names, ["backend", "backend-java", "project-deep-dive"]);
});
