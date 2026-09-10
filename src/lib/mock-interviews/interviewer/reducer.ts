import { randomUUID } from "node:crypto";

import type { CandidateIntent, InterviewerAction } from "./actions";
import { atSafetyCap, canAct, nextAreaToOpen } from "./budget";
import { applyMemoryPatch, type MemoryPatch } from "./memory";
import { threadSegment, type ThreadSegment } from "./segments";
import {
  activeThread,
  areaById,
  lastInterviewerQuestion,
  threadOfArea,
  type InterviewerState,
  type MessageKind,
  type MessageMetrics,
  type MessageState,
  type ThreadState,
} from "./state";

/**
 * 回合 reducer：把"候选人这条消息 + 模型的决定"应用到状态上。
 *
 * 面试官的自由只在"问什么、往哪追"；流程分支归代码：开场、候选人插话（跳过 / 再说一遍 /
 * 结束 / 卡住 / 否定简历）、不被允许的动作、模型失败，都由 `planTurn` 定成确定性的动作，
 * 模型只负责把定下的动作说成人话。全程纯函数，返回新状态、要落库的消息、副作用与一条决策记录。
 */

export type TurnDecision = {
  speech: string;
  action: InterviewerAction | null;
  /** close_thread 之后模型紧接着做的下一步（open_thread / close_interview）。 */
  followUp?: InterviewerAction | null;
  memoryPatch: MemoryPatch | null;
  /** probe 的锚点是否真的在候选人回答里；没有追问时为 null。 */
  anchorHit?: boolean | null;
  /** 模型失败时为 true：speech 为空，由代码生成。 */
  failed?: boolean;
};

export type TurnEffect =
  | { type: "thread_closed"; thread: ThreadState; segment: ThreadSegment }
  | { type: "interview_ended" }
  | { type: "action_replaced"; requested: string | null; applied: string; reason: string };

