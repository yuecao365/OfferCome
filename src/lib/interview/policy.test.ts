import assert from "node:assert/strict";
import test from "node:test";

import type { SkillPack } from "@/lib/mock-interviews/skills/types";
import { testBrief } from "@/lib/test-support/interview-brief";

import { buildHistory, buildMessages, buildSystem, cacheKeyOf, MAX_RESUME_CHARS, renderMaterials, renderTurnMessage, salvage, buildTools, skillToLoad } from "./policy";

/** 核心层的提示词：材料每条带 id、说法挂在项目上；现场卡只有进度、笔记、这回合的建议三块。 */

const progress = (asked: number) => ({ plan: [], quota: 6, covered: asked > 0 ? 1 : 0, current: asked > 0 ? { id: "p1-overview", kind: "project" as const, budget: 4 } : null, asked, budgetLeft: 4 - asked, facet: null, facetProbes: {}, doneFacets: [] });
const context = { jobTitle: "后端", jobDescription: "JD", resumeText: "简历" };

test("材料：项目带材料 id、要验证的说法与追问角度；基础题与场景题带 id", () => {
  const brief = testBrief({ hypotheses: [{ id: "h1", text: "验证压测", evidence: "压测 QPS 提升 3 倍", projectId: "proj-1" }] });
  const text = renderMaterials(brief);
  assert.match(text, /材料 id p1-module/);
  assert.match(text, /要验证的说法：「压测 QPS 提升 3 倍」——验证压测/);
  assert.match(text, /追问角度（按岗位相关度排序）：1\. 工具链路；2\. 安全链路/);
  assert.match(text, /- q1 /);
  assert.match(text, /- s1 /);
});

test("现场卡：时间、笔记、这回合的建议三块；候选人的话单独一条排在卡之前；开场有开场的建议", () => {
  const running = renderTurnMessage({ progress: progress(1), notebook: "先问主循环。", opening: false, decision: { move: "switch", reason: "候选人两次答不上：换到「缓存一致性」（q1）", target: null }, toolsUsed: [] }, "我不会");
  const lines = running.split("\n");
  assert.equal(lines[0], "[现场卡]");
  assert.match(lines[1], /^进度：第 1 份材料，共 6 份/);
  assert.equal(lines[2], "你上一回合的笔记：");
  assert.equal(lines[3], "先问主循环。");
  assert.equal(lines[4], "这回合的建议：换题——候选人两次答不上：换到「缓存一致性」（q1）");
  assert.equal(lines[5], "候选人刚说的话在上一条。");
  assert.doesNotMatch(running, /已聊：|能力估计|评论员/);
  const card = { progress: progress(1), notebook: "先问主循环。", opening: false, decision: { move: "continue" as const, reason: "顺着追问", target: null }, toolsUsed: [] };
  const transcript = [{ seq: 0, role: "interviewer" as const, content: "先讲主循环。", kind: "say", control: null, topic: "p1-module" }];
  const messages = buildMessages(transcript, card, "我不会");
  assert.deepEqual(messages.map((item) => item.role), ["assistant", "user", "user"]);
  assert.equal(messages[0].content, JSON.stringify({ say: "先讲主循环。" }), "面试官的历史写成它当时的输出形状");
  assert.equal(messages[1].content, "我不会");
  assert.match(messages[2].content, /^\[现场卡\]/);
  assert.equal(buildMessages(transcript, card, null).length, 2);
  assert.equal(cacheKeyOf("turn:abc123:7"), "turn:abc123");
  const opening = renderTurnMessage({ progress: progress(0), notebook: "", opening: true, decision: { move: "continue", reason: "开场：先问候", target: null }, toolsUsed: [] }, null);
  assert.match(opening, /还没有笔记/);
  assert.match(opening, /候选人已就座/);
});

