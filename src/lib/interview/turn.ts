import type { AiTaskConfig } from "@/lib/ai/config";
import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { questionSimilarity } from "@/lib/text/similarity";

import { estimateClock, realTimeClock, type Clock } from "./clock";
import { areaToAsk, currentTopic, decideMove, type Decision } from "./decide";
import { event, type CandidateControl, type NewEvent, type TranscriptLine } from "./events";
import { FALLBACK_SPEECH, runPolicy, type PolicyContext, type PolicyOutput, type StateCard } from "./policy";
import type { PolicyVariant } from "./variants";

/**
 * 一个回合的核心（纯逻辑 + 一次策略调用）。本地版由编排器装状态、落库；体验版由无状态接口装状态、
 * 把结果交回浏览器。代码守的：时间盒、候选人的结束按钮、这回合的决策（decide.ts）、模型没说出话时接一句、
 * 几条底线（泄露内部词、过早的告别、重复提问、该换题没换：都改问下一份材料的切入问法）、每一步记事件。
 */

export type TurnPhase = "opening" | "running" | "ended";

export type TurnState = {
  brief: InterviewBrief;
  /** 面试官上一回合写的笔记（最新一份）。 */
  notebook: string;
  /** 双方说过的话（逐字稿投影，面试官的句子带自报的材料 id）。 */
  transcript: TranscriptLine[];
  totalMinutes: number;
  phase: TurnPhase;
  /** 这场面试官用的策略变体（灰度分到的）；体验版用默认。 */
  variant: PolicyVariant;
  /** 语音模式：时钟按真实作答时间；文字模式按字数折算。 */
  realTime: boolean;
};

/** 这场的时钟：语音按真实作答时间，文字按字数折算。 */
export function clockFor(state: Pick<TurnState, "totalMinutes" | "realTime">, transcript: TranscriptLine[]): Clock {
  return state.realTime ? realTimeClock(transcript, state.totalMinutes) : estimateClock(transcript, state.totalMinutes);
}

export type CandidateInput = {
  clientId: string | null;
  content: string;
  control: CandidateControl | null;
  composeMs: number | null;
};

export type EndedBy = "interviewer" | "candidate" | "budget" | "breaker";

/** 回合的结果：要写的事件、逐字稿新增的几句、新笔记、时钟、阶段。 */
export type TurnResult = {
  events: NewEvent[];
  said: { role: "interviewer" | "candidate"; kind: string; content: string; topic?: string | null }[];
  notebook: string;
  clock: Clock;
  phase: TurnPhase;
  endedBy: EndedBy | null;
  failed: boolean;
  runId: string | null;
};

const END_PATTERN = /(结束|到此为止|不想继续|先到这|今天就到这|别问了|不想答了|不面了|算了吧|end the interview)/i;
const END_MAX_CHARS = 40;
/** 面试过半之前模型说"告别"不认（v13 里模型把"换下一个话题"当成了收尾）；候选人要求结束由代码执行，不受此限。 */
const CLOSING_ALLOWED_RATIO = 0.5;
/** 说给候选人的话里出现这些词，说明模型把内部说法带出来了：换成固定的话。 */
const LEAK_PATTERN = /(评分标准|期望信号|现场卡|材料里|系统提示|我的笔记)/;
/** 这句与前面某句几乎一样：重复提问，不认。 */
const REPEAT_SIMILARITY = 0.8;
/** 这句与某份材料的切入问法像到这个程度，就认定在聊那份材料（模型自报的 topic 常常滞后：换了题还报上一份；换题回合它还像原话题的切入问法，才算"该换题没换"）。 */
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

export type TurnPlan = { kind: "model"; clock: Clock; decision: Decision } | { kind: "fixed"; endedBy: "candidate" | "budget" | "breaker"; clock: Clock; decision: Decision };

