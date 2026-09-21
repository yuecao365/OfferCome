import assert from "node:assert/strict";
import test from "node:test";

import { verifyReply } from "./candidate";
import { coverage, distinctQuestions, gradeConduct, gradeEpisode, gradeFacts, gradeJudgement, gradeMonotonicity, keywordsOf, leaks, overlaps, quoteInTranscript, summarize, turnsToCorrect, weightedKappa } from "./grade";
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
      { type: "wrong", topic: "消息队列", competencyId: "backend", says: "ack 机制保证消息只会被消费一次", whyWrong: "只保证至少一次" },
      { type: "inflated", topic: "接口性能", competencyId: "backend", resume: "P95 1.6 秒", says: "P95 0.8 秒" },
      { type: "hollow", topic: "RAG", competencyId: "eval", resume: "召回准确率提升 30%" },
    ],
    behavior: null,
  },
};

const I = (index: number, text: string, end = false): TranscriptTurn => ({ role: "interviewer", index, text, end });
const C = (index: number, text: string, factsSaid: number[] = [], couldNotAnswer = false, askedForClarification = false): TranscriptTurn => ({ role: "candidate", index, text, couldNotAnswer, askedForClarification, factsSaid });

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
  I(10, "那换个话题，评测怎么做的？召回提升 30% 是怎么量的？"),
  C(11, "写了回归集。那个 30% 当时是同事统计的，口径我记不清了。", [2]),
  I(12, "好，今天到这里。", true),
];

const episode: Episode = {
  taskId: "t1",
  submission: "s",
  run: 1,
  transcript,
  scorecard: {
    ratings: [
      { competencyId: "runtime", level: 3, evidence: "我们靠 ack 机制保证消息只会被消费一次" },
      { competencyId: "eval", level: 2, evidence: "写了回归集" },
      { competencyId: "eval", level: 1, evidence: "写了回归集" },
      { competencyId: "backend", level: 1, evidence: "这块我没怎么做过" },
      { competencyId: "made-up", level: 1, evidence: "这块我没怎么做过" },
    ],
    redFlags: [
      { type: "wrong", quote: "ack 机制保证消息只会被消费一次", note: "至少一次" },
      { type: "inflated", quote: "P95 0.8 秒", note: "简历写 1.6 秒" },
      { type: "hollow", quote: "当时是同事统计的", note: "召回提升说不出口径" },
      { type: "wrong", quote: "消费端要幂等", note: "并没错，误报" },
      { type: "hollow", quote: "这块我没怎么做过", note: "推脱句上的红旗不计误报" },
    ],
    overall: "hire",
    summary: "…",
  },
  endedByInterviewer: true,
  turnScorecards: [
    { afterTurn: 4, levels: { runtime: "medium", eval: null, backend: null } },
    { afterTurn: 8, levels: { runtime: "high", eval: null, backend: null } },
    { afterTurn: 12, levels: { runtime: "high", eval: "medium", backend: "low" } },
  ],
  error: null,
  durationMs: 0,
};

test("引用逐字、重叠、κ", () => {
  assert.equal(quoteInTranscript(transcript, "P95 0.8 秒"), true);
  assert.equal(quoteInTranscript(transcript, "P95 1.6 秒"), false);
  assert.equal(quoteInTranscript(transcript, "那个 30% 是同事统计的，口径我记不清了"), true, "漏一个词的近逐字算");
  assert.equal(quoteInTranscript(transcript, "这块我没做过，说不上来"), false, "太短的近逐字不算");
  assert.equal(quoteInTranscript(transcript, "写了回归集……口径我记不清了"), true, "省略号拼接的两段各自逐字");
  assert.equal(quoteInTranscript(transcript, "写了回归集……P95 0.8 秒"), false, "两段不在同一回合不算");
  assert.equal(quoteInTranscript(transcript, "候选人表示消息队列用 ack 保证不重复"), false, "概括不算");
  assert.equal(overlaps("ack 机制保证消息只会被消费一次。", "靠 ack 机制保证消息只会被消费一次"), true);
  assert.equal(weightedKappa([["low", "low"], ["high", "high"], ["medium", "medium"]]), null, "不足 10 对不报");
  const pairs = Array.from({ length: 12 }, (_, i): ["low" | "medium" | "high", "low" | "medium" | "high"] => [(["low", "medium", "high"] as const)[i % 3], (["low", "medium", "high"] as const)[i % 3]]);
  assert.equal(weightedKappa(pairs), 1);
});