test("系统提示词：没有工具说明与记忆段；简历超过节选上限才提示查全文；变体规则追加在流程段末尾", () => {
  const brief = testBrief();
  const system = buildSystem(brief, context);
  assert.match(system, /这回合的建议/);
  assert.doesNotMatch(system, /lookup_skill|上几场的记忆|技能包索引/);
  assert.doesNotMatch(system, /lookup_resume/);
  assert.match(buildSystem(brief, { ...context, resumeText: "字".repeat(MAX_RESUME_CHARS + 1) }), /lookup_resume/);
  // G3：备课选了技能包才有索引段与 load_skill 工具；索引整场不变。
  const pack = { name: "ai-llm", description: "大模型应用：RAG、Agent、评测", keywords: [], layer: "domain", body: "全文" } as unknown as SkillPack;
  const withPacks = buildSystem(brief, { ...context, skillPacks: [pack] });
  assert.match(withPacks, /技能包索引/);
  assert.match(withPacks, /- ai-llm：大模型应用：RAG、Agent、评测/);
  assert.deepEqual(Object.keys(buildTools({ ...context, skillPacks: [pack] })), ["load_skill"]);
  assert.deepEqual(Object.keys(buildTools(context)), []);
  assert.equal(buildTools({ ...context, skillPacks: [pack] }).load_skill.access, "read");
  assert.match(renderTurnMessage({ progress: progress(0), notebook: "", opening: false, decision: { move: "continue", reason: "r", target: null }, toolsUsed: ["load_skill(ai-llm)"] }, "答"), /已查过：load_skill\(ai-llm\)/);
  // 换到基础题、所属的包在备课选的包里、这场还没查过：现场卡点名先查；查过或不是基础题就不点。
  const quick = brief.areas.find((area) => area.kind === "quick")!;
  const quickPack = { ...pack, name: quick.topic!.skill } as SkillPack;
  const toQuick = { move: "switch" as const, reason: "换题", target: { topic: quick.id, facet: null } };
  assert.equal(skillToLoad(brief, toQuick, { ...context, skillPacks: [quickPack] }, []), quick.topic!.skill);
  assert.equal(skillToLoad(brief, toQuick, { ...context, skillPacks: [quickPack] }, [`load_skill(${quick.topic!.skill})`]), null);
  assert.equal(skillToLoad(brief, toQuick, { ...context, skillPacks: [pack] }, []), null, "包不在备课选的里就不点");
  assert.equal(skillToLoad(brief, { ...toQuick, move: "continue" }, { ...context, skillPacks: [quickPack] }, []), null);
  assert.match(renderTurnMessage({ progress: progress(0), notebook: "", opening: false, decision: toQuick, toolsUsed: [], loadSkill: "ai-llm" }, "答"), /先用 load_skill 查技能包「ai-llm」/);
  // G4：有档案才有档案段，只放前三段的摘录。
  const dossier = "# 候选人档案\n\n## 已验证的说法\n- 2026-09-01 · Agent 开发：P95 数字讲清了\n\n## 没讲清的说法\n（无）\n\n## 反复出现的短板\n（无）\n\n## 问过的项目角度\n- Study Assistant：记忆模块\n\n## 场次记录\n- 2026-09-01";
  const withDossier = buildSystem(brief, { ...context, dossier });
  assert.match(withDossier, /候选人档案（同一份简历上几场的记录/);
  assert.match(withDossier, /P95 数字讲清了/);
  assert.doesNotMatch(withDossier, /记忆模块/, "问过的角度不进面试官的提示词");
  assert.doesNotMatch(system, /候选人档案/);
  assert.ok(system.length < 4_000, `提示词 ${system.length} 字`);
  const terse = buildSystem(brief, context, { id: "t", label: "t", promptVersion: "policy-t", extraRules: ["问句不超过 60 字"] });
  assert.ok(terse.indexOf("问句不超过 60 字") < terse.indexOf("笔记："));
});

test("抢救：残缺 JSON 取 say；整段是话就当 say；空的不认", () => {
  assert.deepEqual(salvage('{"say": "你负责哪一段？", "notebook": "n'), { say: "你负责哪一段？", notebook: "", facetDone: false, closing: false });
  assert.deepEqual(salvage("你负责哪一段？"), { say: "你负责哪一段？", notebook: "", facetDone: false, closing: false });
  assert.equal(salvage("{"), null);
  assert.equal(salvage("  "), null);
});

test("历史裁剪按块：超过 1.4 万字才裁，裁掉的长度按 4 千字取整，前缀每长 4 千字才变一次", () => {
  const line = (seq: number, role: "interviewer" | "candidate", content: string) => ({ seq, role, content, kind: role === "interviewer" ? "say" : null, control: null, facetDone: false });
  const block = (from: number, count: number) => Array.from({ length: count }, (_, index) => line(from + index, (from + index) % 2 === 0 ? "interviewer" : "candidate", `${from + index}`.padEnd(500, "字")));
  const long = block(0, 30);
  // 面试官的话写成 {"say": …} 多十来个字：27 条约 1.36 万字仍在上限内。
  assert.equal(buildHistory(long.slice(0, 27)).length, 27, "1.4 万字以内不裁");
  const trimmed = buildHistory(long);
  assert.equal(trimmed.length, 22, "1.5 万字：裁掉 4 千字（8 条）");
  assert.ok(trimmed[0].content.includes("8字"), "从第 9 条（编号 8）开始");
  const later = buildHistory([...long, line(30, "interviewer", "再问一句"), line(31, "candidate", "答")]);
  assert.equal(later[0].content, trimmed[0].content, "又长了几十字：起点不变");
  const much = buildHistory([...long, ...block(30, 8)]);
  assert.ok(much[0].content.includes("16字"), "1.9 万字：裁掉 8 千字");
});
