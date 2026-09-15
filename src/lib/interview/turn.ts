import type { AiTaskConfig } from "@/lib/ai/config";
import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import { estimateClock, realTimeClock, type Clock } from "./clock";
import { estimateLine, type Estimate } from "./estimator";
import { event, isHelpRequest, type CandidateControl, type NewEvent, type TranscriptLine } from "./events";
import { FALLBACK_SPEECH, runPolicy, type PolicyContext, type PolicyOutput, type StateCard } from "./policy";
import type { PolicyVariant } from "./variants";

/**
 * 一个回合的核心（纯逻辑 + 一次策略调用）。本地版由编排器装状态、落库；体验版由无状态接口装状态、
 * 把结果交回浏览器。代码只守四件事：时间盒、候选人的结束按钮、模型没说出话时接一句、每一步记事件。
 */

export type TurnPhase = "opening" | "running" | "ended";

export type TurnState = {
  brief: InterviewBrief;
  /** 面试官上一回合写的笔记（最新一份）。 */
  notebook: string;
  /** 双方说过的话（逐字稿投影）。 */
  transcript: TranscriptLine[];
  totalMinutes: number;
  phase: TurnPhase;
  /** 标注器回填的"聊过什么"（材料 id，按第一次出现的顺序）；体验版没有标注器，为空。 */
  covered: string[];
  /** 估计器对每项能力的当前估计（从在线评委的分数算）；体验版没有评委，为空。 */
  estimates: Estimate[];
  /** 评论员对面试官上一句的提醒；没有（或关了）为 null。 */
  critic: string | null;
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
  said: { role: "interviewer" | "candidate"; kind: string; content: string }[];
  notebook: string;
  clock: Clock;
  phase: TurnPhase;
  endedBy: EndedBy | null;
  failed: boolean;
  runId: string | null;
  skillsLoaded: number;
};

const END_PATTERN = /(结束|到此为止|不想继续|先到这|今天就到这|别问了|不想答了|不面了|算了吧|end the interview)/i;
const END_MAX_CHARS = 40;
/** 面试过半之前模型说"告别"不认（v13 里模型把"换下一个话题"当成了收尾）；候选人要求结束由代码执行，不受此限。 */
const CLOSING_ALLOWED_RATIO = 0.5;
/** 说给候选人的话里出现这些词，说明模型把内部说法带出来了：换成固定的话。 */
const LEAK_PATTERN = /(评分标准|期望信号|现场卡|材料里|系统提示|我的笔记)/;
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

export type TurnPlan = { kind: "model"; clock: Clock } | { kind: "fixed"; endedBy: "candidate" | "budget" | "breaker"; clock: Clock };

/** 连续几句都是代码接的话：模型一直没说出话，熔断。 */
export function breakerTripped(transcript: TranscriptLine[]): boolean {
  const recent = transcript.filter((line) => line.role === "interviewer").slice(-BREAKER_FALLBACKS);
  return recent.length === BREAKER_FALLBACKS && recent.every((line) => line.kind === "fallback");
}

/** 这一回合谁做主：候选人要结束、时间盒到头、或熔断了，代码直接收尾不调模型；其余交给模型。 */
export function planTurn(state: TurnState, candidate: CandidateInput | null): TurnPlan {
  const clock = clockFor(state, withCandidate(state, candidate));
  if (candidateWantsToEnd(candidate)) return { kind: "fixed", endedBy: "candidate", clock };
  if (state.phase !== "opening" && clock.phase === "over") return { kind: "fixed", endedBy: "budget", clock };
  if (breakerTripped(state.transcript)) return { kind: "fixed", endedBy: "breaker", clock };
  return { kind: "model", clock };
}

/** 现场卡：影子运行也用同一张。 */
export function buildCard(state: TurnState, candidate: CandidateInput | null, clock: Clock): StateCard {
  return { clock, notebook: state.notebook, opening: state.phase === "opening", covered: state.covered, helping: candidate ? isHelpRequest({ role: "candidate", ...candidate }) : false, estimate: estimateLine(state.estimates), critic: state.critic };
}

type Spoken = { say: string; kind: "say" | "closing" | "fallback"; notebook: string | null; failed: boolean; runId: string | null; skillsLoaded: number; endedBy: EndedBy | null };