/** 连续几句都是代码接的话：模型一直没说出话，熔断。 */
export function breakerTripped(transcript: TranscriptLine[]): boolean {
  const recent = transcript.filter((line) => line.role === "interviewer").slice(-BREAKER_FALLBACKS);
  return recent.length === BREAKER_FALLBACKS && recent.every((line) => line.kind === "fallback");
}

/** 这一回合谁做主：候选人要结束、时间盒到头、或熔断了，代码直接收尾不调模型；其余交给模型，附上代码的决策。 */
export function planTurn(state: TurnState, candidate: CandidateInput | null): TurnPlan {
  const transcript = withCandidate(state, candidate);
  const clock = clockFor(state, transcript);
  if (candidateWantsToEnd(candidate)) return { kind: "fixed", endedBy: "candidate", clock, decision: { move: "close", reason: "候选人要求结束" } };
  if (state.phase !== "opening" && clock.phase === "over") return { kind: "fixed", endedBy: "budget", clock, decision: { move: "close", reason: "时间到了" } };
  if (breakerTripped(state.transcript)) return { kind: "fixed", endedBy: "breaker", clock, decision: { move: "close", reason: "模型连续没说出话，熔断" } };
  return { kind: "model", clock, decision: decideMove({ brief: state.brief, clock, transcript, opening: state.phase === "opening" }) };
}

/** 现场卡：影子运行也用同一张。 */
export function buildCard(state: TurnState, clock: Clock, decision: Decision): StateCard {
  return { clock, notebook: state.notebook, opening: state.phase === "opening", decision };
}

type Spoken = { say: string; kind: "say" | "closing" | "fallback"; topic: string | null; notebook: string | null; failed: boolean; guard: string | null; original: string | null; runId: string | null; endedBy: EndedBy | null };

/** 把这回合的话与记账变成事件与结果（纯函数）。 */
export function applyTurn(state: TurnState, candidate: CandidateInput | null, decision: Decision, spoken: Spoken): TurnResult {
  const events: NewEvent[] = [];
  const said: TurnResult["said"] = [];
  if (candidate) {
    events.push(event("candidate_said", { content: candidate.content, clientId: candidate.clientId, control: candidate.control, composeMs: candidate.composeMs }));
    said.push({ role: "candidate", kind: candidate.control ? "control" : "answer", content: candidate.content });
  }
  events.push(event("move_decided", decision));
  events.push(event("interviewer_said", { content: spoken.say, kind: spoken.kind, topic: spoken.topic }, spoken.runId));
  said.push({ role: "interviewer", kind: spoken.kind, content: spoken.say, topic: spoken.topic });
  const notebook = spoken.notebook !== null && spoken.notebook !== state.notebook ? spoken.notebook : state.notebook;
  if (spoken.notebook !== null && spoken.notebook !== state.notebook) events.push(event("notebook_written", { text: spoken.notebook }, spoken.runId));
  if (spoken.failed) events.push(event("fallback_used", { reason: "模型没说出话" }, spoken.runId));
  else if (spoken.guard) events.push(event("fallback_used", { reason: spoken.guard, original: spoken.original }, spoken.runId));
  const transcript = [...withCandidate(state, candidate), { seq: 0, role: "interviewer" as const, content: spoken.say, kind: spoken.kind, control: null, topic: spoken.topic, at: new Date() }];
  const clock = clockFor(state, transcript);
  events.push(event("clock_tick", { usedMinutes: clock.usedMinutes, totalMinutes: clock.totalMinutes }));
  if (spoken.endedBy) events.push(event("ended", { by: spoken.endedBy }));
  return { events, said, notebook, clock, phase: spoken.endedBy ? "ended" : "running", endedBy: spoken.endedBy, failed: spoken.failed, runId: spoken.runId };
}

/**
 * 模型的产出 → 这回合说的话：空的接一句；过早的"告别"不认；三条底线——泄露内部词、与前面某句几乎一样（重复提问）、
 * 决策说换题而这句还像原话题的切入问法（该换题没换）——都不认，改问下一份材料的切入问法，原话记进事件（F2 冒烟：
 * 单凭自报材料判"没换"，三次换题误杀两次，换成的固定话又不带材料）。
 */