/** 每回合一条：模型提了什么、代码用了什么、为什么换。trace 页面与评测都读它。 */
export type TurnDecisionRecord = {
  proposed: string | null;
  applied: string | null;
  followUp: string | null;
  replacedReason: string | null;
  anchorHit: boolean | null;
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

/** 模型只写话时的任务：开场白、一次提示、对质简历。 */
export type SpeechTask = "intro" | "hint" | "confront";

/**
 * 这一回合谁做主：
 * - model：模型自己提动作并说话（正常回合）；
 * - forced：代码定动作，模型只把话说出来；
 * - fixed：代码定动作与话，不调模型（跳过 / 再说一遍 / 结束 / 卡住第二次）。
 */
export type TurnPlan =
  | { kind: "model" }
  | { kind: "forced"; action: InterviewerAction; task: SpeechTask }
  | { kind: "fixed"; action: InterviewerAction | null };

/** 面试官在没有模型话语时的固定措辞。 */
export const FALLBACK_SPEECH = {
  askIntro: "你好，我们开始吧。请先用一两分钟做个自我介绍，重点讲讲和这个岗位相关的经历。",
  transition: "好，这一块我们先到这里。",
  closeInterview: "好的，今天的面试就到这里，感谢你的时间。稍后你会看到这场面试的报告。",
  skipped: "没问题，这题我们跳过。",
  stuck: "没关系，这题我们先放一放。",
  hint: "换个角度想想：先说你最有把握的那一部分，再说它为什么这么设计。",
  repeatPrefix: "我再说一遍：",
} as const;

/** 代码关线程时写的 note。系统推进的那条不是面试官的判断，报告与汇总都不当判断用。 */
export const SYSTEM_CLOSE_NOTE = "（由系统推进）";
export const THREAD_NOTES = {
  skipped: "候选人要求跳过",
  stuck: "候选人卡住",
  denied: "候选人否认简历所写内容",
  deniedProject: "候选人否认该项目，跳过",
} as const;

/** 提示只给方向；模型超出这个长度时截断兜底。 */
export const HINT_MAX_CHARS = 80;
const HINT_HARD_LIMIT = HINT_MAX_CHARS * 2;

/** 线程 note 里只有面试官自己写的才算判断。 */
export function interviewerNote(note: string | null): string | null {
  return note && note !== SYSTEM_CLOSE_NOTE ? note : null;
}

/**
 * 代码的确定性下一步：开场先请自我介绍；有线程就关掉；没线程就开下一个没考察过的领域；
 * 领域用尽或到安全上限就收尾。
 */
export function fallbackAction(state: InterviewerState): InterviewerAction {
  if (state.phase === "opening" && state.brief.askIntro) {
    return { name: "ask_intro", input: {} };
  }
  if (activeThread(state)) {
    return { name: "close_thread", input: { note: SYSTEM_CLOSE_NOTE } };
  }
  if (atSafetyCap(state)) {
    return { name: "close_interview", input: { reason: "提问次数已到安全上限" } };
  }
  const area = nextAreaToOpen(state);
  if (area) {
    return { name: "open_thread", input: { areaId: area, question: areaById(state, area)!.entryQuestion } };
  }
  return { name: "close_interview", input: { reason: "所有领域已考察" } };
}

/** 这一回合的分支：候选人插话与开场由代码定，其余交给模型。 */
export function planTurn(state: InterviewerState, intent: CandidateIntent): TurnPlan {
  if (state.phase === "ended") return { kind: "fixed", action: null };
  if (state.phase === "opening" && state.brief.askIntro) {
    return { kind: "forced", action: { name: "ask_intro", input: {} }, task: "intro" };
  }
  const active = activeThread(state);
  switch (intent) {
    case "skip":
      return { kind: "fixed", action: active ? { name: "close_thread", input: { note: THREAD_NOTES.skipped } } : fallbackAction(state) };
    case "repeat":
      return { kind: "fixed", action: null };
    case "end":
      return { kind: "fixed", action: { name: "close_interview", input: { reason: "候选人要求结束" } } };
    case "hint":
      if (!active) return { kind: "model" };
      return active.hinted
        ? { kind: "fixed", action: { name: "close_thread", input: { note: THREAD_NOTES.stuck } } }
        : { kind: "forced", action: { name: "hint", input: {} }, task: "hint" };
    case "deny":
      if (!active) return { kind: "model" };
      return { kind: "forced", action: { name: "close_thread", input: { note: THREAD_NOTES.denied } }, task: "confront" };
    default:
      return { kind: "model" };
  }
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
    content: content.trim(),
    threadId: extra.threadId ?? null,
    toolName: extra.toolName ?? null,
    metrics: extra.metrics ?? null,
  };
}

function newThread(state: InterviewerState, areaId: string, entryQuestion: string, turn = state.turnIndex): ThreadState {
  return {
    id: randomUUID(),
    areaId,
    entryQuestion: entryQuestion.trim(),
    status: "active",
    depth: 0,
    hinted: false,
    openedAtTurn: turn,
    closedAtTurn: null,
    note: null,
  };
}

function updateThread(state: InterviewerState, thread: ThreadState): InterviewerState {
  return { ...state, threads: state.threads.map((item) => (item.id === thread.id ? thread : item)) };
}

function closeThread(state: InterviewerState, thread: ThreadState, input: { note: string | null; skipped: boolean }, messages: MessageState[]) {
  const closed: ThreadState = {
    ...thread,
    status: input.skipped ? "skipped" : "closed",
    closedAtTurn: state.turnIndex,
    note: input.note ?? thread.note,
  };
  const segment = threadSegment(closed, [...state.messages, ...messages]);
  const finalThread = segment.skipped ? { ...closed, status: "skipped" as const } : closed;
  const effect: TurnEffect = { type: "thread_closed", thread: finalThread, segment };
  return { state: updateThread(state, finalThread), effect };
}

/**
 * 候选人否定了简历内容：记失守、否定挂在这个领域上的简历假设、同一项目的其余领域直接标记跳过
 * （一条没有对话的 skipped 线程），面试不再回到这个项目。
 */
