import { normalizedText } from "@/lib/text/similarity";

import { BENCH_LEVELS, type BenchLevel, type Episode, type Fact, type Task, type TranscriptTurn } from "./types";

/**
 * InterviewBench 端到端层评分器（README §6，去掉了"回合分配"）。
 * 只读逐字稿与评分卡，全部纯函数；不读任何提交者内部状态。
 */

const lettersOnly = (value: string) => normalizedText(value).replace(/[^\p{L}\p{N}]/gu, "");

/** 引用逐字来自候选人的话：去标点后是某句候选人发言的子串，且不短于 4 个字符。 */
export function quoteInTranscript(transcript: TranscriptTurn[], quote: string): boolean {
  const needle = lettersOnly(quote);
  if (needle.length < 4) return false;
  return transcript.some((turn) => turn.role === "candidate" && lettersOnly(turn.text).includes(needle));
}

/** 两段文字去标点后共享 ≥ minChars 的连续片段。 */
export function overlaps(a: string, b: string, minChars = 8): boolean {
  const x = lettersOnly(a);
  const y = lettersOnly(b);
  if (x.length < minChars || y.length < minChars) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  for (let start = 0; start + minChars <= short.length; start += 1) if (long.includes(short.slice(start, start + minChars))) return true;
  return false;
}

/** 评分卡的 1–4 级映射到三档：1、2 → low，3 → medium，4 → high。 */
export function levelOf(rating: 1 | 2 | 3 | 4): BenchLevel {
  return rating <= 2 ? "low" : rating === 3 ? "medium" : "high";
}
const levelIndex = (level: BenchLevel) => BENCH_LEVELS.indexOf(level);

/** 三档序数的二次加权 κ；不足两对返回 null。 */
export function weightedKappa(pairs: [BenchLevel, BenchLevel][]): number | null {
  if (pairs.length < 2) return null;
  const k = BENCH_LEVELS.length;
  const o = Array.from({ length: k }, () => Array(k).fill(0) as number[]);
  for (const [a, b] of pairs) o[levelIndex(a)][levelIndex(b)] += 1;
  const n = pairs.length;
  const rowSum = o.map((r) => r.reduce((s, v) => s + v, 0));
  const colSum = o[0].map((_, j) => o.reduce((s, r) => s + r[j], 0));
  let num = 0;
  let den = 0;
  for (let i = 0; i < k; i += 1)
    for (let j = 0; j < k; j += 1) {
      const w = (i - j) ** 2 / (k - 1) ** 2;
      num += w * o[i][j];
      den += (w * rowSum[i] * colSum[j]) / n;
    }
  return den === 0 ? null : 1 - num / den;
}

// ------------------------------------------------------------------ 6.1 判断对不对

export type JudgementGrade = {
  /** (真值, 评分卡) 三档配对，只算评了的能力。 */
  pairs: [BenchLevel, BenchLevel][];
  exact: number;
  rated: number;
  total: number;
  /** 依据逐字来自候选人发言的比例。 */
  evidenceVerbatim: { ok: number; total: number };
};

export function gradeJudgement(task: Task, episode: Episode): JudgementGrade {
  const pairs: [BenchLevel, BenchLevel][] = [];
  let ok = 0;
  let total = 0;
  for (const rating of episode.scorecard?.ratings ?? []) {
    const truth = task.candidate.levels[rating.competencyId];
    if (!truth) continue;
    pairs.push([truth, levelOf(rating.level)]);
    total += 1;
    if (quoteInTranscript(episode.transcript, rating.evidence)) ok += 1;
  }
  return { pairs, exact: pairs.filter(([a, b]) => a === b).length, rated: pairs.length, total: task.competencies.length, evidenceVerbatim: { ok, total } };
}

/** 候选人真实水平的加权均值（0–1），比总体结论单调性用。 */
export function truthScore(task: Task): number {
  const weights = task.competencies.map((c) => ({ w: c.weight, level: task.candidate.levels[c.id] }));
  const sum = weights.reduce((s, item) => s + item.w, 0);
  return weights.reduce((s, item) => s + (item.w * levelIndex(item.level ?? "low")) / 2, 0) / sum;
}

const OVERALL_RANK = { strong_no_hire: 0, no_hire: 1, hire: 2, strong_hire: 3 } as const;

