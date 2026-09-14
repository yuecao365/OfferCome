import { randomUUID } from "node:crypto";

import type { CandidateIntent, EnterInput, LeaveInput, PlanInput, ThreadVerdict } from "./actions";
import { applyMemoryPatch, type MemoryPatch } from "./memory";
import { threadSegment, type ThreadSegment } from "./segments";
import { activeThread, asideAllowance, asidesUsed, turnsLeft, turnsUsed, type InterviewerState, type InterviewPlan, type MessageKind, type MessageMetrics, type MessageState, type ThreadState } from "./state";

/**
 * 回合 reducer：把"候选人这条消息 + 面试官这回合做的事"应用到状态上。
 *
 * 面试官这回合做的事 = 说的话 + 一次记账（改计划、离开 / 进入话题、记忆、收尾），全部来自模型；
 * 代码不裁决它做得对不对，只做三件事：候选人点"结束"直接收尾、总回合预算用完直接收尾、
 * 模型没说出话来时用一句固定的话把回合接上。全程纯函数，返回新状态、要落库的消息、副作用与一条决策记录。
 */

export type TurnDecision = {
  speech: string;
  plan: PlanInput | null;
  /** 先应用 leave，再应用 enter。 */
  leave: LeaveInput | null;
  enter: EnterInput | null;
  ended: boolean;
  /** 这句只是答疑（复述、换个说法、给方向），不算回合。 */
  aside: boolean;
  memoryPatch: MemoryPatch | null;
  /** 模型回合失败（超时、5xx）：speech 为空，由代码接一句。 */
  failed?: boolean;
};

export type TurnEffect =
  | { type: "thread_closed"; thread: ThreadState; segment: ThreadSegment }
  | { type: "interview_ended" };

/** 每回合一条：面试官这回合改没改计划、进了哪个话题、离开时怎么判、有没有收尾。trace 页读它。 */
export type TurnDecisionRecord = {
  planChanged: boolean;
  entered: string | null;
  left: ThreadVerdict | null;
  ended: boolean;
  /** 收尾是谁定的：模型 / 候选人按钮 / 预算用完；没收尾为 null。 */
  endedBy: "interviewer" | "candidate" | "budget" | null;
  failed: boolean;
};

export type TurnResult = {
  state: InterviewerState;
  newMessages: MessageState[];
  effects: TurnEffect[];
  decision: TurnDecisionRecord;
};

export type CandidateInput = {
  id: string;
  content: string;
  intent: CandidateIntent;
  metrics?: MessageMetrics | null;
};

/** 这一回合谁做主：候选人点了结束、或预算用完，代码直接收尾不调模型；其余交给模型。 */
export type TurnPlan = { kind: "model" } | { kind: "fixed"; endedBy: "candidate" | "budget" };

export const FALLBACK_SPEECH = {
  askIntro: "你好，我们开始吧。请先用一两分钟做个自我介绍，重点讲讲和这个岗位相关的经历。",
  closeInterview: "好的，今天的面试就到这里，感谢你的时间。稍后你会看到这场面试的报告。",
  /** 模型这回合没说出话来：接一句让候选人继续，不推进任何状态。 */
  stall: "稍等，我整理一下——你接着刚才的思路再往下说一点。",
} as const;

/** 代码替模型离开话题时的 note：不是面试官的判断，报告与汇总都不当判断用。 */
export const SYSTEM_CLOSE_NOTE = "（面试官没有交代就换了话题）";

/** 线程 note 里只有面试官自己写的才算判断。 */
export function interviewerNote(note: string | null): string | null {
  return note && note !== SYSTEM_CLOSE_NOTE ? note : null;
}

/**
 * 模型偶尔把工具入参当成话写出来（整段是 JSON，或 JSON 后面才是真正的话）：去掉开头那个 JSON 对象，剩下的才给候选人看。
 * 找 JSON 的结尾靠括号配平（字符串里的括号跳过）。
 */
function stripLeadingJson(text: string): string {
  if (!text.startsWith("{") && !text.startsWith("[")) return text;
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          JSON.parse(text.slice(0, index + 1));
          return text.slice(index + 1).trim();
        } catch {
          return text;
        }
      }
    }
  }
  return text;
}

/** 同一段话原句写了两遍（"问题？问题？"）：折成一遍。 */
function foldRepeat(text: string): string {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 8 || compact.length % 2 !== 0) return text;
  const half = compact.length / 2;
  if (compact.slice(0, half) !== compact.slice(half)) return text;
  // 在原文里找到第二遍的起点：去掉空白后的第 half 个字符。
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!/\s/.test(text[index])) seen += 1;
    if (seen === half) return text.slice(0, index + 1).trim();
  }
  return text;
}