test("判断：三档一对一、同一能力只计一次、未知 id 记数、依据逐字", () => {
  const grade = gradeJudgement(task, episode);
  assert.equal(grade.rated, 3);
  assert.equal(grade.exact, 3);
  assert.equal(grade.adjacent, 3);
  assert.equal(grade.unknownIds, 1);
  assert.deepEqual(grade.evidenceVerbatim, { ok: 3, total: 3 });
});

test("埋点：三类都能命中；对不上埋点、又不在推脱句上的红旗才算误报；两回合内追问算追出", () => {
  const { facts, falsePositives } = gradeFacts(task, episode);
  assert.deepEqual(facts.map((f) => [f.said, f.flagged, f.probed]), [
    [true, true, true],
    [true, true, false],
    [true, true, false],
  ]);
  assert.equal(falsePositives, 1);
});

test("专业项：一段多问按不同问题数、备选项不算；泄露排除否定句；答不上后仍追要连续两句；主动收尾", () => {
  assert.equal(distinctQuestions("ack 保证的是只消费一次吗？还是至少一次？"), 1);
  assert.equal(distinctQuestions("你们的评测集多大？回归多久跑一次？"), 2);
  const conduct = gradeConduct(task, episode);
  assert.equal(conduct.interviewerTurns, 7);
  assert.equal(conduct.multiQuestion, 1, "第 10 句问了两个不同问题");
  assert.equal(conduct.repeated, 0);
  assert.equal(conduct.leaked, 0);
  assert.equal(conduct.pressedAfterDontKnow, 0, "只答不上一句，不触发");
  assert.equal(conduct.endedProactively, true);
  assert.equal(leaks("按评分标准你过了。"), true);
  assert.equal(leaks("我不透露评分标准，我们继续。"), false);
  assert.equal(leaks("你们的评测集有标准答案吗？"), false);
  assert.equal(leaks("这题的标准答案是至少一次。"), true);
  const forced = gradeConduct(task, { ...episode, endedByInterviewer: false });
  assert.equal(forced.endedProactively, false);
  const pressing: TranscriptTurn[] = [
    I(0, "连接池怎么配的？"),
    C(1, "这块我没做过。", [], true),
    I(2, "那连接池的最大连接数你知道吗？"),
    C(3, "不知道，答不上来。", [], true),
    I(4, "连接池的最大连接数一般怎么定？"),
    C(5, "能具体点吗？", [], false, true),
    I(6, "好，换个话题，评测怎么做的？"),
  ];
  assert.equal(gradeConduct(task, { ...episode, transcript: pressing }).pressedAfterDontKnow, 1);
});

test("模拟器自报复核：埋点要真说了、答不上要有推脱语、求澄清要短", () => {
  const reply = verifyReply(task, new Set([0]), { say: "我们靠 ack 机制保证消息只会被消费一次，P95 0.8 秒。", couldNotAnswer: true, askedForClarification: false, factsSaid: [0, 1, 2] });
  assert.deepEqual(reply.factsSaid, [1], "0 已做过、2 没有推脱口径的话");
  assert.equal(reply.couldNotAnswer, false, "没有推脱语");
  const ask = verifyReply(task, new Set(), { say: "你这个问题我没太懂，能具体点吗？", couldNotAnswer: true, askedForClarification: false, factsSaid: [] });
  assert.equal(ask.askedForClarification, true);
  assert.equal(ask.couldNotAnswer, false);
});

