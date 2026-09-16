import type { AiTaskConfig } from "@/lib/ai/config";
import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { questionSimilarity } from "@/lib/text/similarity";

import { areaToAsk, currentTopic, decideMove, type Decision, type Target } from "./decide";
import { event, type CandidateControl, type NewEvent, type TranscriptLine } from "./events";
import { FALLBACK_SPEECH, runPolicy, type PolicyContext, type PolicyOutput, type StateCard } from "./policy";
import { planQuota, progressOf, type Progress, type ProgressSummary } from "./progress";
import type { PolicyVariant } from "./variants";

/**
 * 一个回合的核心（纯逻辑 + 一次策略调用）。本地版由编排器装状态、落库；体验版由无状态接口装状态、
 * 把结果交回浏览器。代码守的：覆盖配额（progress.ts）、候选人的结束按钮、这回合的决策（decide.ts）、模型没说出话时接一句、
 * 几条底线（泄露内部词、过早的告别、重复提问、该换题没换：都改问下一份材料的切入问法）、每一步记事件。
 * 这句聊哪份材料、哪个角度由代码指派（写进 interviewer_said），模型不自报。
 */

export type TurnPhase = "opening" | "running" | "ended";

export type TurnState = {
  brief: InterviewBrief;
  /** 面试官上一回合写的笔记（最新一份）。 */
  notebook: string;
  /** 双方说过的话（逐字稿投影，面试官的句子带代码指派的材料 id 与角度）。 */
  transcript: TranscriptLine[];
  phase: TurnPhase;
  /** 这场面试官用的策略变体（灰度分到的）；体验版用默认。 */
  variant: PolicyVariant;
  /** 随机种子（会话 id）：抽追问角度用，同一场重放结果一样。 */
  seed: string;
};

export type CandidateInput = {
  clientId: string | null;
  content: string;
  control: CandidateControl | null;
  composeMs: number | null;
};

export type EndedBy = "interviewer" | "candidate" | "budget" | "breaker";

/** 回合的结果：要写的事件、逐字稿新增的几句、新笔记、进度、阶段。 */
export type TurnResult = {
  events: NewEvent[];
  said: { role: "interviewer" | "candidate"; kind: string; content: string; topic?: string | null; facet?: number | null; doneFacet?: number | null }[];
  notebook: string;
  progress: ProgressSummary;
  phase: TurnPhase;
  endedBy: EndedBy | null;
  failed: boolean;
  runId: string | null;
};

const END_PATTERN = /(结束|到此为止|不想继续|先到这|今天就到这|别问了|不想答了|不面了|算了吧|end the interview)/i;
const END_MAX_CHARS = 40;
/** 说给候选人的话里出现这些词，说明模型把内部说法带出来了：换成固定的话。 */
const LEAK_PATTERN = /(评分标准|期望信号|现场卡|材料里|系统提示|我的笔记)/;
/** 这句与前面某句几乎一样：重复提问，不认。 */
const REPEAT_SIMILARITY = 0.8;
/** 换材料的回合这句还像原材料的切入问法到这个程度，就是"该换题没换"。 */
const TOPIC_MATCH = 0.45;
const UNRECOVERABLE = new Set(["not_configured", "unavailable", "network"]);
/** 熔断：连续这么多回合模型没说出话，就不再调模型，用固定的话收尾。 */
const BREAKER_FALLBACKS = 3;

/** 候选人这句是不是"结束"：按钮，或 40 字内的插话里含结束意图。 */
export function candidateWantsToEnd(candidate: CandidateInput | null): boolean {
  if (!candidate) return false;
  if (candidate.control === "end") return true;
  const text = candidate.content.trim();
  return text.length > 0 && text.length <= END_MAX_CHARS && END_PATTERN.test(text);
}

function withCandidate(state: TurnState, candidate: CandidateInput | null): TranscriptLine[] {
  if (!candidate) return state.transcript;
  return [...state.transcript, { seq: state.transcript.length, role: "candidate", content: candidate.content, kind: null, control: candidate.control, at: new Date() }];
}

/** 这场的进度：从逐字稿现算。 */
export function progressFor(state: Pick<TurnState, "brief">, transcript: TranscriptLine[]): Progress {
  return progressOf(planQuota(state.brief), transcript);
}

export type TurnPlan = { kind: "model"; progress: Progress; decision: Decision } | { kind: "fixed"; endedBy: "candidate" | "budget" | "breaker"; progress: Progress; decision: Decision };