/** 这回合对候选人说的话：取最后一步说的（多步时后一步常会复述前一步），整段是 JSON 的不算，原句重复两遍的折半。 */
export function pickSpeech(stepTexts: string[], fallback: string): string {
  const spoken = stepTexts.map((text) => stripLeadingJson(text.trim())).filter((text) => text.length > 0);
  const last = spoken.at(-1) ?? stripLeadingJson(fallback.trim());
  return foldRepeat(last);
}

export function planTurn(state: InterviewerState, intent: CandidateIntent): TurnPlan {
  if (intent === "end") return { kind: "fixed", endedBy: "candidate" };
  if (state.phase !== "opening" && turnsLeft(state) <= 0) return { kind: "fixed", endedBy: "budget" };
  return { kind: "model" };
}

function message(
  state: InterviewerState,
  role: MessageState["role"],
  kind: MessageKind,
  content: string,
  extra: { threadId?: string | null; toolName?: string | null; id?: string; metrics?: MessageMetrics | null } = {},
): MessageState {
  return {
    id: extra.id ?? randomUUID(),
    turnIndex: state.turnIndex,
    role,
    kind,
    content,
    threadId: extra.threadId ?? null,
    toolName: extra.toolName ?? null,
    metrics: extra.metrics ?? null,
  };
}

/** areaId 只认材料里有的：模型偶尔填技能包名或别的东西，那就当没有对应材料。 */
function knownAreaId(state: InterviewerState, areaId: string | null): string | null {
  return areaId && state.brief.areas.some((area) => area.id === areaId) ? areaId : null;
}

function applyPlan(state: InterviewerState, plan: PlanInput): InterviewPlan {
  const seen = new Set<string>();
  const items = plan.items
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .map((item) => ({ id: item.id, label: item.label, kind: item.kind, areaId: knownAreaId(state, item.areaId), turns: item.turns }));
  return { items, note: plan.note, revisedAtTurn: state.turnIndex };
}

function closeThread(state: InterviewerState, thread: ThreadState, input: { verdict: ThreadVerdict | null; note: string | null }, pending: MessageState[]) {
  const closed: ThreadState = { ...thread, status: "closed", closedAtTurn: state.turnIndex, verdict: input.verdict, note: input.note };
  const segment = threadSegment(closed, [...state.messages, ...pending]);
  return {
    state: { ...state, threads: state.threads.map((item) => (item.id === thread.id ? closed : item)) },
    effect: { type: "thread_closed" as const, thread: closed, segment },
  };
}

/** enter 指向的就是当前话题：同一个计划项，或（计划外时）同一道材料 / 同一个标签。 */
function sameTopic(active: ThreadState | null, input: EnterInput): boolean {
  if (!active) return false;
  if (input.itemId && active.planItemId) return input.itemId === active.planItemId;
  if (input.areaId && active.areaId) return input.areaId === active.areaId;
  return input.label.trim() === active.label.trim();
}

function bumpDepth(state: InterviewerState, thread: ThreadState): InterviewerState {
  return { ...state, threads: state.threads.map((item) => (item.id === thread.id ? { ...item, depth: item.depth + 1 } : item)) };
}

