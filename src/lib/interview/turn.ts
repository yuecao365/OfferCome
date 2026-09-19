import type { AiTaskConfig } from "@/lib/ai/config";
import type { AgentRunResult } from "@/lib/ai/run-agent";
import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";

import { checkAction, checkReply, fallbackAction, type Proposal } from "./constraints";
import { event, stateEventsOf, type CandidateControl, type InterviewEvent, type NewEvent, type TranscriptLine } from "./events";
import { runInterviewerTurn, type InterviewerCall, type InterviewerContext, type InterviewerOutput, renderCard } from "./interviewer";
import { stateOf, type Action, type InterviewState, type Signal } from "./state";

/**
 * 一个回合（重建 v5 §3）：候选人说话 → 按钮直接处理 → 否则一次非流式模型调用（模型判 signal、提 action、写 ledger、说 reply）
 * → 代码只校验动作（约束表）：违约把原因发回让模型重出一次，仍违约就由代码定动作再让模型说一次 → 文字只查内部词 → 落事件。
 * 没有任何固定句：模型说不出话，这回合就失败报给用户重试。
 */

export type TurnPhase = "opening" | "running" | "ended";

export type TurnState = {
  brief: InterviewBrief;
  /** 这场的事件（状态从它推导）；体验版从消息合成。 */
  events: InterviewEvent[];
  phase: TurnPhase;
};

export type CandidateInput = {
  clientId: string | null;
  content: string;
  control: CandidateControl | null;
  composeMs: number | null;
};

export type EndedBy = "interviewer" | "candidate";

export type TurnResult = {
  events: NewEvent[];
  said: { role: "interviewer" | "candidate"; kind: string; content: string; topic?: string | null; facet?: number | null; action?: Action | null; signal?: Signal | null }[];
  progress: { covered: number; quota: number };
  phase: TurnPhase;
  endedBy: EndedBy | null;
  runId: string | null;
};

const FIXED_CLOSING = "好的，今天的面试就到这里，感谢你的时间。稍后你会看到这场面试的报告。";

/** 模型的工具调用 → 事件里记的形状。 */
export function toolUsesOf(calls: { toolName: string; input: unknown }[]): { name: string; argument: string | null }[] {
  return calls.map((call) => {
    const input = call.input as Record<string, unknown> | null;
    const argument = input && typeof input === "object" ? (typeof input.keyword === "string" ? input.keyword : typeof input.name === "string" ? input.name : JSON.stringify(input)) : null;
    return { name: call.toolName, argument: argument ? argument.slice(0, 60) : null };
  });
}

const KIND_OF: Record<Action, string> = { probe: "say", switch: "say", clarify: "aside", end: "closing" };
const TOOLS_USED_SHOWN = 6;

function progressOf(state: InterviewState): { covered: number; quota: number } {
  return { covered: state.materials.filter((item) => item.status !== "untouched").length, quota: state.materials.length };
}

/** 换到哪份基础题前要先查哪个包：第一份没聊的基础题备课标的包，且这场还没查过。 */
function skillToLoad(state: InterviewState, brief: InterviewBrief, context: InterviewerContext, toolsUsed: string[]): string | null {
  const next = state.materials.find((item) => item.status === "untouched" && item.kind === "quick");
  const skill = next ? brief.areas.find((area) => area.id === next.id)?.skill : null;
  if (!skill || !(context.skillPacks ?? []).some((pack) => pack.name === skill)) return null;
  return toolsUsed.includes(`load_skill(${skill})`) ? null : skill;
}

export type Interviewer = (input: InterviewerCall) => Promise<AgentRunResult<InterviewerOutput>>;

/** 候选人这句先落事件（signal 由模型判，事后补进 candidate_said）。 */
function candidateEvent(candidate: CandidateInput, signal: Signal | null): NewEvent<"candidate_said"> {
  return event("candidate_said", { content: candidate.content, clientId: candidate.clientId, control: candidate.control, composeMs: candidate.composeMs, signal });
}