/** 同一岗位下的结论单调性：真值更高的候选人，总体结论不应更低。返回违反的配对数与配对总数。 */
export function gradeMonotonicity(items: { task: Task; episode: Episode }[]): { violations: number; pairs: number } {
  let violations = 0;
  let pairs = 0;
  const byJob = new Map<string, { truth: number; overall: number }[]>();
  for (const { task, episode } of items) {
    if (!episode.scorecard) continue;
    const list = byJob.get(task.job.source) ?? [];
    list.push({ truth: truthScore(task), overall: OVERALL_RANK[episode.scorecard.overall] });
    byJob.set(task.job.source, list);
  }
  for (const list of byJob.values())
    for (let i = 0; i < list.length; i += 1)
      for (let j = i + 1; j < list.length; j += 1) {
        const [a, b] = [list[i], list[j]];
        if (Math.abs(a.truth - b.truth) < 0.15) continue;
        pairs += 1;
        if ((a.truth > b.truth && a.overall < b.overall) || (b.truth > a.truth && b.overall < a.overall)) violations += 1;
      }
  return { violations, pairs };
}

// ------------------------------------------------------------------ 6.2 有没有被忽悠

export type FactGrade = { fact: Fact; said: boolean; saidAt: number | null; flagged: boolean; probed: boolean };

function factText(fact: Fact): string {
  return fact.type === "hollow" ? fact.resume : fact.says;
}

/** 红旗是否指向这条埋点：短的埋点（如「P95 0.8 秒」）要整个包含，长的共享 ≥ 8 字即可。 */
function flagMatches(flag: { quote: string; note: string }, fact: Fact): boolean {
  const target = lettersOnly(factText(fact));
  const haystack = lettersOnly(flag.quote + (fact.type === "hollow" ? flag.note : ""));
  return target.length <= 8 ? target.length >= 3 && haystack.includes(target) : overlaps(haystack, target);
}

/** 每条埋点：候选人说了没、评分卡红旗里有没有引用到、说出后两回合内面试官有没有追它。 */
export function gradeFacts(task: Task, episode: Episode): { facts: FactGrade[]; falsePositives: number } {
  const facts = task.candidate.facts.map((fact, index): FactGrade => {
    const saidTurn = episode.transcript.find((turn) => turn.role === "candidate" && turn.factsSaid.includes(index));
    const said = Boolean(saidTurn);
    const saidAt = saidTurn ? saidTurn.index : null;
    const flagged = (episode.scorecard?.redFlags ?? []).some((flag) => flagMatches(flag, fact));
    let probed = false;
    if (saidAt !== null) {
      const next = episode.transcript.filter((turn) => turn.role === "interviewer" && turn.index > saidAt).slice(0, 2);
      const keywords = keywordsOf(factText(fact));
      probed = next.some((turn) => keywords.some((word) => turn.text.includes(word)) || /口径|怎么算|怎么量|分子|分母|确认一下|哪里看到|依据/.test(turn.text));
    }
    return { fact, said, saidAt, flagged, probed };
  });
  // 误报：说错 / 夸大类红旗没对上任何埋点的条数。"说不出细节"类不计误报：低水平候选人对简历项说"是同事做的"，真面试官也会记一笔，
  // 它对不对取决于候选人档案里那项能力是不是 low，不是埋点能穷尽的。
  const flags = (episode.scorecard?.redFlags ?? []).filter((flag) => flag.type !== "hollow");
  const matched = flags.filter((flag) => task.candidate.facts.some((fact) => flagMatches(flag, fact)));
  return { facts, falsePositives: flags.length - matched.length };
}

/** 埋点原话里的关键词：数字带单位、和 4 字以上的连续片段的前几个，用来判面试官有没有追它。 */
function keywordsOf(text: string): string[] {
  const numbers = text.match(/\d+(?:\.\d+)?\s*(?:%|万|亿|倍|次|条|ms|s|秒|QPS|qps|TPS|tps)?/g) ?? [];
  const words = (text.match(/[A-Za-z][A-Za-z0-9_.-]{2,}|[一-龥]{4,}/g) ?? []).slice(0, 4);
  return [...new Set([...numbers.map((n) => n.replace(/\s+/g, "")), ...words])].filter((w) => w.length >= 2);
}

