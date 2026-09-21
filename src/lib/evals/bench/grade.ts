import { coverage as ngramCoverage, normalizedText, questionSimilarity } from "@/lib/text/similarity";

import { BENCH_LEVELS, LEVEL_OF_RATING, type BenchLevel, type Episode, type Fact, type FactType, type Task, type TranscriptTurn } from "./types";

/**
 * InterviewBench 端到端层评分器（README §6）。只读逐字稿与评分卡，全部纯函数；不读任何提交者内部状态。
 * v2（2026-09-21 审查后）：三档一对一映射；同一能力只计一次；hollow 用词级命中；"答不上"与"求澄清"分开；
 * 换题用词面重叠判而不是固定词表；泄露排除否定句；覆盖要求实质答过；主动收尾才算按时收尾。
 */

const lettersOnly = (value: string) => normalizedText(value).replace(/[^\p{L}\p{N}]/gu, "");
const dense = (value: string) => value.replace(/\s+/g, "");
/** text（去空白后）里是否以整体出现这个带单位的数字："2天"不被"12天"命中，"18%"不被"118%"命中。 */
function countNumber(text: string, number: string): number {
  const haystack = dense(text);
  let from = 0;
  let count = 0;
  while (from <= haystack.length - number.length) {
    const at = haystack.indexOf(number, from);
    if (at < 0) break;
    if (!/\d/.test(haystack[at - 1] ?? "")) count += 1;
    from = at + 1;
  }
  return count;
}
const hasNumber = (text: string, number: string) => countNumber(text, number) > 0;

/** 引用逐字来自候选人的话：去标点后是某句候选人发言的子串，且不短于 4 个字符。 */
export function quoteInTranscript(transcript: TranscriptTurn[], quote: string): boolean {
  return quoteTurn(transcript, quote) !== null;
}

/**
 * 引用落在哪一句候选人发言上；没有返回 null。"逐字"容忍两种格式偏差：用省略号（…… / ...）拼接的几段原话，每段各自逐字出现在同一回合；
 * 或漏一个词的近逐字（引用不短于 12 字、3-gram 覆盖 ≥ 0.8：漏一个两字词最多丢 3 个三元组）。改写、概括仍然对不上。
 */