/** 应用回合：候选人消息、记忆、计划、离开 / 进入话题、面试官的话、收尾。 */
export function applyTurn(initial: InterviewerState, candidate: CandidateInput | null, decision: TurnDecision): TurnResult {
  let state = initial;
  const newMessages: MessageState[] = [];
  const effects: TurnEffect[] = [];
  const record: TurnDecisionRecord = { planChanged: false, entered: null, left: null, ended: false, endedBy: null, failed: Boolean(decision.failed) };
  const finish = (): TurnResult => ({
    state: { ...state, messages: [...state.messages, ...newMessages], turnIndex: state.turnIndex + 1 },
    newMessages,
    effects,
    decision: record,
  });

  if (state.phase === "ended") return { state, newMessages, effects, decision: record };
  const opening = state.phase === "opening";

  // 1. 候选人消息落进当前话题；代码执行的"结束"记为插话。
  if (candidate) {
    newMessages.push(
      message(state, "candidate", candidate.intent ? "aside" : "answer", candidate.content, {
        id: candidate.id,
        threadId: activeThread(state)?.id ?? null,
        metrics: candidate.metrics ?? null,
      }),
    );
  }

  const leave = (input: { verdict: ThreadVerdict | null; note: string | null }) => {
    const active = activeThread(state);
    if (!active) return;
    const closed = closeThread(state, active, input, newMessages);
    state = closed.state;
    effects.push(closed.effect);
    if (input.verdict) record.left = input.verdict;
  };
  const endInterview = (content: string, endedBy: NonNullable<TurnDecisionRecord["endedBy"]>) => {
    leave({ verdict: null, note: null });
    newMessages.push(message(state, "interviewer", "closing", content, { toolName: "end" }));
    state = { ...state, phase: "ended" };
    effects.push({ type: "interview_ended" });
    record.ended = true;
    record.endedBy = endedBy;
  };

  // 2. 代码定的收尾：候选人按了结束，或预算用完。
  const plan = planTurn(state, candidate?.intent ?? null);
  if (plan.kind === "fixed") {
    endInterview(FALLBACK_SPEECH.closeInterview, plan.endedBy);
    return finish();
  }

  // 3. 模型没说出话来：接一句，不推进。
  const speech = decision.speech.trim();
  if (!speech) {
    const active = activeThread(state);
    newMessages.push(message(state, "interviewer", opening ? "intro_request" : "probe", opening ? FALLBACK_SPEECH.askIntro : FALLBACK_SPEECH.stall, { threadId: active?.id ?? null }));
    if (active) state = bumpDepth(state, active);
    state = { ...state, phase: "running" };
    record.failed = true;
    return finish();
  }

  // 4. 记忆与计划。
  if (decision.memoryPatch) {
    state = { ...state, memory: applyMemoryPatch(state.memory, decision.memoryPatch, { turn: state.turnIndex, areaId: activeThread(state)?.areaId ?? null }) };
  }
  if (decision.plan) {
    state = { ...state, plan: applyPlan(state, decision.plan) };
    record.planChanged = true;
  }

  // 5. 先离开、再进入。开场回合请自我介绍，不是话题，不接受 enter；指向当前话题的 enter 视为继续
  //    （模型常在追问时又 leave 再 enter 同一个话题：两个都不算）；只 leave 不 enter 也不收尾的，话题继续
  //    （否则接下来的问答落在话题之外，切不了段）。记账自相矛盾时取对候选人无害的解释：
  //    既进入新话题又收尾的按进入算（这句话是一道题，候选人得答；预算到头由代码下一回合收）。
  const continuing = decision.enter !== null && sameTopic(activeThread(state), decision.enter);
  const entering = decision.enter !== null && !opening && !continuing ? decision.enter : null;
  const ending = decision.ended && !entering;
  const leaving = decision.leave !== null && !continuing && (entering !== null || ending);
  if (leaving) leave({ verdict: decision.leave!.verdict, note: decision.leave!.note });
  let entered: ThreadState | null = null;
  if (entering) {
    leave({ verdict: null, note: SYSTEM_CLOSE_NOTE });
    const item = entering.itemId ? (state.plan?.items.find((planItem) => planItem.id === entering.itemId) ?? null) : null;
    entered = {
      id: randomUUID(),
      planItemId: item?.id ?? null,
      areaId: knownAreaId(state, entering.areaId) ?? item?.areaId ?? null,
      kind: entering.kind,
      label: entering.label,
      entryQuestion: speech,
      status: "active",
      depth: 0,
      verdict: null,
      openedAtTurn: state.turnIndex,
      closedAtTurn: null,
      note: null,
    };
    state = { ...state, threads: [...state.threads, entered] };
    record.entered = entered.label;
  }

  // 6. 收尾，或者说话。答疑（模型标 aside、没进入也没收尾）不算回合、不加深度，超过软顶后按普通回合数。
  if (ending) {
    endInterview(speech, "interviewer");
    return finish();
  }
  const active = activeThread(state);
  const aside = decision.aside && !entered && !opening && asidesUsed(state) < asideAllowance(state);
  const kind: MessageKind = entered ? "question" : opening ? "intro_request" : aside ? "aside" : "probe";
  newMessages.push(message(state, "interviewer", kind, speech, { threadId: active?.id ?? null, toolName: entered ? "enter" : aside ? "aside" : null }));
  if (active && !entered && !aside) state = bumpDepth(state, active);
  state = { ...state, phase: "running" };
  return finish();
}

export { asideAllowance, asidesUsed, turnsLeft, turnsUsed };
