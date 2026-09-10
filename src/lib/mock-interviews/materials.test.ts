import assert from "node:assert/strict";
import test from "node:test";

import { highlightSegments, quotedFragments } from "./materials";

const resume = "项目一：Study Assistant。从零构建本地化个人助手，响应时间下降 40%。项目二：校园二手平台。";

test("只取面试官消息里用「」括起、且逐字出现在简历里的片段，去重保序", () => {
  const fragments = quotedFragments(
    [
      { role: "candidate", content: "我简历写的「从零构建本地化个人助手」是真的。" },
      { role: "interviewer", content: "你简历写「响应时间下降 40%」，但你说没做过。另外「从零构建本地化个人助手」也要说清楚。" },
      { role: "interviewer", content: "再看「响应时间下降 40%」这句；「这句不在简历里」；你简历写“校园二手平台”。" },
    ],
    resume,
  );
  assert.deepEqual(fragments, ["响应时间下降 40%", "从零构建本地化个人助手", "校园二手平台"]);
});

test("按片段把资料切成高亮段，重叠的片段只切一次", () => {
  const segments = highlightSegments(resume, ["响应时间下降 40%", "从零构建本地化个人助手", "本地化个人助手，响应"]);
  assert.deepEqual(
    segments.map((segment) => [segment.hit, segment.text]),
    [
      [false, "项目一：Study Assistant。"],
      [true, "从零构建本地化个人助手"],
      [false, "，"],
      [true, "响应时间下降 40%"],
      [false, "。项目二：校园二手平台。"],
    ],
  );
  assert.deepEqual(highlightSegments("", []), [{ text: "", hit: false }]);
  assert.deepEqual(highlightSegments("没有引用", ["不存在"]), [{ text: "没有引用", hit: false }]);
});