/** 把这回合的话与记账变成事件与结果（纯函数）。 */
export function applyTurn(state: TurnState, candidate: CandidateInput | null, spoken: Spoken): TurnResult {
  const events: NewEvent[] = [];
  const said: TurnResult["said"] = [];
  if (candidate) {
    events.push(event("candidate_said", { content: candidate.content, clientId: candidate.clientId, control: candidate.control, composeMs: candidate.composeMs }));
    said.push({ role: "candidate", kind: candidate.control ? "control" : "answer", content: candidate.content });
  }
  events.push(event("interviewer_said", { content: spoken.say, kind: spoken.kind }, spoken.runId));
  said.push({ role: "interviewer", kind: spoken.kind, content: spoken.say });
  const notebook = spoken.notebook !== null && spoken.notebook !== state.notebook ? spoken.notebook : state.notebook;
  if (spoken.notebook !== null && spoken.notebook !== state.notebook) events.push(event("notebook_written", { text: spoken.notebook }, spoken.runId));
  if (spoken.failed) events.push(event("fallback_used", { reason: "模型没说出话" }, spoken.runId));
  const transcript = [...withCandidate(state, candidate), { seq: 0, role: "interviewer" as const, content: spoken.say, kind: spoken.kind, control: null, at: new Date() }];
  const clock = clockFor(state, transcript);
  events.push(event("clock_tick", { usedMinutes: clock.usedMinutes, totalMinutes: clock.totalMinutes }));
  if (spoken.endedBy) events.push(event("ended", { by: spoken.endedBy }));
  return { events, said, notebook, clock, phase: spoken.endedBy ? "ended" : "running", endedBy: spoken.endedBy, failed: spoken.failed, runId: spoken.runId, skillsLoaded: spoken.skillsLoaded };
}

/** 模型的产出 → 这回合说的话：空的接一句；泄露内部词的换成固定的话；过早的"告别"不认。 */
export function speak(state: TurnState, clock: Clock, output: PolicyOutput | null, runId: string, skillsLoaded: number): Spoken {
  const opening = state.phase === "opening";
  if (!output || !output.say.trim()) {
    return { say: opening ? FALLBACK_SPEECH.askIntro : FALLBACK_SPEECH.stall, kind: "fallback", notebook: null, failed: true, runId, skillsLoaded, endedBy: null };
  }
  const say = LEAK_PATTERN.test(output.say) ? FALLBACK_SPEECH.stall : output.say.trim();
  // 告别里不会有问号：模型在收尾提醒下常把 closing 标在"最后再问一个"上（问号后面还会补一句"一句话说完就行"），那样候选人没机会答。
  const closing = output.closing && !opening && clock.usedMinutes / clock.totalMinutes >= CLOSING_ALLOWED_RATIO && !/[？?]/.test(say);
  return { say, kind: closing ? "closing" : "say", notebook: output.notebook.trim(), failed: false, runId, skillsLoaded, endedBy: closing ? "interviewer" : null };
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
    const spoken: Spoken = { say: plan.endedBy === "breaker" ? FALLBACK_SPEECH.breaker : FALLBACK_SPEECH.closing, kind: "closing", notebook: null, failed: false, runId: null, skillsLoaded: 0, endedBy: plan.endedBy };
    const result = applyTurn(state, candidate, spoken);
    return { say: once(spoken.say), finalize: async () => result };
  }
  const policy = runPolicy({
    runId: input.runId,
    config: input.config,
    brief: state.brief,
    context: input.context,
    transcript: state.transcript,
    card: buildCard(state, candidate, plan.clock),
    candidateContent: candidate?.content ?? null,
    variant: state.variant,
  });
  return {
    say: policy.say,
    finalize: async () => {
      const outcome = await policy.settled;
      // 额度、密钥、连不上服务商：重试也不会好，报给用户；其余失败接一句固定的话，回合照常落下。
      if (outcome.output === null && outcome.raw.error && UNRECOVERABLE.has(outcome.raw.error.kind)) throw outcome.raw.error;
      return applyTurn(state, candidate, speak(state, plan.clock, outcome.output, outcome.runId, outcome.skillsLoaded));
    },
  };
}
