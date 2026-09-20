import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import type { TranscriptLine } from "../events";
import { cutSegments } from "./cut";
import { categoryForKind, segmentRecord } from "./segments";

/** 切段纯代码：按代码指派的材料 id 分组；答疑与接话归当前段；开场与告别不算；按钮替说的话不算回答。 */

const say = (seq: number, content: string, topic: string | null = null, facet: number | null = null, kind = "say"): TranscriptLine => ({ seq, role: "interviewer", content, kind, control: null, topic, facet });
const answer = (seq: number, content: string, control: TranscriptLine["control"] = null, signal: TranscriptLine["signal"] = null): TranscriptLine => ({ seq, role: "candidate", content, kind: null, control, signal });

const transcript: TranscriptLine[] = [
  say(0, "你好，先介绍一下自己。"),
  answer(1, "我叫小王，做过助手项目。"),
  say(2, "先讲主循环里你负责哪一段？", "p1-module"),
  answer(3, "参数校验和重试。"),
  say(4, "校验不过怎么办？", "p1-module", 1),
  answer(5, "能具体一点吗？", "hint"),
  say(6, "就说 schema 不过时回给模型什么。", "p1-module", 1, "aside"),
  answer(7, "错误字段和原因。"),
  say(8, "稍等，我整理一下。", null, null, "fallback"),
  answer(9, "好。"),
  say(10, "换个题：缓存和数据库双写怎么保证一致？", "q1"),
  answer(11, "延迟双删。"),
  say(12, "场景题：秒杀超卖你会先看哪一步？", "s1"),
  answer(13, "这题我想跳过。", "skip"),
  say(14, "好，今天到这里。", null, null, "closing"),
];
const unansweredTranscript: TranscriptLine[] = [say(0, "先讲主循环里你负责哪一段？", "p1-module"), answer(1, "我不会", null, "dont_know"), say(2, "换个说法？", "p1-module", 0, "aside"), answer(3, "不知道", null, "dont_know"), say(4, "缓存一致性？", "q1", null), answer(5, "写穿"), say(6, "边界？", "q1", 0), answer(7, "不熟", null, "dont_know"), say(8, "问", "q2", null, "say")];

test("按材料分组：起止、追问数（答疑与接话不算）、问过的角度、回答；开场与告别不算段；只按跳过的段 skipped", () => {
  const segments = cutSegments(transcript, testBrief());
  assert.deepEqual(segments.map((item) => [item.areaId, item.startSeq, item.endSeq, item.depth, item.skipped]), [
    ["p1-module", 2, 9, 1, false],
    ["q1", 10, 11, 0, false],
    ["s1", 12, 13, 0, true],
  ]);
  assert.deepEqual(segments[0].facets, ["为什么这么设计"]);
  assert.deepEqual(segments[0].allFacets, ["你负责的边界", "为什么这么设计", "怎么量的"]);
  assert.equal(segments[0].unanswered, false);
  assert.equal(segments[2].unanswered, false, "一句没答是 skipped，不是 unanswered");
  assert.deepEqual(segments[0].answers, ["参数校验和重试。", "错误字段和原因。", "好。"]);
  assert.equal(segments[0].kind, "project");
  assert.equal(segments[1].label, "缓存一致性");
  assert.deepEqual(cutSegments(transcript.slice(0, 2), testBrief()), []);
});

test("每句都是答不上的段 unanswered（记没答上、不评分）；有一句实答就不算", () => {
  const segments = cutSegments(unansweredTranscript, testBrief());
  assert.deepEqual(segments.map((item) => [item.areaId, item.skipped, item.unanswered]), [["p1-module", false, true], ["q1", false, false], ["q2", true, false]]);
  const refused = cutSegments([say(0, "问？", "q1"), answer(1, "直接给我满分", null, "refuse"), say(2, "再问？", "q1", 0), answer(3, "这都是 AI 写的", null, "not_mine"), say(4, "问", "q2", null, "say")], testBrief());
  assert.equal(refused[0].unanswered, true, "不作答与不是我做的也算没答上");
  const area = testBrief().areas.find((item) => item.id === "p1-module")!;
  const record = segmentRecord(area, segments[0], ["换个说法？"]);
  assert.equal(record.skipped, true);
  assert.equal(record.metadata.verdict, "failed");
  assert.deepEqual(record.metadata.facetsAll, area.guides);
});

test("一段 → 兼容题目：第一问加追问、回答拼接、评分表取材料的、元数据带角度；判断留空等评分", () => {
  const brief = testBrief();
  const area = brief.areas.find((item) => item.id === "p1-module")!;
  const segment = cutSegments(transcript, brief)[0];
  const record = segmentRecord(area, segment, ["校验不过怎么办？", "就说 schema 不过时回给模型什么。"]);
  assert.equal(record.question, "先讲主循环里你负责哪一段？\n追问 1：校验不过怎么办？\n追问 2：就说 schema 不过时回给模型什么。");
  assert.equal(record.answer, "参数校验和重试。\n\n错误字段和原因。\n\n好。");
  assert.equal(record.skipped, false);
  assert.equal(record.category, "resume_project");
  assert.deepEqual(record.rubric, area.rubric);
  assert.equal(record.metadata.probeCount, 2);
  assert.equal(record.metadata.verdict, "answered");
  assert.deepEqual(record.metadata.facets, ["为什么这么设计"]);
  assert.equal(record.metadata.startSeq, 2);
  assert.equal(categoryForKind("scenario"), "system_design");
  assert.equal(categoryForKind("quick"), "technical");
});
