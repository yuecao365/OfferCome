import assert from "node:assert/strict";
import test from "node:test";

import { loadSkillPacks } from "./loader";
import { skillSection, topicNames, topicOutline, SKILL_SECTIONS } from "./sections";
import { packsForInterview, packsForPrep, stackPackNamedByJob } from "./selector";

/** 重建 v5 §6：包是方法书。备课读岗位的领域包、JD 点名的栈包、项目深挖方法包；简历不决定考什么。 */

test("packs for prep: the job's domain pack, the stack only when the JD names exactly one language, and the project method pack last", async () => {
  const packs = await loadSkillPacks();
  const names = (input: { jobTitle: string; jobDescription: string }, round: string | null = "first_interview") => packsForPrep(input, packs, round).map((pack) => pack.name);
  // 没点名语言的后端岗：只有领域包与方法包，简历用 Java 也不给 Java 包。
  assert.deepEqual(names({ jobTitle: "后端开发工程师", jobDescription: "负责业务系统开发。" }), ["backend", "project-deep-dive"]);
  // JD 罗列几门"至少一门"：不算点名。
  assert.deepEqual(names({ jobTitle: "Agent开发工程师 - 豆包", jobDescription: "负责 Agent 技术研发，Memory 机制、RAG、工具调用；熟练掌握 Python/Java/Go 至少一门语言。" }), ["ai-llm", "project-deep-dive"]);
  // 岗位名点名一门：给它。
  assert.deepEqual(names({ jobTitle: "Go 后端开发", jobDescription: "熟悉 goroutine 与 channel。" }), ["backend", "backend-go", "project-deep-dive"]);
  assert.equal(stackPackNamedByJob({ jobTitle: "后端开发", jobDescription: "Java 或 Go 均可" }, packs), null);
  // HR 面只读行为包与方法包；全无命中退到计算机基础。
  assert.deepEqual(names({ jobTitle: "后端开发工程师", jobDescription: "负责业务系统开发。" }, "hr_interview"), ["behavioral", "project-deep-dive"]);
  assert.deepEqual(names({ jobTitle: "xyzzy", jobDescription: "无" }, null), ["cs-fundamentals", "project-deep-dive"]);
});

test("an agent-harness job picks the agent-harness domain pack; a generic agent-development job still picks ai-llm", async () => {
  const packs = await loadSkillPacks();
  const harness = packsForPrep({ jobTitle: "混元AI Agent Harness Engineer（北京/深圳，TEG）", jobDescription: "参与设计并实现 Agent 执行全链路的 tracing & observability 系统；构建 Agent 质量评估体系：自动化 eval pipeline、A/B testing、regression detection；开发 Agent debugging 工具。使用 Cursor / Claude Code / Codex 等进行重度编程，对 agentic coding 的能力边界和 failure mode 有切身的体感。" }, packs, "first_interview");
  assert.equal(harness[0]?.name, "agent-harness");
  const generic = packsForPrep({ jobTitle: "Agent 开发实习生（AI 产品方向）", jobDescription: "负责 Agent 技术研发，Memory 机制、RAG、工具调用、prompt 优化；熟悉 LLM 与 Agent framework。" }, packs, "first_interview");
  assert.equal(generic[0]?.name, "ai-llm");
});

test("every pack is a method book with the four sections and a topic outline without example questions", async () => {
  const packs = await loadSkillPacks();
  assert.ok(packs.length >= 30);
  for (const pack of packs) {
    for (const heading of Object.values(SKILL_SECTIONS)) assert.ok(skillSection(pack, heading).length > 0, `${pack.name} 缺「${heading}」`);
    assert.ok(topicNames(pack).length >= 8, `${pack.name} 主题清单太短`);
    assert.doesNotMatch(pack.body, /^- 好题：/m, `${pack.name} 还带好题示例`);
    assert.doesNotMatch(pack.body, /^## 好题/m, `${pack.name} 还带好题坏题对比`);
  }
  const outline = topicOutline(packs.find((pack) => pack.name === "agent-harness")!);
  assert.match(outline, /^- 运行时循环与状态：一次 agent 执行由哪几段组成/m);
  assert.equal(outline.split("\n").length, topicNames(packs.find((pack) => pack.name === "agent-harness")!).length);
});

test("packs for the interview follow the brief order and bring in parents", async () => {
  const packs = await loadSkillPacks();
  const names = packsForInterview(["backend-java", "project-deep-dive"], packs).map((pack) => pack.name);
  assert.deepEqual(names, ["backend", "backend-java", "project-deep-dive"]);
});