function denyResume(state: InterviewerState, thread: ThreadState, effects: TurnEffect[]): InterviewerState {
  const area = areaById(state, thread.areaId);
  const areaName = area?.name ?? thread.areaId;
  let next: InterviewerState = {
    ...state,
    memory: {
      ...state.memory,
      failed: [...state.memory.failed, { areaId: thread.areaId, text: `${areaName}：${THREAD_NOTES.denied}`, turn: state.turnIndex }],
      hypotheses: state.memory.hypotheses.map((item) => {
        const linked = state.brief.hypotheses.find((hypothesis) => hypothesis.id === item.id)?.areaId === thread.areaId;
        return linked && item.status === "open" ? { ...item, status: "refuted" as const, note: THREAD_NOTES.denied } : item;
      }),
    },
  };
  if (!area?.projectId) return next;
  for (const sibling of state.brief.areas) {
    if (sibling.id === area.id || sibling.projectId !== area.projectId || threadOfArea(next, sibling.id)) continue;
    const skipped: ThreadState = {
      ...newThread(next, sibling.id, sibling.entryQuestion),
      status: "skipped",
      closedAtTurn: next.turnIndex,
      note: THREAD_NOTES.deniedProject,
    };
    next = { ...next, threads: [...next.threads, skipped] };
    effects.push({ type: "thread_closed", thread: skipped, segment: threadSegment(skipped, []) });
  }
  return next;
}

function canDo(state: InterviewerState, action: InterviewerAction) {
  return canAct(state, action.name, "areaId" in action.input ? { areaId: action.input.areaId } : {});
}

function truncateHint(text: string): string {
  return text.length > HINT_HARD_LIMIT ? `${text.slice(0, HINT_HARD_LIMIT).trimEnd()}……` : text;
}