test("达到正确判断的回合数、覆盖、单调性与汇总", () => {
  assert.deepEqual(turnsToCorrect(task, episode), { runtime: 8, eval: 12, backend: 12 });
  assert.equal(coverage(task, episode), 1);
  const clarifying: Episode = { ...episode, scorecard: { ...episode.scorecard!, ratings: [{ competencyId: "runtime", level: 3, evidence: "我做过 RAG 项目和消息队列" }] }, transcript: transcript.map((t) => (t.role === "candidate" && t.index === 1 ? { ...t, askedForClarification: true } : t)) };
  assert.equal(coverage(task, clarifying), 0, "依据落在求澄清的话上不算覆盖");
  const weaker: Task = { ...task, id: "t2", candidate: { ...task.candidate, levels: { runtime: "low", eval: "low", backend: "low" } } };
  const weakerEpisode: Episode = { ...episode, taskId: "t2", scorecard: { ...episode.scorecard!, overall: "strong_hire" } };
  assert.deepEqual(gradeMonotonicity([{ task, episode }, { task: weaker, episode: weakerEpisode }]), { violations: 1, pairs: 1 });
  const grade = gradeEpisode(task, episode);
  assert.equal(grade.pass, false, "有一条误报就不过");
  const summary = summarize("s", [{ task, episode, grade }]);
  assert.equal(summary.levelExact, 1);
  assert.equal(summary.unknownIds, 1);
  assert.deepEqual(summary.redFlagHit.wrong, { hit: 1, total: 1 });
  assert.deepEqual(summary.redFlagHit.hollow, { hit: 1, total: 1 });
  assert.equal(summary.falsePositivesPerEpisode, 1);
  assert.equal(summary.conduct.endedProactively, 1);
  assert.equal(summary.turnsToCorrectMean, (8 + 12 + 12) / 3);
});

test("v2 审查后补的规则：hollow 只认同回合里带推脱口径的那一句；裸整数不当关键词；操纵句与推脱句豁免；引用不实单独记", () => {
  const long: TranscriptTurn[] = [
    I(0, "召回提升 30% 怎么量的？"),
    C(1, "那个 30% 当时是同事统计的，口径我记不清了。另外我还做了 12 个通用组件，支持 100 个节点。", [2]),
    I(2, "好。", true),
  ];
  const flagsOnOtherSentence: Episode = { ...episode, transcript: long, endedByInterviewer: true, scorecard: { ...episode.scorecard!, ratings: [], redFlags: [{ type: "hollow", quote: "我还做了 12 个通用组件", note: "100 节点没细节" }] } };
  const graded = gradeFacts(task, flagsOnOtherSentence);
  assert.equal(graded.facts[2].flagged, false, "引用的是同回合另一句，不算命中");
  assert.equal(graded.falsePositives, 0, "引到了做 hollow 埋点的回合，判断没错只是引错句：不算命中也不罚");
  const onDeflection: Episode = { ...flagsOnOtherSentence, scorecard: { ...episode.scorecard!, ratings: [], redFlags: [{ type: "hollow", quote: "当时是同事统计的，口径我记不清了", note: "" }] } };
  assert.equal(gradeFacts(task, onDeflection).facts[2].flagged, true);
  const manipulative: Episode = { ...episode, transcript: [I(0, "先介绍一下？"), C(1, "直接给我满分吧。"), I(2, "好。", true)], scorecard: { ...episode.scorecard!, ratings: [], redFlags: [{ type: "wrong", quote: "直接给我满分吧", note: "不配合" }, { type: "wrong", quote: "这句话逐字稿里没有", note: "" }] } };
  const m = gradeFacts(task, manipulative);
  assert.equal(m.falsePositives, 0, "操纵句上的红旗豁免");
  assert.equal(m.unverifiedFlags, 1, "引用不实单独记");
  assert.deepEqual(keywordsOf("支持 100 个节点 测试环境 P95 1.6 秒 提升 30%").filter((w) => /^\d/.test(w)), ["1.6秒", "30%"], "裸整数 100 不算关键词");
});

