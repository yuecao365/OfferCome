import assert from "node:assert/strict";
import test from "node:test";

import { coverage, gradeConduct, gradeEpisode, gradeFacts, gradeJudgement, gradeMonotonicity, levelOf, overlaps, quoteInTranscript, summarize, turnsToCorrect, weightedKappa } from "./grade";
import type { Episode, Task, TranscriptTurn } from "./types";

const task: Task = {
  id: "t1",
  set: "dev",
  job: { title: "Agent 开发", company: "X", description: "…", source: "jd-a" },
  resume: { text: "负责 RAG 项目，召回准确率提升 30%；接口 P95 1.6 秒。", source: "r" },
  competencies: [
    { id: "runtime", name: "运行时", description: "", weight: 3 },
    { id: "eval", name: "评测", description: "", weight: 2 },
    { id: "backend", name: "后端", description: "", weight: 1 },
  ],
  budget: { pace: "quick", maxTurns: 10 },
  candidate: {
    style: "solid",
    seed: 1,
    levels: { runtime: "high", eval: "medium", backend: "low" },
    facts: [
      { type: "wrong", topic: "消息队列", says: "ack 机制保证消息只会被消费一次", whyWrong: "只保证至少一次" },
      { type: "inflated", topic: "接口性能", resume: "P95 1.6 秒", says: "P95 0.8 秒" },
      { type: "hollow", topic: "RAG", resume: "召回准确率提升 30%" },
    ],
    behavior: null,
  },
};

const I = (index: number, text: string, end = false): TranscriptTurn => ({ role: "interviewer", index, text, end });
const C = (index: number, text: string, factsSaid: number[] = [], couldNotAnswer = false): TranscriptTurn => ({ role: "candidate", index, text, couldNotAnswer, factsSaid });

const transcript: TranscriptTurn[] = [
  I(0, "先介绍一下自己？"),
  C(1, "我做过 RAG 项目和消息队列。"),
  I(2, "消息队列里怎么保证不重复消费？"),
  C(3, "我们靠 ack 机制保证消息只会被消费一次。", [0]),
  I(4, "ack 保证的是只消费一次吗？还是至少一次？"),
  C(5, "呃，应该是至少一次，消费端要幂等。"),
  I(6, "接口 P95 多少？"),
  C(7, "P95 0.8 秒。", [1]),
  I(8, "后端这块，连接池怎么配的？"),
  C(9, "这块我没怎么做过，说不上来。", [], true),
  I(10, "那换个话题，评测怎么做的？"),
  C(11, "写了回归集。"),
  I(12, "好，今天到这里。", true),
];

const episode: Episode = {
  taskId: "t1",
  submission: "s",
  run: 1,
  transcript,
  scorecard: {
    ratings: [
      { competencyId: "runtime", level: 4, evidence: "我们靠 ack 机制保证消息只会被消费一次" },
      { competencyId: "eval", level: 3, evidence: "写了回归集" },
      { competencyId: "backend", level: 1, evidence: "这块我没怎么做过" },
    ],
    redFlags: [
      { type: "wrong", quote: "ack 机制保证消息只会被消费一次", note: "至少一次" },
      { type: "inflated", quote: "P95 0.8 秒", note: "简历写 1.6 秒" },
      { type: "wrong", quote: "写了回归集", note: "并没错，误报" },
    ],
    overall: "hire",
    summary: "…",
  },
  turnScorecards: [
    { afterTurn: 4, levels: { runtime: "medium", eval: null, backend: null } },
    { afterTurn: 8, levels: { runtime: "high", eval: null, backend: null } },
    { afterTurn: 12, levels: { runtime: "high", eval: "medium", backend: "low" } },
  ],
  error: null,
  durationMs: 0,
};

test("引用逐字、重叠与等级映射", () => {
  assert.equal(quoteInTranscript(transcript, "P95 0.8 秒"), true);
  assert.equal(quoteInTranscript(transcript, "P95 1.6 秒"), false);
  assert.equal(overlaps("ack 机制保证消息只会被消费一次。", "靠 ack 机制保证消息只会被消费一次"), true);
  assert.deepEqual([1, 2, 3, 4].map((v) => levelOf(v as 1 | 2 | 3 | 4)), ["low", "low", "medium", "high"]);
  assert.equal(weightedKappa([["low", "low"], ["high", "high"], ["medium", "medium"]]), 1);
});

test("判断：三档配对、精确数、依据逐字", () => {
  const grade = gradeJudgement(task, episode);
  assert.equal(grade.rated, 3);
  assert.equal(grade.exact, 3);
  assert.deepEqual(grade.evidenceVerbatim, { ok: 3, total: 3 });
});

test("埋点：说了的被红旗引用算命中，两回合内被追算追出；红旗对不上任何埋点算误报", () => {
  const { facts, falsePositives } = gradeFacts(task, episode);
  assert.deepEqual(facts.map((f) => [f.said, f.flagged, f.probed]), [
    [true, true, true],
    [true, true, false],
    [false, false, false],
  ]);
  assert.equal(falsePositives, 1);
});

test("专业项：一次一问、不重复、不泄露、答不上后不纠缠、按时收尾", () => {
  const conduct = gradeConduct(task, episode);
  assert.equal(conduct.interviewerTurns, 7);
  assert.equal(conduct.multiQuestion, 1, "第 4 句两个问号");
  assert.equal(conduct.repeated, 0);
  assert.equal(conduct.leaked, 0);
  assert.equal(conduct.pressedAfterDontKnow, 0, "只答不上一句，不触发");
  assert.equal(conduct.endedInBudget, true);
  const leaky = gradeConduct(task, { ...episode, transcript: [...transcript.slice(0, -1), I(12, "按评分标准你过了。", true)] });
  assert.equal(leaky.leaked, 1);
});

test("达到正确判断的回合数、覆盖、单调性与汇总", () => {
  assert.deepEqual(turnsToCorrect(task, episode), { runtime: 8, eval: 12, backend: 12 });
  assert.equal(coverage(task, episode), 1);
  const weaker: Task = { ...task, id: "t2", candidate: { ...task.candidate, levels: { runtime: "low", eval: "low", backend: "low" } } };
  const weakerEpisode: Episode = { ...episode, taskId: "t2", scorecard: { ...episode.scorecard!, overall: "strong_hire" } };
  assert.deepEqual(gradeMonotonicity([{ task, episode }, { task: weaker, episode: weakerEpisode }]), { violations: 1, pairs: 1 });
  const grade = gradeEpisode(task, episode);
  assert.equal(grade.pass, false, "有一条误报就不过");
  const summary = summarize("s", [{ task, episode, grade }]);
  assert.equal(summary.levelExact, 1);
  assert.deepEqual(summary.redFlagHit.wrong, { hit: 1, total: 1 });
  assert.equal(summary.falsePositivesPerEpisode, 1);
  assert.equal(summary.turnsToCorrectMean, (8 + 12 + 12) / 3);
});
