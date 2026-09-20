import assert from "node:assert/strict";
import test from "node:test";

import { loadSkillPacks } from "./loader";
import { skillSection, topicNames, topicOutline, SKILL_SECTIONS } from "./sections";
import { packsForInterview } from "./selector";
import { loadSkillText, renderSkillIndex } from "./tools";

/** 包是方法书；规划时模型看全量索引自己挑（brief-agent），这里只测索引与按名取包。 */

test("two-level disclosure: the planning index lists base + domain packs; a domain pack's body ends with the detail packs that claim it", async () => {
  const packs = await loadSkillPacks();
  const top = packs.filter((pack) => pack.layer !== "detail");
  const index = renderSkillIndex(top, { keywords: true });
  assert.equal(index.split("\n").length, top.length);
  assert.match(index, /^- test-qa（domain）：测试与质量怎么面：.*（关键词：测试开发、/m);
  assert.doesNotMatch(index, /^- (go|java|python)（/m, "细节包不进规划索引");
  assert.doesNotMatch(renderSkillIndex(top), /关键词：/, "面试与评分阶段的索引不带关键词");
  const backend = loadSkillText("backend", packs);
  assert.match(backend, /## 可选的细节包\n[\s\S]*^- go：Go 后端怎么面/m, "领域包末尾列属于它的细节包");
  assert.match(loadSkillText("ai-infra", packs), /^- python：/m, "一个细节包可以属于多个领域");
  assert.doesNotMatch(loadSkillText("project-deep-dive", packs), /可选的细节包/, "没有细节包的包不加这段");
  assert.doesNotMatch(loadSkillText("go", packs), /### 技能包：backend\n/, "读细节包不再自动带领域包");
});

test("every pack is a method book with the four sections and a topic outline without example questions", async () => {
  const packs = await loadSkillPacks();
  assert.equal(packs.length, 42, "2 base + 12 domain + 28 detail");
  for (const pack of packs) {
    for (const heading of Object.values(SKILL_SECTIONS)) assert.ok(skillSection(pack, heading).length > 0, `${pack.name} 缺「${heading}」`);
    assert.ok(topicNames(pack).length >= 8, `${pack.name} 主题清单太短`);
    assert.doesNotMatch(pack.body, /^- 好题：/m, `${pack.name} 还带好题示例`);
    assert.doesNotMatch(pack.body, /^## 好题/m, `${pack.name} 还带好题坏题对比`);
  }
  const outline = topicOutline(packs.find((pack) => pack.name === "agent-runtime")!);
  assert.match(outline, /^- 运行时循环与状态：一次 agent 执行由哪几段组成/m);
  assert.equal(outline.split("\n").length, topicNames(packs.find((pack) => pack.name === "agent-runtime")!).length);
});

test("packs for the interview follow the brief order, skip unknown names, and drop duplicates", async () => {
  const packs = await loadSkillPacks();
  const names = packsForInterview(["backend", "java", "backend-java", "java", "project-deep-dive"], packs).map((pack) => pack.name);
  assert.deepEqual(names, ["backend", "java", "project-deep-dive"]);
});