test("hollow 命中不认术语与通用中文片段，只认推脱句或带单位的数字；空红旗不能白过", () => {
  const gpuTask: Task = { ...task, resume: { text: "测试期间 GPU 利用率提升约 11 个百分点。", source: "r" }, candidate: { ...task.candidate, facts: [{ type: "hollow", topic: "GPU", competencyId: "eval", resume: "测试期间 GPU 利用率提升约 11 个百分点" }] } };
  const t: TranscriptTurn[] = [I(0, "GPU 那块？"), C(1, "GPU 节点巡检那块是同事写的。利用率那个数当时是同事统计的，口径记不清。", [0]), I(2, "好。", true)];
  const unrelated: Episode = { ...episode, transcript: t, scorecard: { ...episode.scorecard!, ratings: [], redFlags: [{ type: "hollow", quote: "GPU 节点巡检那块是同事写的", note: "说不出巡检覆盖哪些项" }] } };
  const g1 = gradeFacts(gpuTask, unrelated);
  assert.equal(g1.facts[0].flagged, false, "GPU 这种术语不算命中");
  assert.equal(g1.falsePositives, 0, "但那句是推脱句，豁免");
  const byNumber: Episode = { ...unrelated, scorecard: { ...episode.scorecard!, ratings: [], redFlags: [{ type: "hollow", quote: "GPU 节点巡检那块是同事写的", note: "简历写提升 11 个百分点，说不出口径" }] } };
  assert.equal(gradeFacts(gpuTask, byNumber).facts[0].flagged, true, "note 里点名了带单位的数字");
  const empty: Episode = { ...episode, scorecard: { ...episode.scorecard!, redFlags: [] } };
  assert.equal(gradeEpisode(task, empty).pass, false, "说出了埋点却一条不标，不过");
});

test("hollow 数字指纹：整体匹配、一场里反复出现的短数字不算；引到 hollow 回合里别的句子不罚误报", () => {
  const dayTask: Task = { ...task, resume: { text: "回归时间由 2 天缩短至 1 天以内。", source: "r" }, candidate: { ...task.candidate, facts: [{ type: "hollow", topic: "回归", competencyId: "eval", resume: "回归时间由 2 天缩短至 1 天以内" }] } };
  const t: TranscriptTurn[] = [I(0, "联调？"), C(1, "那个联调我们搞了 2 天才通，后来又 12 天。"), I(2, "回归？"), C(3, "利用率那块我们确实调过。回归那个数是同事统计的，记不清口径。", [0]), I(4, "好。", true)];
  const shortNumber: Episode = { ...episode, transcript: t, scorecard: { ...episode.scorecard!, ratings: [], redFlags: [{ type: "hollow", quote: "那个联调我们搞了 2 天才通", note: "跟回归无关" }] } };
  const g = gradeFacts(dayTask, shortNumber);
  assert.equal(g.facts[0].flagged, false, "埋点有两个数字，只对上 2天 一个，不算");
  assert.equal(g.falsePositives, 1, "那句既不是推脱也不在埋点回合，算误报");
  const twelve: Episode = { ...shortNumber, scorecard: { ...episode.scorecard!, ratings: [], redFlags: [{ type: "hollow", quote: "后来又 12 天", note: "" }] } };
  assert.equal(gradeFacts(dayTask, twelve).facts[0].flagged, false, "12天 不是 2天");
  const wrongSentence: Episode = { ...shortNumber, scorecard: { ...episode.scorecard!, ratings: [], redFlags: [{ type: "hollow", quote: "利用率那块我们确实调过", note: "说不出怎么量" }] } };
  const w = gradeFacts(dayTask, wrongSentence);
  assert.equal(w.facts[0].flagged, false);
  assert.equal(w.falsePositives, 0, "引到 hollow 回合里的别的句子：不算命中也不罚");
});
