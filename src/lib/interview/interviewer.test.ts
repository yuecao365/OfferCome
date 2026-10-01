import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";
import type { SkillPack } from "@/lib/mock-interviews/skills/types";

import { buildSystem, createAskTool, INTERVIEWER_PROMPT_VERSION, interviewerPromptVersion, planningHead, renderCard } from "./interviewer";
import { stateOf } from "./state";

const pack: SkillPack = { name: "ai-agent", description: "harness 岗怎么面。", keywords: [], layer: "domain", domains: [], body: "## 常考主题清单\n### 运行时循环\n- 阶梯：a → b\n- 答实的标志：x" };
const context = { jobTitle: "Agent 开发", jobDescription: "JD", resumeText: "简历", skillPacks: [pack] };

test("系统提示词不含议程：议程是 write_plan 的工具结果，规划与面试共用同一份前缀", () => {
  const system = buildSystem(context);
  assert.doesNotMatch(system, /议程（备课产出/);
  assert.match(system, /先规划再面试/);
});

test("规划回放：用户一句 → write_plan 摘要 → 议程全文，不带技能包正文；同一输入两次逐字相同", () => {
  const brief = { ...testBrief(), skillPacks: ["ai-agent", "project-deep-dive"] };
  const head = planningHead(brief);
  assert.deepEqual(head.map((message) => message.role), ["user", "assistant", "tool"]);
  const last = head[head.length - 1];
  assert.ok(last.role === "tool" && JSON.stringify(last.content).includes("议程已写"));
  assert.ok(!JSON.stringify(head).includes("答实的标志"), "包正文不回放：消融显示它对面试阶段零差异，只多付 token");
  assert.deepEqual(head, planningHead(brief));
});

test("英文场次：系统提示、议程、状态卡、工具说明都是英文，并要求所有自由文本用英文；中文版本号不变、英文带 -en", () => {
  const brief = testBrief({ language: "en", hypotheses: [{ id: "j1", source: "jd", text: "verify tool-calling depth", evidence: "tool calling", projectId: null }] });
  const system = buildSystem(context, "en");
  assert.match(system, /^You are a technical interviewer/);
  assert.match(system, /must be in English/);
  assert.match(system, /## To verify [\s\S]*## Concluded [\s\S]*## Doubtful [\s\S]*## Next/);
  assert.doesNotMatch(system, /怎么面：|输出：/);
  const head = JSON.stringify(planningHead(brief));
  assert.match(head, /Agenda written/);
  assert.match(head, /Fundamentals \\"缓存一致性\\" \(basis · From the resume \\"Redis 缓存热门列表\\": 简历里用过\)/);
  assert.match(head, /Role-requirement claims to verify/);
  const opening = renderCard(stateOf(brief, []), { toolsUsed: [], retry: null });
  assert.match(opening, /^\[State card\]\nOpening:/);
  assert.match(opening, /## To verify\n- \[j1\] Role requirement: verify tool-calling depth/);
  assert.match(String(createAskTool("en").description), /All free text in English/);
  assert.equal(interviewerPromptVersion("zh"), INTERVIEWER_PROMPT_VERSION);
  assert.equal(interviewerPromptVersion("en"), `${INTERVIEWER_PROMPT_VERSION}-en`);
});