// ------------------------------------------------------------------ 6.3 问得值不值（回合分配已砍）

/** 每项能力从第几回合起稳定在正确等级；没达到为 null。需要 episode.turnScorecards。 */
export function turnsToCorrect(task: Task, episode: Episode): Record<string, number | null> | null {
  if (!episode.turnScorecards || episode.turnScorecards.length === 0) return null;
  const out: Record<string, number | null> = {};
  for (const competency of task.competencies) {
    const truth = task.candidate.levels[competency.id];
    let stableFrom: number | null = null;
    for (const snapshot of episode.turnScorecards) {
      const level = snapshot.levels[competency.id] ?? null;
      if (level === truth) stableFrom = stableFrom ?? snapshot.afterTurn;
      else stableFrom = null;
    }
    out[competency.id] = stableFrom;
  }
  return out;
}

/** 权重加权的"被问到"比例：评分卡评了的能力算问到。 */
export function coverage(task: Task, episode: Episode): number {
  const rated = new Set((episode.scorecard?.ratings ?? []).map((r) => r.competencyId));
  const total = task.competencies.reduce((s, c) => s + c.weight, 0);
  return total === 0 ? 0 : task.competencies.filter((c) => rated.has(c.id)).reduce((s, c) => s + c.weight, 0) / total;
}

// ------------------------------------------------------------------ 6.4 专业不专业（逐字稿规则）

export type ConductGrade = {
  interviewerTurns: number;
  multiQuestion: number;
  repeated: number;
  leaked: number;
  /** 候选人连续两句答不上之后，面试官仍在追（下一句不是换题也不是收尾）的次数。 */
  pressedAfterDontKnow: number;
  endedInBudget: boolean;
};

const LEAK = /(评分标准|满分|期望答案|标准答案|评分卡|rubric)/i;
const questionMarks = (text: string) => (text.match(/[？?]/g) ?? []).length;

export function gradeConduct(task: Task, episode: Episode): ConductGrade {
  const interviewer = episode.transcript.filter((turn): turn is Extract<TranscriptTurn, { role: "interviewer" }> => turn.role === "interviewer");
  const seen: string[] = [];
  let repeated = 0;
  for (const turn of interviewer) {
    const key = lettersOnly(turn.text);
    if (key.length >= 12 && seen.some((prev) => prev === key || (prev.length >= 24 && key.length >= 24 && overlaps(prev, key, Math.floor(Math.min(prev.length, key.length) * 0.9))))) repeated += 1;
    seen.push(key);
  }
  let pressed = 0;
  let streak = 0;
  for (const turn of episode.transcript) {
    if (turn.role === "candidate") {
      streak = turn.couldNotAnswer ? streak + 1 : 0;
      continue;
    }
    if (streak >= 2 && !turn.end && questionMarks(turn.text) > 0 && !/换个|另一个|下一个|聊聊别的|先放一放|我们来看/.test(turn.text)) pressed += 1;
  }
  const last = interviewer.at(-1);
  return {
    interviewerTurns: interviewer.length,
    multiQuestion: interviewer.filter((turn) => questionMarks(turn.text) >= 2).length,
    repeated,
    leaked: interviewer.filter((turn) => LEAK.test(turn.text)).length,
    pressedAfterDontKnow: pressed,
    endedInBudget: Boolean(last?.end) && interviewer.length <= task.budget.maxTurns && episode.scorecard !== null,
  };
}

// ------------------------------------------------------------------ 汇总

export type EpisodeGrade = {
  taskId: string;
  submission: string;
  run: number;
  judgement: JudgementGrade;
  facts: ReturnType<typeof gradeFacts>;
  coverage: number;
  turnsToCorrect: Record<string, number | null> | null;
  conduct: ConductGrade;
  /** 硬项全过：κ 用不上单场，改为等级精确率 ≥ 0.5、红旗误报 0、一次一问 ≤ 1、不泄露、按时收尾。 */
  pass: boolean;
};

export function gradeEpisode(task: Task, episode: Episode): EpisodeGrade {
  const judgement = gradeJudgement(task, episode);
  const facts = gradeFacts(task, episode);
  const conduct = gradeConduct(task, episode);
  const pass = episode.scorecard !== null && judgement.rated > 0 && judgement.exact / judgement.rated >= 0.5 && facts.falsePositives === 0 && conduct.multiQuestion <= 1 && conduct.leaked === 0 && conduct.endedInBudget;
  return { taskId: task.id, submission: episode.submission, run: episode.run, judgement, facts, coverage: coverage(task, episode), turnsToCorrect: turnsToCorrect(task, episode), conduct, pass };
}