export function quoteTurn(transcript: TranscriptTurn[], quote: string): Extract<TranscriptTurn, { role: "candidate" }> | null {
  const fragments = quote.split(/…+|\.{3,}/).map(lettersOnly).filter((f) => f.length >= 4);
  if (fragments.length === 0) return null;
  const candidates = transcript.filter((turn): turn is Extract<TranscriptTurn, { role: "candidate" }> => turn.role === "candidate");
  for (const turn of candidates) {
    const text = lettersOnly(turn.text);
    if (fragments.every((f) => text.includes(f))) return turn;
  }
  const whole = lettersOnly(quote);
  if (whole.length < 12) return null;
  for (const turn of candidates) if (ngramCoverage(turn.text, quote) >= 0.8) return turn;
  return null;
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

/** 带单位 / 小数 / 百分号的数字（"1.6秒""30%""11个百分点"）；裸整数不算，"100"到处都是。 */
export function unitNumbersOf(text: string): string[] {
  return [...new Set((text.match(/\d+(?:\.\d+)?\s*(?:%|万|亿|倍|次|条|ms|s|秒|QPS|qps|TPS|tps|天|小时|分钟|k|K|w|W|\+|个百分点|个点|GB|MB|G|M)/g) ?? []).map((n) => n.replace(/\s+/g, "")))];
}

/** 关键词：带单位的数字、英文词、4 字以上的中文连续片段（前几个）。只用于"当场追出"（面试官有没有点名它），不用于 hollow 命中。 */
export function keywordsOf(text: string): string[] {
  const words = (text.match(/[A-Za-z][A-Za-z0-9_.-]{2,}|[一-龥]{4,}/g) ?? []).slice(0, 6);
  return [...new Set([...unitNumbersOf(text), ...words])].filter((w) => w.length >= 2);
}

/** 文本里包含 quote 的那一句（按句号 / 问号 / 感叹号 / 分号切）；找不到返回整段。 */
export function sentenceContaining(text: string, quote: string): string {
  const needle = lettersOnly(quote);
  for (const sentence of text.split(/(?<=[。！？!?；;\n])/)) if (needle.length >= 4 && lettersOnly(sentence).includes(needle)) return sentence;
  return text;
}

/** 两句话像不像：字符 3-gram 的 Dice 系数（0–1），中英文都适用；换题 / 重复 / 一段多问都用它。 */
export const similarity = (a: string, b: string): number => questionSimilarity(a, b);

const levelIndex = (level: BenchLevel) => BENCH_LEVELS.indexOf(level);

/** 三档序数的二次加权 κ；不足 10 对返回 null（单场不报）。 */
export function weightedKappa(pairs: [BenchLevel, BenchLevel][]): number | null {
  if (pairs.length < 10) return null;
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

/**
 * 含糊 / 推脱的说法。模拟器按 medium / low 水平答题时被要求用这些话（见 candidate.ts 引用），评分器用同一份清单认它们：
 * 候选人对简历成果说了这些话，面试官记一笔 hollow 就不是误报。词表分两组：说自己不会 / 不是自己做的；说自己记不清 / 没细看 / 只有体感。
 */
export const HEDGE_PHRASES = {
  notMine: ["不会", "不了解", "不太了解", "不熟", "说不上来", "说不上", "答不上", "没做过", "没怎么做", "没亲手", "没完整", "没细看", "没单独", "没专门", "没做成", "还没做", "不是我做", "不是我写", "不是我负责", "同事做", "同事写", "同事搞", "同事负责", "同事统计", "同事算", "同事在做", "跟着同事", "更多是同事", "只知道有这么个", "跟着用", "跟着做", "跟着跑", "跟着接", "沿用原来", "现成流程"],
  vague: ["记不清", "记不太清", "记不准", "记不太准", "记得不算", "记得不太", "记得不清", "记得不是", "不清楚", "说不清", "说不准", "说不太细", "说不太准", "粗估", "不是很严格", "不是特别严谨", "不严谨", "不是精确", "口径不纯", "没细看", "没系统整理", "体感", "大概", "应该是", "印象里", "不想硬报", "没法给你", "没有严", "不是专门"],
} as const;
const alternation = (phrases: readonly string[]) => phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
/** "推脱语"：这句是不是在说自己答不上 / 不是自己做的 / 记不清口径。 */
export const DEFLECTION = new RegExp(`(${alternation([...HEDGE_PHRASES.notMine, ...HEDGE_PHRASES.vague.filter((p) => !["大概", "应该是"].includes(p))])})`);
/** 操纵 / 不作答：要分、让面试官问 AI。评分卡引用这种话记一笔不算误报。 */
export const MANIPULATION = /(给我满分|给我个分|直接给分|问问 ?AI|你先说答案|评分标准是什么)/;
/** 求澄清：没听懂、要求具体一点。 */
export const CLARIFICATION = /(没太懂|没听懂|不太明白|能具体点|具体一点|哪个方向|什么意思|再说一遍)/;

// ------------------------------------------------------------------ 6.1 判断对不对

export type JudgementGrade = {
  /** (真值, 评分卡) 三档配对，每项能力只计第一次评的那条。 */
  pairs: [BenchLevel, BenchLevel][];
  exact: number;
  adjacent: number;
  rated: number;
  total: number;
  /** 评分卡里对不上任务能力 id 的条数（提交者篡改或编造 id）。 */
  unknownIds: number;
  /** 依据逐字来自候选人发言的比例。 */
  evidenceVerbatim: { ok: number; total: number };
};

export function gradeJudgement(task: Task, episode: Episode): JudgementGrade {
  const pairs: [BenchLevel, BenchLevel][] = [];
  const seen = new Set<string>();
  let ok = 0;
  let total = 0;
  let unknownIds = 0;
  for (const rating of episode.scorecard?.ratings ?? []) {
    const truth = task.candidate.levels[rating.competencyId];
    if (!truth) {
      unknownIds += 1;
      continue;
    }
    if (seen.has(rating.competencyId)) continue;
    seen.add(rating.competencyId);
    pairs.push([truth, LEVEL_OF_RATING[rating.level]]);
    total += 1;
    if (quoteInTranscript(episode.transcript, rating.evidence)) ok += 1;
  }
  return {
    pairs,
    exact: pairs.filter(([a, b]) => a === b).length,
    adjacent: pairs.filter(([a, b]) => Math.abs(levelIndex(a) - levelIndex(b)) <= 1).length,
    rated: pairs.length,
    total: task.competencies.length,
    unknownIds,
    evidenceVerbatim: { ok, total },
  };
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

/** 对简历成果"说不出怎么量"的口径：同事统计的、记不清口径、分子分母说不上、只有体感、没单独统计过。模拟器与评分器共用。 */
export const HOLLOW_DEFLECTION = /(同事(统计|算|做|在做|负责)|跟着同事|记不清口径|口径.{0,6}(记不|不清|说不)|说不上来怎么(量|算)|怎么(量|算|统计|测)的.{0,10}(不清楚|记不|说不上|没细看)|分子分母|体感|没(单独|专门)(统计|拉|算|做|量|测)|样本量.{0,6}记不|没做成|没亲手|没细看|记不太准|不想硬报)/;

function factText(fact: Fact): string {
  return fact.type === "hollow" ? fact.resume : fact.says;
}

/**
 * 红旗是否指向这条埋点。说错 / 夸大：quote 与 says 逐字重叠（短的整个包含）。
 * 答不出细节：quote 落在候选人做这条埋点的那个回合里，且被引用的那一句带推脱口径、或那一句 + note 含简历短语里带单位的数字；
 * 或（quote 落在别处时）quote + note 含那个带单位的数字，且这个数字在候选人全部发言里出现不超过两次（"5分钟""2天"这类短数字
 * 一场里反复出现就不能当指纹）。数字整体匹配（"2天"不被"12天"命中）。术语与中文片段不算（"P95""GPU""个百分点"同域面试里到处都是）。
 * 候选人不会复述简历原句，所以不要求与 resume 逐字重叠。
 */
function flagMatches(flag: { type: FactType; quote: string; note: string }, fact: Fact, saidTurns: Extract<TranscriptTurn, { role: "candidate" }>[], transcript: TranscriptTurn[]): boolean {
  if (fact.type !== "hollow") {
    const target = lettersOnly(fact.says);
    const haystack = lettersOnly(flag.quote);
    if (target.length <= 8 ? target.length >= 3 && haystack.includes(target) : overlaps(haystack, target)) return true;
    // 引用只截了那句话的另一半：落在候选人说这条埋点的回合上、且红旗类型一致，也算抓到（同回合同类，不再要求逐字重叠）。
    const hit = quoteTurn(transcript, flag.quote);
    return hit !== null && flag.type === fact.type && saidTurns.some((turn) => turn.index === hit.index);
  }
  const numbers = unitNumbersOf(fact.resume);
  const hit = quoteTurn(transcript, flag.quote);
  if (hit && saidTurns.some((turn) => turn.index === hit.index)) {
    const sentence = sentenceContaining(hit.text, flag.quote);
    if (HOLLOW_DEFLECTION.test(sentence) || numbers.some((n) => hasNumber(`${sentence} ${flag.note}`, n))) return true;
  }
  // 落在别处：要对上埋点里至少两个数字（只有一个数字的埋点就那一个），且这些数字在候选人全部发言里都不常见（≤ 2 次）。
  const candidateText = transcript.filter((turn) => turn.role === "candidate").map((turn) => turn.text).join("\n");
  const matched = numbers.filter((n) => countNumber(candidateText, n) <= 2 && hasNumber(`${flag.quote} ${flag.note}`, n));
  return numbers.length > 0 && matched.length >= Math.min(2, numbers.length);
}

/**
 * 候选人做了这条埋点的回合：模拟器自报的，加上文字判出来的（自报会漏）。
 * 说错 / 夸大：这句与 says 逐字重叠（短的整个包含）。答不出细节：这句带推脱口径，且紧前面那一问点到了简历上这一项（带单位的数字或 4 字以上片段）。
 */
function turnsDoingFact(transcript: TranscriptTurn[], fact: Fact, index: number): Extract<TranscriptTurn, { role: "candidate" }>[] {
  const out: Extract<TranscriptTurn, { role: "candidate" }>[] = [];
  for (let i = 0; i < transcript.length; i += 1) {
    const turn = transcript[i];
    if (turn.role !== "candidate") continue;
    if (turn.factsSaid.includes(index)) {
      out.push(turn);
      continue;
    }
    if (fact.type !== "hollow") {
      const target = lettersOnly(fact.says);
      const text = lettersOnly(turn.text);
      if (target.length <= 8 ? target.length >= 3 && text.includes(target) : overlaps(text, target)) out.push(turn);
      continue;
    }
    const asked = transcript[i - 1];
    if (!asked || asked.role !== "interviewer" || !HOLLOW_DEFLECTION.test(turn.text)) continue;
    const cues = [...unitNumbersOf(fact.resume), ...keywordsOf(fact.resume).filter((w) => w.length >= 4), ...keywordsOf(fact.topic).filter((w) => w.length >= 4)];
    if (cues.some((cue) => dense(asked.text).includes(cue))) out.push(turn);
  }
  return out;
}

/**
 * 每条埋点：候选人说了没、评分卡红旗里有没有对上、说出后有没有被追（两回合内点名它的关键词，或紧接着的一问在追口径）。
 * 红旗分三类记：对上埋点或落在推脱 / 操纵句上的（不计）、引用对不上逐字稿的（unverified）、引用真实但对不上任何埋点的（falsePositives）。
 */
export function gradeFacts(task: Task, episode: Episode): { facts: FactGrade[]; falsePositives: number; unverifiedFlags: number } {
  const flags = episode.scorecard?.redFlags ?? [];
  const facts = task.candidate.facts.map((fact, index): FactGrade => {
    const saidTurns = turnsDoingFact(episode.transcript, fact, index);
    const said = saidTurns.length > 0;
    const saidAt = said ? saidTurns[0].index : null;
    const flagged = flags.some((flag) => flagMatches(flag, fact, saidTurns, episode.transcript));
    let probed = false;
    if (saidAt !== null) {
      const next = episode.transcript.filter((turn) => turn.role === "interviewer" && turn.index > saidAt).slice(0, 2);
      const keywords = keywordsOf(factText(fact));
      probed = next.some((turn) => keywords.some((word) => turn.text.includes(word))) || (next.length > 0 && /口径|怎么算|怎么量|分子|分母|确认一下|哪里看到|依据|怎么得出|怎么测/.test(next[0].text));
    }
    return { fact, said, saidAt, flagged, probed };
  });
  // 误报：引用真实、对不上任何埋点、且引用的那一句不是推脱 / 操纵（答不上 / 同事做的 / 记不清口径 / 给我满分）的红旗。
  // 推脱句上的红旗不论提交者标的是哪一类都不计误报：真面试官也会记一笔，它对不对不是埋点能穷尽的。
  // 推脱只看被引用的那一句（不是整个回合，啰嗦的回合里总能找到一句"记不清"）；整个回合都是答不上的短回合也算。
  let falsePositives = 0;
  let unverifiedFlags = 0;
  for (const flag of flags) {
    if (task.candidate.facts.some((fact, index) => flagMatches(flag, fact, turnsDoingFact(episode.transcript, fact, index), episode.transcript))) continue;
    const turn = quoteTurn(episode.transcript, flag.quote);
    if (turn === null) {
      unverifiedFlags += 1;
      continue;
    }
    const sentence = sentenceContaining(turn.text, flag.quote);
    // 引用落在做了 hollow 埋点的那个回合上（只是没引到推脱那句）：判断没错、引错了句子，不算命中也不罚误报。
    const onHollowTurn = flag.type === "hollow" && task.candidate.facts.some((fact, index) => fact.type === "hollow" && turnsDoingFact(episode.transcript, fact, index).some((t) => t.index === turn.index));
    const excused = onHollowTurn || turn.askedForClarification || (turn.couldNotAnswer && lettersOnly(turn.text).length <= 150) || DEFLECTION.test(sentence) || MANIPULATION.test(sentence);
    if (!excused) falsePositives += 1;
  }
  return { facts, falsePositives, unverifiedFlags };
}

// ------------------------------------------------------------------ 6.3 问得值不值

/** 每项能力从第几回合起稳定在正确等级；没达到为 null。需要 episode.turnScorecards。 */
export function turnsToCorrect(task: Task, episode: Episode): Record<string, number | null> | null {
  if (!episode.turnScorecards || episode.turnScorecards.length === 0) return null;
  const out: Record<string, number | null> = {};
  for (const competency of task.competencies) {
    const truth = task.candidate.levels[competency.id];
    let stableFrom: number | null = null;
    for (const snapshot of episode.turnScorecards) {
      const level = snapshot.levels[competency.id] ?? null;
      if (level === null) continue; // 裁判这回合判不出：保持上一状态，不当判错
      if (level === truth) stableFrom = stableFrom ?? snapshot.afterTurn;
      else stableFrom = null;
    }
    out[competency.id] = stableFrom;
  }
  return out;
}

/** 权重加权的覆盖：一项能力算问到，要评分卡评了它、且依据落在候选人一句回答上（"没做过"也是回答，求澄清不是）。填满格子不算。 */
export function coverage(task: Task, episode: Episode): number {
  const covered = new Set<string>();
  for (const rating of episode.scorecard?.ratings ?? []) {
    const turn = quoteTurn(episode.transcript, rating.evidence);
    if (turn && !turn.askedForClarification) covered.add(rating.competencyId);
  }
  const total = task.competencies.reduce((s, c) => s + c.weight, 0);
  return total === 0 ? 0 : task.competencies.filter((c) => covered.has(c.id)).reduce((s, c) => s + c.weight, 0) / total;
}

// ------------------------------------------------------------------ 6.4 专业不专业（逐字稿规则）

export type ConductGrade = {
  interviewerTurns: number;
  /** 面试官一段话里问了 ≥ 2 个不同问题的段数与比例（备选项与复述不算，见 distinctQuestions）。 */
  multiQuestion: number;
  multiQuestionRate: number;
  /** 与之前某句问题相似度 ≥ 0.6 的句数（换着说法问同一件事）。 */
  repeated: number;
  /** 说出了评分口径（排除"不透露评分标准"这类否定句）。 */
  leaked: number;
  /** 候选人连续两句答不上（求澄清不算）之后，面试官下一句仍在同一话题上追问的次数（与上一问相似度 ≥ 0.3 且带问号）。 */
  pressedAfterDontKnow: number;
  /** 在预算内主动收尾且交了评分卡；bench 强制结束不算。 */
  endedProactively: boolean;
};

/**
 * 泄露：把这场面试的评分口径说给候选人听（"按评分标准你过了""这题的标准答案是…""给你满分"）。
 * 只认说出口径的句式；"不方便透露评分标准"这类拒绝、以及"你会怎么设计评分标准"这类把它当业务话题问的，都不算。
 */
export function leaks(text: string): boolean {
  const pattern = /(?:按|根据|依据|照)(?:我们的|这道题的|本题的|这题的|这轮的)?(?:评分标准|评分口径)|(?:评分标准|评分口径)(?:是|为|里|包括|要求|有)|(?:这题|这道题|本题|这个问题)的?(?:满分|期望答案|标准答案)|(?:满分|期望答案|标准答案)(?:是|为|应该是|包括)|给你?满分/g;
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 8), match.index);
    if (/(不|别|没有|无法|不能|不便|不方便|不对外|不谈|不会|不给|没)/.test(before)) continue;
    return true;
  }
  return false;
}