export function applyTurn(
  initial: InterviewerState,
  candidate: CandidateInput | null,
  decision: TurnDecision,
): TurnResult {
  let state = initial;
  const newMessages: MessageState[] = [];
  const effects: TurnEffect[] = [];
  const plan = planTurn(state, candidate?.intent ?? null);
  const record: TurnDecisionRecord = {
    proposed: plan.kind === "model" ? decision.action?.name ?? null : plan.action?.name ?? null,
    applied: null,
    followUp: plan.kind === "model" ? decision.followUp?.name ?? null : null,
    replacedReason: null,
    anchorHit: decision.anchorHit ?? null,
  };

  if (state.phase === "ended") {
    return { state, newMessages, effects, decision: record };
  }

  const replace = (requested: string | null, reason: string): InterviewerAction => {
    const replaced = fallbackAction(state);
    effects.push({ type: "action_replaced", requested, applied: replaced.name, reason });
    record.replacedReason ??= reason;
    return replaced;
  };

  // 1. 定动作：代码分支直接用；模型的提案过预算检查，不允许或模型失败时换成代码的下一步。
  //    模型的话只在"它为最终动作说的"时采用；动作被换掉后由代码按固定措辞说。
  let action: InterviewerAction | null;
  let speech = decision.speech.trim();
  if (plan.kind === "model") {
    action = decision.action;
    if (action) {
      const check = canDo(state, action);
      if (!check.ok) {
        action = replace(action.name, check.reason);
        speech = "";
      }
    } else {
      action = replace(null, decision.failed ? "模型回合失败" : "模型没有可用动作");
      speech = "";
    }
  } else {
    action = plan.action;
    if (plan.kind === "fixed") speech = "";
  }
  record.applied = action?.name ?? null;

  // 2. 候选人消息落进当前线程（自我介绍等线程外的话 threadId 为空）。插话不算回答。
  if (candidate) {
    newMessages.push(
      message(state, "candidate", candidate.intent ? "aside" : "answer", candidate.content, {
        id: candidate.id,
        threadId: activeThread(state)?.id ?? null,
        metrics: candidate.metrics ?? null,
      }),
    );
  }

  // 3. 记忆更新（挂在当前线程的领域上）。
  if (decision.memoryPatch) {
    state = {
      ...state,
      memory: applyMemoryPatch(state.memory, decision.memoryPatch, {
        turn: state.turnIndex,
        areaId: activeThread(state)?.areaId ?? null,
      }),
    };
  }

  // 4. 应用动作。
  const say = (kind: MessageKind, content: string, extra: { threadId?: string | null; toolName?: string | null } = {}) =>
    newMessages.push(message(state, "interviewer", kind, content, extra));
  const endInterview = (content: string) => {
    say("closing", content, { toolName: "close_interview" });
    state = { ...state, phase: "ended" };
    effects.push({ type: "interview_ended" });
  };

  if (!action) {
    // 只有"再说一遍"没有推进动作：复述上一问。
    const last = lastInterviewerQuestion(state);
    say("aside", `${FALLBACK_SPEECH.repeatPrefix}${last?.content ?? FALLBACK_SPEECH.askIntro}`, { threadId: activeThread(state)?.id ?? null });
  } else {
    switch (action.name) {
      case "ask_intro": {
        say("intro_request", speech || FALLBACK_SPEECH.askIntro, { toolName: action.name });
        state = { ...state, phase: "running" };
        break;
      }
      case "open_thread": {
        const thread = newThread(state, action.input.areaId, action.input.question);
        state = { ...state, threads: [...state.threads, thread], phase: "running" };
        say("question", speech || thread.entryQuestion, { threadId: thread.id, toolName: action.name });
        break;
      }
      case "probe": {
        const active = activeThread(state)!;
        state = updateThread(state, { ...active, depth: active.depth + 1 });
        say("probe", speech || action.input.question, { threadId: active.id, toolName: action.name });
        break;
      }
      case "hint": {
        const active = activeThread(state)!;
        state = updateThread(state, { ...active, hinted: true });
        say("hint", truncateHint(speech || FALLBACK_SPEECH.hint), { threadId: active.id, toolName: action.name });
        break;
      }
      case "close_thread": {
        const active = activeThread(state)!;
        const intent = candidate?.intent ?? null;
        const closed = closeThread(state, active, { note: action.input.note, skipped: intent === "skip" }, newMessages);
        state = closed.state;
        effects.push(closed.effect);
        if (intent === "hint") {
          state = { ...state, memory: { ...state.memory, failed: [...state.memory.failed, { areaId: active.areaId, text: `${areaById(state, active.areaId)?.name ?? active.areaId}：${THREAD_NOTES.stuck}`, turn: state.turnIndex }] } };
        }
        if (intent === "deny") state = denyResume(state, active, effects);
        // 关掉一段之后紧接着开下一段或收尾，候选人不用面对一句"到这里"却没有下文。
        // 模型自己紧接着做的下一步优先；没有或不被允许时由代码决定，这时模型的话不是为
        // 下一步说的，换成固定措辞（代码定动作、模型只写话的回合除外：它已被告知下一步）。
        const wanted = plan.kind === "model" ? decision.followUp ?? null : null;
        const next: InterviewerAction = wanted && canDo(state, wanted).ok ? wanted : fallbackAction(state);
        if (wanted && next !== wanted) {
          effects.push({ type: "action_replaced", requested: wanted.name, applied: next.name, reason: "接续动作不被允许" });
          record.replacedReason ??= "接续动作不被允许";
        }
        if (plan.kind === "model" && next !== wanted) speech = "";
        record.followUp = next.name;
        const prefix = intent === "skip" ? FALLBACK_SPEECH.skipped : intent === "hint" ? FALLBACK_SPEECH.stuck : FALLBACK_SPEECH.transition;
        if (next.name === "open_thread") {
          const thread = newThread(state, next.input.areaId, next.input.question);
          state = { ...state, threads: [...state.threads, thread] };
          say("question", speech || `${prefix}\n\n${thread.entryQuestion}`, { threadId: thread.id, toolName: "open_thread" });
        } else {
          endInterview(speech || FALLBACK_SPEECH.closeInterview);
        }
        break;
      }
      case "close_interview": {
        const active = activeThread(state);
        if (active) {
          const closed = closeThread(state, active, { note: null, skipped: candidate?.intent === "skip" }, newMessages);
          state = closed.state;
          effects.push(closed.effect);
        }
        endInterview(speech || FALLBACK_SPEECH.closeInterview);
        break;
      }
    }
  }

  return {
    state: { ...state, messages: [...state.messages, ...newMessages], turnIndex: state.turnIndex + 1 },
    newMessages,
    effects,
    decision: record,
  };
}