export type SubmissionSummary = {
  submission: string;
  episodes: number;
  failed: number;
  levelExact: number | null;
  levelKappa: number | null;
  evidenceVerbatim: number | null;
  monotonicity: { violations: number; pairs: number };
  redFlagHit: Record<string, { hit: number; total: number }>;
  probedOnSaid: { hit: number; total: number };
  falsePositivesPerEpisode: number | null;
  coverage: number | null;
  turnsToCorrectMean: number | null;
  notReached: number | null;
  conduct: { multiQuestionRate: number | null; repeated: number; leaked: number; pressedAfterDontKnow: number; endedInBudget: number | null };
  passRate: number | null;
  /** 同任务 k 次全过的任务比例；k=1 时等于 passRate。 */
  passAllRuns: number | null;
  turns: number | null;
};

const mean = (values: number[]) => (values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length);

export function summarize(submission: string, items: { task: Task; episode: Episode; grade: EpisodeGrade }[]): SubmissionSummary {
  const ok = items.filter((item) => item.episode.scorecard !== null);
  const pairs = ok.flatMap((item) => item.grade.judgement.pairs);
  const redFlagHit: Record<string, { hit: number; total: number }> = {};
  const probed = { hit: 0, total: 0 };
  for (const item of ok)
    for (const fact of item.grade.facts.facts) {
      const slot = redFlagHit[fact.fact.type] ?? (redFlagHit[fact.fact.type] = { hit: 0, total: 0 });
      if (!fact.said) continue;
      slot.total += 1;
      if (fact.flagged) slot.hit += 1;
      probed.total += 1;
      if (fact.probed) probed.hit += 1;
    }
  const ttc = ok.flatMap((item) => (item.grade.turnsToCorrect ? Object.values(item.grade.turnsToCorrect) : []));
  const byTask = new Map<string, boolean[]>();
  for (const item of items) byTask.set(item.task.id, [...(byTask.get(item.task.id) ?? []), item.grade.pass]);
  const evidence = ok.reduce((s, item) => ({ ok: s.ok + item.grade.judgement.evidenceVerbatim.ok, total: s.total + item.grade.judgement.evidenceVerbatim.total }), { ok: 0, total: 0 });
  return {
    submission,
    episodes: items.length,
    failed: items.length - ok.length,
    levelExact: pairs.length ? pairs.filter(([a, b]) => a === b).length / pairs.length : null,
    levelKappa: weightedKappa(pairs),
    evidenceVerbatim: evidence.total ? evidence.ok / evidence.total : null,
    monotonicity: gradeMonotonicity(ok),
    redFlagHit,
    probedOnSaid: probed,
    falsePositivesPerEpisode: mean(ok.map((item) => item.grade.facts.falsePositives)),
    coverage: mean(ok.map((item) => item.grade.coverage)),
    turnsToCorrectMean: mean(ttc.filter((v): v is number => v !== null)),
    notReached: ttc.length ? ttc.filter((v) => v === null).length / ttc.length : null,
    conduct: {
      multiQuestionRate: mean(ok.map((item) => (item.grade.conduct.interviewerTurns ? item.grade.conduct.multiQuestion / item.grade.conduct.interviewerTurns : 0))),
      repeated: ok.reduce((s, item) => s + item.grade.conduct.repeated, 0),
      leaked: ok.reduce((s, item) => s + item.grade.conduct.leaked, 0),
      pressedAfterDontKnow: ok.reduce((s, item) => s + item.grade.conduct.pressedAfterDontKnow, 0),
      endedInBudget: mean(ok.map((item) => (item.grade.conduct.endedInBudget ? 1 : 0))),
    },
    passRate: items.length ? items.filter((item) => item.grade.pass).length / items.length : null,
    passAllRuns: byTask.size ? [...byTask.values()].filter((runs) => runs.every(Boolean)).length / byTask.size : null,
    turns: mean(ok.map((item) => item.grade.conduct.interviewerTurns)),
  };
}
