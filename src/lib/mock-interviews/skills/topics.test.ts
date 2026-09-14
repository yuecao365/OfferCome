import assert from "node:assert/strict";
import test from "node:test";

import { loadSkillPacks } from "./loader";
import { packsForTopics } from "./selector";
import { parseSkillTopics, sampleTopicPool, sampleTopics, topicFromResume, topicTerms, topicWeight } from "./topics";

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

test("topics named in the JD weigh most, topics the resume touched weigh more, recently asked weigh less", async () => {
  const packs = await loadSkillPacks();
  const topics = parseSkillTopics(packs.find((pack) => pack.name === "ai-llm")!);
  const rag = topics.find((topic) => topic.name.startsWith("RAG"))!;
  const agent = topics.find((topic) => topic.name.startsWith("Agent"))!;
  const eval_ = topics.find((topic) => topic.name.startsWith("评估"))!;
  const context = { jobTitle: "大模型应用工程师", jobDescription: "负责 RAG 链路设计与失败归因。", resumeText: "做过 Agent 架构与工具调用、多智能体系统。", recent: [] };
  assert.ok(topicWeight(rag, context) > topicWeight(agent, context), "JD 点名的最重");
  assert.ok(topicWeight(agent, context) > topicWeight(eval_, context), "简历碰过的比谁都没提的重");
  assert.ok(topicWeight(agent, { ...context, recent: [agent.name] }) < topicWeight(agent, context) / 2);
});

test("topic names match by whole term, so generic words like 优化 / 设计 neither weigh nor mark the resume", () => {
  assert.deepEqual(topicTerms("推理优化与部署"), ["推理优化", "部署"]);
  assert.deepEqual(topicTerms("RAG 链路设计与失败归因"), ["rag", "链路设计", "失败归因"]);
  assert.deepEqual(topicTerms("分布式锁与缓存实践（Java 视角）"), ["java", "分布式锁", "缓存实践", "视角"]);
  const inference = { skill: "ai-llm", name: "推理优化与部署", ladder: "a → b", example: "问？", redFlags: "", signals: "s", optional: false, fromResume: false };
  const generic = { jobTitle: "Agent 研发", jobDescription: "负责 Agent 链路设计与性能优化，上线部署。", resumeText: "优化了上下文工程，设计了记忆系统。", recent: [] };
  const named = { ...generic, jobDescription: "负责推理优化与部署：vLLM、量化。", resumeText: "做过推理优化与部署。" };
  assert.equal(topicFromResume(inference, generic.resumeText), false, "简历只有'优化'两个字不算碰过");
  assert.equal(topicFromResume(inference, named.resumeText), true);
  assert.ok(topicWeight(inference, named) > topicWeight(inference, generic) * 1.5, "整词点名的才明显加分");
});

test("the pool is filled by role: the domain pack takes most slots, stack and basics one sixth each, resume-touched topics are marked", async () => {
  const packs = await loadSkillPacks();
  const input = {
    jobTitle: "Agent开发工程师 - 豆包",
    jobDescription: "负责 Agent 技术研发，Memory 机制、RAG、工具调用；熟练掌握 Python/Java/Go 至少一门语言。",
    resumeText: "Python 写的 Agent Harness，FastAPI 服务，分层记忆与上下文工程。",
  };
  const pool = sampleTopicPool(packsForTopics(input, packs, "first_interview"), 12, { ...input, recent: [] });
  const bySkill = new Map<string, number>();
  for (const topic of pool) bySkill.set(topic.skill, (bySkill.get(topic.skill) ?? 0) + 1);
  assert.equal(pool.length, 12);
  assert.equal(bySkill.get("ai-llm"), 8);
  assert.equal(bySkill.get("backend-python"), 2);
  assert.equal(bySkill.get("cs-fundamentals"), 2);
  assert.ok(pool.some((topic) => topic.fromResume && topic.skill === "ai-llm"), "简历碰过的主题标了 fromResume");
});

test("sampling without replacement follows the weights and dedupes names", () => {
  const topic = (name: string, skill = "x") => ({ skill, name, ladder: "a → b", example: "问？", redFlags: "", signals: "s", optional: false, fromResume: false });
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