/** 连续几句都是代码接的话：模型一直没说出话，熔断。 */
export function breakerTripped(transcript: TranscriptLine[]): boolean {
  const recent = transcript.filter((line) => line.role === "interviewer").slice(-BREAKER_FALLBACKS);
  return recent.length === BREAKER_FALLBACKS && recent.every((line) => line.kind === "fallback");
}

/** 这一回合谁做主：候选人要结束、配额聊完、或熔断了，代码直接收尾不调模型；其余交给模型，附上代码的决策。 */
export function planTurn(state: TurnState, candidate: CandidateInput | null): TurnPlan {
  const transcript = withCandidate(state, candidate);
  const progress = progressFor(state, transcript);
  if (candidateWantsToEnd(candidate)) return { kind: "fixed", endedBy: "candidate", progress, decision: { move: "close", reason: "候选人要求结束", target: null } };
  if (breakerTripped(state.transcript)) return { kind: "fixed", endedBy: "breaker", progress, decision: { move: "close", reason: "模型连续没说出话，熔断", target: null } };
  const decision = decideMove({ brief: state.brief, transcript, opening: state.phase === "opening", seed: state.seed });
  if (decision.move === "close") return { kind: "fixed", endedBy: "budget", progress, decision };
  return { kind: "model", progress, decision };
}

/** 现场卡：影子运行也用同一张。 */
export function buildCard(state: TurnState, progress: Progress, decision: Decision): StateCard {
  return { progress, notebook: state.notebook, opening: state.phase === "opening", decision };
}

type Spoken = {
  say: string;
  kind: "say" | "closing" | "fallback";
  /** 这句问的材料与角度（代码指派）。 */
  target: Target;
  /** 模型说候选人刚才那段讲透了的角度（当前材料上），没有为 null。 */
  doneFacet: number | null;
  notebook: string | null;
  failed: boolean;
  guard: string | null;
  original: string | null;
  runId: string | null;
  endedBy: EndedBy | null;
};

const fixedSpoken = (say: string, kind: Spoken["kind"], extra: Partial<Spoken> = {}): Spoken => ({ say, kind, target: null, doneFacet: null, notebook: null, failed: false, guard: null, original: null, runId: null, endedBy: null, ...extra });

/** 把这回合的话与记账变成事件与结果（纯函数）。 */
export function applyTurn(state: TurnState, candidate: CandidateInput | null, decision: Decision, spoken: Spoken): TurnResult {
  const events: NewEvent[] = [];
  const said: TurnResult["said"] = [];
  if (candidate) {
    events.push(event("candidate_said", { content: candidate.content, clientId: candidate.clientId, control: candidate.control, composeMs: candidate.composeMs }));
    said.push({ role: "candidate", kind: candidate.control ? "control" : "answer", content: candidate.content });
  }
  const topic = spoken.target?.topic ?? null;
  const facet = spoken.target?.facet ?? null;
  events.push(event("move_decided", { move: decision.move, reason: decision.reason }));
  events.push(event("interviewer_said", { content: spoken.say, kind: spoken.kind, topic, facet, doneFacet: spoken.doneFacet }, spoken.runId));
  said.push({ role: "interviewer", kind: spoken.kind, content: spoken.say, topic, facet, doneFacet: spoken.doneFacet });
  const notebook = spoken.notebook !== null && spoken.notebook !== state.notebook ? spoken.notebook : state.notebook;
  if (spoken.notebook !== null && spoken.notebook !== state.notebook) events.push(event("notebook_written", { text: spoken.notebook }, spoken.runId));
  if (spoken.failed) events.push(event("fallback_used", { reason: "模型没说出话" }, spoken.runId));
  else if (spoken.guard) events.push(event("fallback_used", { reason: spoken.guard, original: spoken.original }, spoken.runId));
  const transcript = [...withCandidate(state, candidate), { seq: 0, role: "interviewer" as const, content: spoken.say, kind: spoken.kind, control: null, topic, facet, doneFacet: spoken.doneFacet, at: new Date() }];
  const progress = progressFor(state, transcript);
  events.push(event("progress_tick", { covered: progress.covered, quota: progress.quota, budgetLeft: progress.budgetLeft }));
  if (spoken.endedBy) events.push(event("ended", { by: spoken.endedBy }));
  return { events, said, notebook, progress: { covered: progress.covered, quota: progress.quota }, phase: spoken.endedBy ? "ended" : "running", endedBy: spoken.endedBy, failed: spoken.failed, runId: spoken.runId };
}

