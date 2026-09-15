import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import { buildSystem, MAX_RESUME_CHARS, renderMaterials, renderTurnMessage, salvage } from "./policy";

/** 核心层的提示词：材料每条带 id、说法挂在项目上；现场卡只有时间、笔记、这回合的建议三块。 */

const clock = (usedMinutes: number, phase: "open" | "late" | "wrap_up" | "over" = "open") => ({ usedMinutes, totalMinutes: 20, exchanges: 5, phase });
const context = { jobTitle: "后端", jobDescription: "JD", resumeText: "简历", totalMinutes: 20 };

test("材料：项目带材料 id、要验证的说法与追问角度；基础题与场景题带 id", () => {
  const brief = testBrief({ hypotheses: [{ id: "h1", text: "验证压测", evidence: "压测 QPS 提升 3 倍", projectId: "proj-1" }] });
  const text = renderMaterials(brief);
  assert.match(text, /材料 id p1-module/);
  assert.match(text, /要验证的说法：「压测 QPS 提升 3 倍」——验证压测/);
  assert.match(text, /追问角度：/);
  assert.match(text, /- q1 /);
  assert.match(text, /- s1 /);
});

test("现场卡：时间、笔记、这回合的建议三块，然后是候选人的话；开场有开场的建议", () => {
  const running = renderTurnMessage({ clock: clock(6), notebook: "先问主循环。", opening: false, decision: { move: "switch", reason: "候选人两次答不上：换到「缓存一致性」（q1）" } }, "我不会");
  const lines = running.split("\n");
  assert.equal(lines[0], "[现场卡]");
  assert.match(lines[1], /^时间：/);
  assert.equal(lines[2], "你上一回合的笔记：");
  assert.equal(lines[3], "先问主循环。");
  assert.equal(lines[4], "这回合的建议：换题——候选人两次答不上：换到「缓存一致性」（q1）");
  assert.equal(lines[5], "");
  assert.equal(lines[6], "候选人说：");
  assert.equal(lines.at(-1), "我不会");
  assert.doesNotMatch(running, /已聊：|能力估计|评论员/);
  const opening = renderTurnMessage({ clock: clock(0), notebook: "", opening: true, decision: { move: "continue", reason: "开场：先问候" } }, null);
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
  assert.ok(system.length < 4_000, `提示词 ${system.length} 字`);
  const terse = buildSystem(brief, context, { id: "t", label: "t", promptVersion: "policy-t", extraRules: ["问句不超过 60 字"] });
  assert.ok(terse.indexOf("问句不超过 60 字") < terse.indexOf("笔记："));
});

test("抢救：残缺 JSON 取 say；整段是话就当 say；空的不认", () => {
  assert.deepEqual(salvage('{"say": "你负责哪一段？", "notebook": "n'), { say: "你负责哪一段？", notebook: "", topic: null, closing: false });
  assert.deepEqual(salvage("你负责哪一段？"), { say: "你负责哪一段？", notebook: "", topic: null, closing: false });
  assert.equal(salvage("{"), null);
  assert.equal(salvage("  "), null);
});