export function speak(state: TurnState, clock: Clock, decision: Decision, output: PolicyOutput | null, runId: string): Spoken {
  const opening = state.phase === "opening";
  if (!output || !output.say.trim()) {
    return { say: opening ? FALLBACK_SPEECH.askIntro : FALLBACK_SPEECH.stall, kind: "fallback", topic: null, notebook: null, failed: true, guard: null, original: null, runId, endedBy: null };
  }
  const say = output.say.trim();
  const notebook = output.notebook.trim();
  // 告别里不会有问号：模型在收尾提醒下常把 closing 标在"最后再问一个"上，那样候选人没机会答。
  const closing = output.closing && !opening && clock.usedMinutes / clock.totalMinutes >= CLOSING_ALLOWED_RATIO && !/[？?]/.test(say);
  if (closing) return { say, kind: "closing", topic: null, notebook, failed: false, guard: null, original: null, runId, endedBy: "interviewer" };
  const known = new Set(state.brief.areas.map((area) => area.id));
  const reported = output.topic && known.has(output.topic) ? output.topic : null;
  const previous = currentTopic(state.transcript);
  // 这句像哪份材料的切入问法：用来纠正滞后的自报（换了题还报上一份），也用来判断"该换题没换"。
  const matched = state.brief.areas
    .map((area) => ({ id: area.id, score: questionSimilarity(area.entryQuestion, say) }))
    .filter((item) => item.score >= TOPIC_MATCH)
    .sort((left, right) => right.score - left.score)[0]?.id ?? null;
  const switching = decision.move === "switch" && !opening;
  // 追问时模型常不报材料：沿用上一句的；换题回合没报新材料（或还报着上一份），记到决策指的那份名下。
  const topic =
    matched && matched !== reported && matched !== previous ? matched
    : switching && (reported === null || reported === previous) ? (decision.next ?? null)
    : (reported ?? (opening ? null : previous));
  const guard = LEAK_PATTERN.test(say)
    ? "泄露内部词"
    : state.transcript.some((line) => line.role === "interviewer" && questionSimilarity(line.content, say) >= REPEAT_SIMILARITY)
      ? "重复提问"
      : switching && previous !== null && matched === previous
        ? "该换题没换"
        : null;
  if (guard) {
    const area = areaToAsk(state.brief, state.transcript, decision);
    return { say: area?.entryQuestion ?? FALLBACK_SPEECH.switch, kind: "say", topic: area?.id ?? null, notebook, failed: false, guard, original: say, runId, endedBy: null };
  }
  return { say, kind: "say", topic, notebook, failed: false, guard: null, original: null, runId, endedBy: null };
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
    const spoken: Spoken = { say: plan.endedBy === "breaker" ? FALLBACK_SPEECH.breaker : FALLBACK_SPEECH.closing, kind: "closing", topic: null, notebook: null, failed: false, guard: null, original: null, runId: null, endedBy: plan.endedBy };
    const result = applyTurn(state, candidate, plan.decision, spoken);
    return { say: once(spoken.say), finalize: async () => result };
  }
  const policy = runPolicy({
    runId: input.runId,
    config: input.config,
    brief: state.brief,
    context: input.context,
    transcript: state.transcript,
    card: buildCard(state, plan.clock, plan.decision),
    candidateContent: candidate?.content ?? null,
    variant: state.variant,
  });
  return {
    say: policy.say,
    finalize: async () => {
      const outcome = await policy.settled;
      // 额度、密钥、连不上服务商：重试也不会好，报给用户；其余失败接一句固定的话，回合照常落下。
      if (outcome.output === null && outcome.raw.error && UNRECOVERABLE.has(outcome.raw.error.kind)) throw outcome.raw.error;
      return applyTurn(state, candidate, plan.decision, speak(state, plan.clock, plan.decision, outcome.output, outcome.runId));
    },
  };
}