const questionMarks = (text: string) => (text.match(/[？?]/g) ?? []).length;

/**
 * 一句话里问了几个不同的问题：按问号切句，"还是 / 或者"接着的备选项与前一问词面重叠高的复述不算新问题
 * （"ack 保证的是只消费一次吗？还是至少一次？"是一问）。
 */
export function distinctQuestions(text: string): number {
  const sentences = text.split(/(?<=[？?])/).map((s) => s.trim()).filter((s) => /[？?]$/.test(s));
  const kept: string[] = [];
  for (const sentence of sentences) {
    const alternative = /^(还是|或者|或是|还是说|或)/.test(sentence);
    if (alternative || kept.some((prev) => similarity(prev, sentence) >= 0.3)) continue;
    kept.push(sentence);
  }
  return kept.length;
}

export function gradeConduct(task: Task, episode: Episode): ConductGrade {
  const interviewer = episode.transcript.filter((turn): turn is Extract<TranscriptTurn, { role: "interviewer" }> => turn.role === "interviewer");
  const questions = interviewer.filter((turn) => questionMarks(turn.text) > 0 && !turn.end);
  let repeated = 0;
  for (let i = 0; i < questions.length; i += 1) for (let j = 0; j < i; j += 1) if (similarity(questions[i].text, questions[j].text) >= 0.6) {
    repeated += 1;
    break;
  }
  let pressed = 0;
  let streak = 0;
  let lastQuestion: string | null = null;
  for (const turn of episode.transcript) {
    if (turn.role === "candidate") {
      streak = turn.couldNotAnswer && !turn.askedForClarification ? streak + 1 : turn.askedForClarification ? streak : 0;
      continue;
    }
    if (streak >= 2 && !turn.end && questionMarks(turn.text) > 0 && lastQuestion !== null && similarity(turn.text, lastQuestion) >= 0.3) pressed += 1;
    if (questionMarks(turn.text) > 0) lastQuestion = turn.text;
  }
  const multi = interviewer.filter((turn) => distinctQuestions(turn.text) >= 2).length;
  return {
    interviewerTurns: interviewer.length,
    multiQuestion: multi,
    multiQuestionRate: interviewer.length ? multi / interviewer.length : 0,
    repeated,
    leaked: interviewer.filter((turn) => leaks(turn.text)).length,
    pressedAfterDontKnow: pressed,
    endedProactively: episode.endedByInterviewer && interviewer.length <= task.budget.maxTurns && episode.scorecard !== null,
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
  /**
   * 硬项全过：至少评了一半能力且覆盖 ≥ 0.5、相邻率 1.0 且精确率 ≥ 0.5、误报与不可核实红旗都为 0、说出来的埋点至少抓到一条、不泄露。
   * 一段多问与主动收尾只报不设门禁：前者阈值没校准；后者对拿不到回合上限的提交（本仓库 harness 按自己的配额走）不成立。
   */
  pass: boolean;
};

export function gradeEpisode(task: Task, episode: Episode): EpisodeGrade {
  const judgement = gradeJudgement(task, episode);
  const facts = gradeFacts(task, episode);
  const conduct = gradeConduct(task, episode);
  const covered = coverage(task, episode);
  const said = facts.facts.filter((f) => f.said);
  const pass =
    episode.scorecard !== null &&
    judgement.rated >= Math.ceil(judgement.total / 2) &&
    covered >= 0.5 &&
    judgement.adjacent === judgement.rated &&
    judgement.exact / judgement.rated >= 0.5 &&
    facts.falsePositives === 0 &&
    facts.unverifiedFlags === 0 &&
    (said.length === 0 || said.some((f) => f.flagged)) &&
    conduct.leaked === 0;
  return { taskId: task.id, submission: episode.submission, run: episode.run, judgement, facts, coverage: covered, turnsToCorrect: turnsToCorrect(task, episode), conduct, pass };
}

export type SubmissionSummary = {
  submission: string;
  episodes: number;
  failed: number;
  levelExact: number | null;
  levelAdjacent: number | null;
  levelKappa: number | null;
  unknownIds: number;
  evidenceVerbatim: number | null;
  monotonicity: { violations: number; pairs: number };
  redFlagHit: Record<string, { hit: number; total: number }>;
  probedOnSaid: { hit: number; total: number };
  falsePositivesPerEpisode: number | null;
  unverifiedFlagsPerEpisode: number | null;
  coverage: number | null;
  turnsToCorrectMean: number | null;
  notReached: number | null;
  conduct: { multiQuestionRate: number | null; repeated: number; leaked: number; pressedAfterDontKnow: number; endedProactively: number | null };
  passRate: number | null;
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
    levelAdjacent: pairs.length ? pairs.filter(([a, b]) => Math.abs(levelIndex(a) - levelIndex(b)) <= 1).length / pairs.length : null,
    levelKappa: weightedKappa(pairs),
    unknownIds: ok.reduce((s, item) => s + item.grade.judgement.unknownIds, 0),
    evidenceVerbatim: evidence.total ? evidence.ok / evidence.total : null,
    monotonicity: gradeMonotonicity(ok),
    redFlagHit,
    probedOnSaid: probed,
    falsePositivesPerEpisode: mean(ok.map((item) => item.grade.facts.falsePositives)),
    unverifiedFlagsPerEpisode: mean(ok.map((item) => item.grade.facts.unverifiedFlags)),
    coverage: mean(ok.map((item) => item.grade.coverage)),
    turnsToCorrectMean: mean(ttc.filter((v): v is number => v !== null)),
    notReached: ttc.length ? ttc.filter((v) => v === null).length / ttc.length : null,
    conduct: {
      multiQuestionRate: mean(ok.map((item) => item.grade.conduct.multiQuestionRate)),
      repeated: ok.reduce((s, item) => s + item.grade.conduct.repeated, 0),
      leaked: ok.reduce((s, item) => s + item.grade.conduct.leaked, 0),
      pressedAfterDontKnow: ok.reduce((s, item) => s + item.grade.conduct.pressedAfterDontKnow, 0),
      endedProactively: mean(ok.map((item) => (item.grade.conduct.endedProactively ? 1 : 0))),
    },
    passRate: items.length ? items.filter((item) => item.grade.pass).length / items.length : null,
    passAllRuns: byTask.size ? [...byTask.values()].filter((runs) => runs.every(Boolean)).length / byTask.size : null,
    turns: mean(ok.map((item) => item.grade.conduct.interviewerTurns)),
  };
}
