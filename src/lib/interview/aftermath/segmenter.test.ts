import assert from "node:assert/strict";
import test from "node:test";

import { testBrief } from "@/lib/test-support/interview-brief";

import type { TranscriptLine } from "../events";
import { repairHypotheses, repairSegments } from "./segmenter";
import { categoryForKind, segmentRecord } from "./segments";

test("简历假设的判断只认简报里有的；没提到的按 open 补齐", () => {
  const brief = testBrief({ hypotheses: [{ id: "h1", text: "验证压测", evidence: "压测", projectId: "proj-1" }, { id: "h2", text: "验证数字", evidence: "50%", projectId: "proj-1" }] });
  const judged = repairHypotheses({ segments: [], hypotheses: [{ id: "h2", status: "refuted", note: "  没有讲清楚 " }, { id: "h9", status: "confirmed", note: "不认识" }, { id: "h1", status: "open", note: "会被清掉" }] }, brief);
  assert.deepEqual(judged, [
    { id: "h1", status: "open", note: null },
    { id: "h2", status: "refuted", note: "没有讲清楚" },
  ]);
});

/** 整理员的纯逻辑：模型产出的分段起点 → 可用的段（起止、深度、回答、材料校验）。 */

const line = (seq: number, role: "interviewer" | "candidate", content: string): TranscriptLine => ({ seq, role, content, kind: role === "interviewer" ? "say" : null, control: null });

const transcript: TranscriptLine[] = [
  line(0, "interviewer", "你好，先介绍一下自己。"),
  line(1, "candidate", "我叫小王，做过助手项目。"),
  line(2, "interviewer", "先讲主循环里你负责哪一段？"),
  line(3, "candidate", "参数校验和重试。"),
  line(4, "interviewer", "校验不过怎么办？"),
  line(5, "candidate", "能具体一点吗？"),
  line(6, "interviewer", "就说 schema 不过时回给模型什么。"),
  line(7, "candidate", "错误字段和原因。"),
  line(8, "interviewer", "换个题：缓存和数据库双写怎么保证一致？"),
  line(9, "candidate", "延迟双删。"),
  line(10, "interviewer", "场景题：日历改错了时间怎么兜底？"),
  line(11, "candidate", "这题我想跳过。"),
  line(12, "interviewer", "好，今天到这里。"),
];

test("候选人编号靠到前一句面试官；从开场起的段靠到第一问，第一问已有段时丢掉", () => {
  const brief = testBrief();
  const snapped = repairSegments({ segments: [{ startSeq: 9, areaId: "q1", kind: "quick", label: "缓存", verdict: "thin", note: "", competencyId: null, difficulty: 2 }, { startSeq: 1, areaId: "p1-module", kind: "project", label: "自我介绍加主循环", verdict: "answered", note: "从开场起：靠到第一问", competencyId: null, difficulty: 2 }], hypotheses: [] }, transcript, brief);
  assert.deepEqual(snapped.map((segment) => [segment.startSeq, segment.endSeq, segment.areaId, segment.label]), [[2, 7, "p1-module", "自我介绍加主循环"], [8, 12, "q1", "缓存"]]);
  const explicit = repairSegments({ segments: [{ startSeq: 0, areaId: null, kind: "project", label: "开场", verdict: "answered", note: "", competencyId: null, difficulty: 2 }, { startSeq: 2, areaId: "p1-module", kind: "project", label: "主循环", verdict: "answered", note: "", competencyId: null, difficulty: 2 }], hypotheses: [] }, transcript, brief);
  assert.deepEqual(explicit.map((segment) => [segment.startSeq, segment.label]), [[2, "主循环"]]);
});

test("只认面试官说话的编号、开场不算、去重排序、结束编号取下一段之前；没有回答的段记 skipped", () => {
  const brief = testBrief();
  const segments = repairSegments(
    {
      segments: [
        { startSeq: 0, areaId: null, kind: "project", label: "开场", verdict: "answered", note: "不该成段", competencyId: null, difficulty: 2 },
        { startSeq: 8, areaId: "q1", kind: "quick", label: "缓存一致性", verdict: "thin", note: "只说了名词", competencyId: null, difficulty: 2 },
        { startSeq: 2, areaId: "p1-module", kind: "project", label: "主循环", verdict: "answered", note: "机制清楚", competencyId: null, difficulty: 2 },
        { startSeq: 9, areaId: "q1", kind: "quick", label: "候选人的编号", verdict: "answered", note: "靠到前一句面试官（8），与 8 重复则不算", competencyId: null, difficulty: 2 },
        { startSeq: 2, areaId: "p1-module", kind: "project", label: "重复", verdict: "failed", note: "重复的起点", competencyId: null, difficulty: 2 },
        { startSeq: 10, areaId: "nope", kind: "scenario", label: "场景", verdict: "answered", note: "材料 id 不认识", competencyId: null, difficulty: 2 },
        { startSeq: 12, areaId: null, kind: "quick", label: "收尾", verdict: "answered", note: "没有回答", competencyId: null, difficulty: 2 },
      ],
      hypotheses: [],
    },
    transcript,
    brief,
  );
  assert.deepEqual(
    segments.map((segment) => [segment.startSeq, segment.endSeq, segment.areaId, segment.depth, segment.answers.length, segment.verdict]),
    [
      [2, 7, "p1-module", 2, 3, "answered"],
      [8, 9, "q1", 0, 1, "thin"],
      [10, 11, null, 0, 1, "answered"],
      [12, 12, null, 0, 0, "skipped"],
    ],
  );
  assert.equal(segments[0].entryQuestion, "先讲主循环里你负责哪一段？");
  assert.equal(segments[1].kind, "quick");
});

test("一段 → 兼容题目：第一问加追问、回答拼接、评分表取材料的、元数据带过程信号", () => {
  const brief = testBrief();
  const area = brief.areas.find((item) => item.id === "p1-module")!;
  const segment = repairSegments({ segments: [{ startSeq: 2, areaId: "p1-module", kind: "project", label: "主循环", verdict: "answered", note: "机制清楚", competencyId: null, difficulty: 2 }], hypotheses: [] }, transcript.slice(0, 8), brief)[0];
  const record = segmentRecord(area, segment, ["校验不过怎么办？", "就说 schema 不过时回给模型什么。"], "first_interview");
  assert.equal(record.question, "先讲主循环里你负责哪一段？\n追问 1：校验不过怎么办？\n追问 2：就说 schema 不过时回给模型什么。");
  assert.equal(record.answer, "参数校验和重试。\n\n能具体一点吗？\n\n错误字段和原因。");
  assert.equal(record.skipped, false);
  assert.equal(record.category, "resume_project");
  assert.deepEqual(record.rubric, area.rubric);
  assert.equal(record.metadata.probeCount, 2);
  assert.equal(record.metadata.verdict, "answered");
  assert.equal(record.metadata.startSeq, 2);
  assert.equal(categoryForKind("scenario", null), "system_design");
  assert.equal(categoryForKind("quick", "hr_interview"), "behavioral");
});
