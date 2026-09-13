import assert from "node:assert/strict";
import test from "node:test";

import { loadSkillPacks } from "./loader";
import { parseSkillTopics, sampleTopics, topicWeight } from "./topics";

test("every built-in pack parses into topics with a ladder and an example question", async () => {
  const packs = await loadSkillPacks();
  for (const pack of packs) {
    const topics = parseSkillTopics(pack);
    assert.ok(topics.length >= 8, `${pack.name} 只解析出 ${topics.length} 个主题`);
    for (const topic of topics) {
      assert.ok(topic.ladder.includes("→"), `${pack.name} / ${topic.name} 没有阶梯`);
      assert.ok(topic.example.length > 10 && topic.signals.length > 0);
      assert.ok(!topic.name.includes("（可选）"));
    }
  }
  const ai = parseSkillTopics(packs.find((pack) => pack.name === "ai-llm")!);
  assert.ok(ai.some((topic) => topic.optional), "ai-llm 的多模态主题标了可选");
});

test("topics named in the JD weigh more, topics the resume already shows or recently asked weigh less", async () => {
  const packs = await loadSkillPacks();
  const topics = parseSkillTopics(packs.find((pack) => pack.name === "ai-llm")!);
  const rag = topics.find((topic) => topic.name.startsWith("RAG"))!;
  const agent = topics.find((topic) => topic.name.startsWith("Agent"))!;
  const context = { jobTitle: "大模型应用工程师", jobDescription: "负责 RAG 链路设计与失败归因、评估体系建设。", resumeText: "做过 Agent 架构与工具调用、多智能体系统。", recent: [] };
  assert.ok(topicWeight(rag, context) > topicWeight(agent, context));
  assert.ok(topicWeight(agent, { ...context, recent: [agent.name] }) < topicWeight(agent, context) / 2);
  // 岗位领域包的主题加分；JD 点名要的主题不因简历也提到而减分。
  assert.ok(topicWeight(agent, { ...context, primarySkill: "ai-llm" }) > topicWeight(agent, context));
  const asked = { ...context, jobDescription: "熟悉 Agent 架构与工具调用" };
  assert.ok(topicWeight(agent, asked) >= topicWeight(agent, { ...asked, resumeText: "" }) - 1e-9);
});

test("sampling without replacement follows the weights and dedupes names", () => {
  const topic = (name: string, skill = "x") => ({ skill, name, ladder: "a → b", example: "问？", redFlags: "", signals: "s", optional: false });
  const topics = [topic("消息队列可靠投递"), topic("MySQL 索引"), topic("MySQL 索引", "y"), topic("Redis 缓存")];
  const context = { jobTitle: "后端", jobDescription: "熟悉 MySQL 索引优化", resumeText: "", recent: [] };
  let seed = 0.5;
  const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const picked = sampleTopics(topics, 3, context, random);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked.map((item) => item.name)).size, 3);
  // 权重最高的主题在多次抽样里几乎总在前列。
  let first = 0;
  for (let round = 0; round < 50; round += 1) if (sampleTopics(topics, 1, context, random)[0].name === "MySQL 索引") first += 1;
  assert.ok(first > 25, `MySQL 索引只被抽中 ${first}/50 次`);
});