/**
 * 模型的产出 → 这回合说的话：空的接一句；决策没允许的"告别"不认；模型说"讲透了"就按决策的另一边记材料与角度；
 * 三条底线——泄露内部词、与前面某句几乎一样（重复提问）、换材料的回合这句还像原材料的切入问法（该换题没换）——都不认，
 * 改问决策指的材料的切入问法，原话记进事件。
 */
export function speak(state: TurnState, decision: Decision, output: PolicyOutput | null, runId: string): Spoken {
  const opening = state.phase === "opening";
  if (!output || !output.say.trim()) return fixedSpoken(opening ? FALLBACK_SPEECH.askIntro : FALLBACK_SPEECH.stall, "fallback", { failed: true, runId });
  const say = output.say.trim();
  const notebook = output.notebook.trim();
  const done = output.facetDone && decision.ifDone !== undefined;
  const target: Target = done ? decision.ifDone! : decision.target;
  const doneFacet = done && decision.target?.facet !== undefined ? decision.target.facet : null;
  // 告别只认决策允许的那种（讲透了且没有下一份材料）；告别里不会有问号。
  const closing = output.closing && !opening && done && decision.ifDone === null && !/[？?]/.test(say);
  if (closing) return fixedSpoken(say, "closing", { notebook, runId, endedBy: "interviewer" });
  const previous = currentTopic(state.transcript);
  const switching = target !== null && target.topic !== previous && previous !== null;
  const previousArea = previous ? state.brief.areas.find((area) => area.id === previous) : undefined;
  const guard = LEAK_PATTERN.test(say)
    ? "泄露内部词"
    : state.transcript.some((line) => line.role === "interviewer" && questionSimilarity(line.content, say) >= REPEAT_SIMILARITY)
      ? "重复提问"
      : switching && previousArea && questionSimilarity(previousArea.entryQuestion, say) >= TOPIC_MATCH
        ? "该换题没换"
        : null;
  if (guard) {
    const area = areaToAsk(state.brief, state.transcript, decision);
    return fixedSpoken(area?.entryQuestion ?? FALLBACK_SPEECH.switch, "say", { target: area ? { topic: area.id, facet: null } : null, notebook, guard, original: say, runId });
  }
  return { say, kind: "say", target: opening ? null : target, doneFacet: opening ? null : doneFacet, notebook, failed: false, guard: null, original: null, runId, endedBy: null };
}

export type TurnRun = {
  /** 对候选人说的话，逐段。 */
  say: AsyncIterable<string>;
  /** 流消费完后调用：拿这回合的结果。 */
  finalize: () => Promise<TurnResult>;
};

async function* once(text: string): AsyncGenerator<string> {
  yield text;
}

/** 跑一个回合：代码定的收尾直接给固定的话；其余调一次策略。 */
export function runTurn(input: { runId: string; config: AiTaskConfig; state: TurnState; candidate: CandidateInput | null; context: PolicyContext }): TurnRun {
  const { state, candidate } = input;
  const plan = planTurn(state, candidate);
  if (plan.kind === "fixed") {
    const spoken = fixedSpoken(plan.endedBy === "breaker" ? FALLBACK_SPEECH.breaker : FALLBACK_SPEECH.closing, "closing", { endedBy: plan.endedBy });
    const result = applyTurn(state, candidate, plan.decision, spoken);
    return { say: once(spoken.say), finalize: async () => result };
  }
  const policy = runPolicy({
    runId: input.runId,
    config: input.config,
    brief: state.brief,
    context: input.context,
    transcript: state.transcript,
    card: buildCard(state, plan.progress, plan.decision),
    candidateContent: candidate?.content ?? null,
    variant: state.variant,
  });
  return {
    say: policy.say,
    finalize: async () => {
      const outcome = await policy.settled;
      // 额度、密钥、连不上服务商：重试也不会好，报给用户；其余失败接一句固定的话，回合照常落下。
      if (outcome.output === null && outcome.raw.error && UNRECOVERABLE.has(outcome.raw.error.kind)) throw outcome.raw.error;
      return applyTurn(state, candidate, plan.decision, speak(state, plan.decision, outcome.output, outcome.runId));
    },
  };
}