export async function runTurn(input: { runId: string; config: AiTaskConfig; state: TurnState; candidate: CandidateInput | null; context: InterviewerContext; interviewer?: Interviewer }): Promise<TurnResult> {
  const { state, candidate } = input;
  const interviewer = input.interviewer ?? runInterviewerTurn;
  const transcript = transcriptOfEvents(state.events);
  const toolsUsed = state.events.flatMap((item) => (item.type === "tool_called" ? [item.payload.argument ? `${item.payload.name}(${item.payload.argument})` : item.payload.name] : [])).slice(-TOOLS_USED_SHOWN);

  // 按钮：结束不调模型；跳过与其它按钮交给模型（它会看到 control 对应的话）。
  if (candidate?.control === "end") {
    const closing = event("interviewer_said", { content: FIXED_CLOSING, kind: "closing", topic: null, facet: null, action: "end", signal: "wants_end", why: "候选人按了结束" });
    const after = stateOf(state.brief, stateEventsOf([...state.events, asEvent(candidateEvent(candidate, "wants_end"), state.events.length), asEvent(closing, state.events.length + 1)]));
    return {
      events: [candidateEvent(candidate, "wants_end"), closing, event("ended", { by: "candidate" })],
      said: [{ role: "candidate", kind: "control", content: candidate.content, signal: "wants_end" }, { role: "interviewer", kind: "closing", content: FIXED_CLOSING, action: "end", signal: "wants_end" }],
      progress: progressOf(after),
      phase: "ended",
      endedBy: "candidate",
      runId: null,
    };
  }

  // 状态里先算上候选人这句（signal 还不知道，先按 null；跳过按钮的效果立刻生效）。
  const pending = candidate ? [asEvent(candidateEvent(candidate, null), state.events.length)] : [];
  const before = stateOf(state.brief, stateEventsOf([...state.events, ...pending]));
  const call = (retry: string | null, forced: Proposal | null) =>
    interviewer({
      runId: forced ? `${input.runId}:forced` : retry ? `${input.runId}:retry` : input.runId,
      config: input.config,
      brief: state.brief,
      context: input.context,
      transcript,
      candidateContent: candidate?.content ?? null,
      card: renderCard(before, { toolsUsed, loadSkill: skillToLoad(before, state.brief, input.context, toolsUsed), retry: forced ? `代码已定这回合的动作：${forced.action}${forced.target ? `，材料 ${forced.target}` : ""}${forced.facet !== null ? `，角度 ${forced.facet}` : ""}；action / target / facet 照填，只写这句话` : retry }),
    });

  // 第一次：模型自己提；违约重出一次；仍违约代码定动作再说一次。文字只查内部词，同样重出一次。
  // 校验用的状态要算上模型对候选人这句的判断（连续几句没信息含这一句）；开场动作固定 probe、没有材料，不校验。
  const judgedBy = (output: InterviewerOutput) => (candidate ? stateOf(state.brief, stateEventsOf([...state.events, asEvent(candidateEvent(candidate, output.signal), state.events.length)])) : before);
  const verdictOf = (judged: InterviewState, proposal: Proposal) => (before.phase === "opening" ? ({ ok: true } as const) : checkAction(judged, proposal));
  let result = await call(null, null);
  let judged = judgedBy(result.output);
  let proposal = proposalOf(result.output, before);
  let verdict = verdictOf(judged, proposal);
  const replyVerdict = () => checkReply(result.output.reply);
  const violations: string[] = [];
  if (!verdict.ok || !replyVerdict().ok) {
    const reason = !verdict.ok ? verdict.reason : (replyVerdict() as { reason: string }).reason;
    violations.push(reason);
    result = await call(reason, null);
    judged = judgedBy(result.output);
    proposal = proposalOf(result.output, before);
    verdict = verdictOf(judged, proposal);
  }
  if (!verdict.ok) {
    violations.push(verdict.reason);
    proposal = fallbackAction(judged);
    result = await call(null, proposal);
  }
  if (!replyVerdict().ok) violations.push((replyVerdict() as { reason: string }).reason);

  const output = result.output;
  const signal: Signal = candidate ? (candidate.control === "skip" ? "answered" : output.signal) : "answered";
  const materialId = proposal.action === "switch" ? proposal.target : proposal.action === "end" ? null : before.currentId;
  const facet = proposal.action === "probe" ? proposal.facet : null;
  const kind = KIND_OF[proposal.action];
  const events: NewEvent[] = [];
  const said: TurnResult["said"] = [];
  if (candidate) {
    events.push(candidateEvent(candidate, signal));
    said.push({ role: "candidate", kind: candidate.control ? "control" : "answer", content: candidate.content, signal });
  }
  for (const call of toolUsesOf(result.toolCalls)) events.push(event("tool_called", call, result.runId));
  for (const reason of violations) events.push(event("fallback_used", { reason: `重出：${reason}`, original: null }, result.runId));
  const reply = output.reply.trim();
  events.push(event("interviewer_said", { content: reply, kind, topic: state.phase === "opening" ? null : materialId, facet, action: proposal.action, signal, why: output.why.slice(0, 120) }, result.runId));
  said.push({ role: "interviewer", kind, content: reply, topic: state.phase === "opening" ? null : materialId, facet, action: proposal.action, signal });
  const ledger = output.ledger.trim();
  const ledgerMaterial = before.currentId;
  if (ledger && ledgerMaterial && candidate) events.push(event("ledger_written", { materialId: ledgerMaterial, text: ledger.slice(0, 200) }, result.runId));
  const ended = proposal.action === "end";
  if (ended) events.push(event("ended", { by: "interviewer" }));
  const after = stateOf(state.brief, stateEventsOf([...state.events, ...events.map((item, index) => asEvent(item, state.events.length + index))]));
  return { events, said, progress: progressOf(after), phase: ended ? "ended" : "running", endedBy: ended ? "interviewer" : null, runId: result.runId };
}

/** 模型的动作 → 提议：开场固定 probe；probe 没带 target 就是当前材料。 */
function proposalOf(output: InterviewerOutput, state: InterviewState): Proposal {
  if (state.phase === "opening") return { action: "probe", target: null, facet: null };
  return { action: output.action, target: output.action === "switch" ? output.target : output.action === "probe" ? state.currentId : null, facet: output.action === "probe" ? output.facet : null };
}

function asEvent(item: NewEvent, seq: number): InterviewEvent {
  return { ...item, seq, runId: item.runId ?? null, at: new Date() } as InterviewEvent;
}

/** 逐字稿投影（与 events.transcriptOf 同义，这里避免循环依赖）。 */
function transcriptOfEvents(events: InterviewEvent[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const item of events) {
    if (item.type === "candidate_said") lines.push({ seq: item.seq, role: "candidate", content: item.payload.content, kind: null, control: item.payload.control, at: item.at });
    if (item.type === "interviewer_said") lines.push({ seq: item.seq, role: "interviewer", content: item.payload.content, kind: item.payload.kind, control: null, at: item.at, topic: item.payload.topic ?? null, facet: item.payload.facet ?? null });
  }
  return lines;
}
