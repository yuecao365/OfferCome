import { randomUUID } from "node:crypto";

import type { InterviewerAction, CandidateIntent } from "./actions";
import { atMaximum, canAct, IDLE_TURNS_BEFORE_FORCE, nextAreaToOpen } from "./budget";
import { applyMemoryPatch, type MemoryPatch } from "./memory";
import { threadSegment, type ThreadSegment } from "./segments";
import {
  activeThread,
  areaById,
  lastInterviewerQuestion,
  type InterviewerState,
  type MessageKind,
  type MessageState,
  type ThreadState,
} from "./state";

/**
 * 回合 reducer：把"候选人这条消息 + 模型的决定"应用到状态上。
 * 模型的动作先过预算检查，不允许的动作由代码换成确定性的下一步；
 * 全程纯函数，返回新状态、要落库的消息与副作用。
 */

export type TurnDecision = {
  speech: string;
  action: InterviewerAction | null;
  /** close_thread 之后模型紧接着做的下一步（open_thread / close_interview）。 */
  followUp?: InterviewerAction | null;
  memoryPatch: MemoryPatch | null;
  /** 模型失败时为 true：speech 为空，由代码生成。 */
  failed?: boolean;
};

export type TurnEffect =
  | { type: "thread_closed"; thread: ThreadState; segment: ThreadSegment }
  | { type: "interview_ended" }
  | { type: "action_replaced"; requested: string | null; applied: string; reason: string };

export type TurnResult = {
  state: InterviewerState;
  newMessages: MessageState[];
  effects: TurnEffect[];
};

export type CandidateInput = {
  id: string;
  content: string;
  intent: CandidateIntent;
};

function message(
  state: InterviewerState,
  role: MessageState["role"],
  kind: MessageKind,
  content: string,
  extra: { threadId?: string | null; toolName?: string | null; id?: string } = {},
): MessageState {
  return {
    id: extra.id ?? randomUUID(),
    turnIndex: state.turnIndex,
    role,
    kind,
    content: content.trim(),
    threadId: extra.threadId ?? null,
    toolName: extra.toolName ?? null,
  };
}

/** 面试官在没有模型话语时的固定措辞。 */
export const FALLBACK_SPEECH = {
  askIntro: "你好，我们开始吧。请先用一两分钟做个自我介绍，重点讲讲和这个岗位相关的经历。",
  transition: "好，这一块我们先到这里。",
  closeInterview: "好的，今天的面试就到这里，感谢你的时间。稍后你会看到这场面试的报告。",
  skipped: "没问题，这题我们跳过。",
  noHint: "这一题我就不再提示了，我们换个方向。",
  repeatPrefix: "我再说一遍：",
  probeFallback: "能再具体一点吗？比如你当时是怎么做的，遇到了什么问题。",
} as const;

/**
 * 面试官这回合对候选人说的完整一段话。模型的话里几乎总是带着问句（常是工具入参
 * 问句的改写），这时不再追加，否则同一个问题会问两遍；只有话里一个问句都没有
 * （纯过渡语）时，才把工具入参里的问句接在后面。
 */
export function utterance(speech: string, question: string): string {
  const said = speech.trim();
  const asked = question.trim();
  if (!said) return asked;
  if (!asked || /[?？]/.test(said)) return said;
  return `${said}

${asked}`;
}

/** 代码的确定性下一步：用于模型无动作、动作不被允许、或模型失败。 */
export function fallbackAction(state: InterviewerState): InterviewerAction {
  if (state.phase === "opening" && state.brief.askIntro) {
    return { name: "ask_intro", input: {} };
  }
  const active = activeThread(state);
  if (active) {
    return { name: "close_thread", input: { note: "（由系统推进）" } };
  }
  if (atMaximum(state)) {
    return { name: "close_interview", input: { reason: "回合已到上限" } };
  }
  const areaId = nextAreaToOpen(state);
  const area = areaId ? areaById(state, areaId) : null;
  if (area) {
    return { name: "open_thread", input: { areaId: area.id, question: area.entryQuestion } };
  }
  return { name: "close_interview", input: { reason: "没有可开的领域" } };
}

function closeActive(
  state: InterviewerState,
  input: { note: string | null; skipped: boolean },
  messages: MessageState[],
): { state: InterviewerState; effect: TurnEffect | null } {
  const active = activeThread(state);
  if (!active) return { state, effect: null };
  const closed: ThreadState = {
    ...active,
    status: input.skipped ? "skipped" : "closed",
    closedAtTurn: state.turnIndex,
    note: input.note ?? active.note,
  };
  const threads = state.threads.map((thread) => (thread.id === closed.id ? closed : thread));
  const segment = threadSegment(closed, [...state.messages, ...messages]);
  const finalThread = segment.skipped ? { ...closed, status: "skipped" as const } : closed;
  return {
    state: { ...state, threads: threads.map((t) => (t.id === finalThread.id ? finalThread : t)) },
    effect: { type: "thread_closed", thread: finalThread, segment },
  };
}

function resolveIntent(
  state: InterviewerState,
  intent: CandidateIntent,
): { action: InterviewerAction | null; speech: string | null } {
  const active = activeThread(state);
  switch (intent) {
    case "skip":
      return active
        ? { action: { name: "close_thread", input: { note: "候选人要求跳过" } }, speech: FALLBACK_SPEECH.skipped }
        : { action: null, speech: null };
    case "hint":
      if (!active) return { action: null, speech: null };
      return canAct(state, "rescue").ok
        ? { action: null, speech: null } // 交给模型给提示（它会用 rescue）
        : { action: { name: "close_thread", input: { note: "候选人第二次要求提示，已到提示上限" } }, speech: FALLBACK_SPEECH.noHint };
    case "repeat": {
      const last = lastInterviewerQuestion(state);
      return { action: null, speech: last ? `${FALLBACK_SPEECH.repeatPrefix}${last.content}` : null };
    }
    case "end":
      return { action: { name: "close_interview", input: { reason: "候选人要求结束" } }, speech: null };
    default:
      return { action: null, speech: null };
  }
}

export function applyTurn(
  initial: InterviewerState,
  candidate: CandidateInput | null,
  decision: TurnDecision,
): TurnResult {
  let state = initial;
  const newMessages: MessageState[] = [];
  const effects: TurnEffect[] = [];

  if (state.phase === "ended") {
    return { state, newMessages, effects };
  }

  // 1. 候选人消息落进当前线程（没有线程时是插话）。
  if (candidate) {
    const active = activeThread(state);
    newMessages.push(
      message(state, "candidate", active ? "answer" : "aside", candidate.content, {
        id: candidate.id,
        threadId: active?.id ?? null,
      }),
    );
  }

  // 2. 候选人插话优先于模型的决定；hint 留给模型（它会用 rescue）。
  const intent = candidate ? resolveIntent(state, candidate.intent) : { action: null, speech: null };
  let action: InterviewerAction | null = intent.action ?? decision.action;
  const speech = intent.speech ?? decision.speech.trim();
  const skippedByCandidate = candidate?.intent === "skip";
  const endedByCandidate = candidate?.intent === "end";

  // 3. 预算检查；不允许或连续空转时换成代码的下一步。
  const requested = action?.name ?? null;
  if (action) {
    const check = canAct(state, action.name, "areaId" in action.input ? { areaId: action.input.areaId } : {});
    if (!check.ok) {
      const replaced = fallbackAction(state);
      effects.push({ type: "action_replaced", requested, applied: replaced.name, reason: check.reason });
      action = replaced;
    }
  } else if (
    decision.failed ||
    state.phase === "opening" ||
    !speech ||
    state.idleTurns + 1 >= IDLE_TURNS_BEFORE_FORCE
  ) {
    // 开场必须有动作；一句话都没有的回合没有意义；连续空转也要推进。
    const replaced = fallbackAction(state);
    effects.push({
      type: "action_replaced",
      requested: null,
      applied: replaced.name,
      reason: decision.failed
        ? "模型回合失败"
        : state.phase === "opening"
          ? "开场"
          : !speech
            ? "模型没有话语"
            : "连续无推进动作",
    });
    action = replaced;
  }
  // close_interview 在不允许时会被 fallback 换掉；候选人明确要求结束则强制允许。
  if (endedByCandidate) action = { name: "close_interview", input: { reason: "候选人要求结束" } };

  // 4. 记忆更新（挂在当前线程的领域上）。
  if (decision.memoryPatch) {
    state = {
      ...state,
      memory: applyMemoryPatch(state.memory, decision.memoryPatch, {
        turn: state.turnIndex,
        areaId: activeThread(state)?.areaId ?? null,
      }),
    };
  }

  // 5. 应用动作。
  if (!action) {
    if (speech) newMessages.push(message(state, "interviewer", "aside", speech));
    state = { ...state, idleTurns: state.idleTurns + 1, phase: "running" };
  } else {
    state = { ...state, idleTurns: 0 };
    switch (action.name) {
      case "ask_intro": {
        newMessages.push(
          message(state, "interviewer", "intro_request", speech || FALLBACK_SPEECH.askIntro, { toolName: action.name }),
        );
        state = { ...state, phase: "running" };
        break;
      }
      case "open_thread": {
        const thread: ThreadState = {
          id: randomUUID(),
          areaId: action.input.areaId,
          entryQuestion: action.input.question.trim(),
          status: "active",
          depth: 0,
          rescues: 0,
          openedAtTurn: state.turnIndex,
          closedAtTurn: null,
          note: null,
        };
        state = { ...state, threads: [...state.threads, thread], phase: "running" };
        newMessages.push(
          message(state, "interviewer", "question", utterance(speech, thread.entryQuestion), {
            threadId: thread.id,
            toolName: action.name,
          }),
        );
        break;
      }
      case "probe": {
        const active = activeThread(state)!;
        const updated = { ...active, depth: active.depth + 1 };
        state = { ...state, threads: state.threads.map((t) => (t.id === updated.id ? updated : t)) };
        newMessages.push(
          message(state, "interviewer", "probe", utterance(speech, action.input.question), {
            threadId: active.id,
            toolName: action.name,
          }),
        );
        break;
      }
      case "rescue": {
        const active = activeThread(state)!;
        const updated = { ...active, rescues: active.rescues + 1 };
        state = { ...state, threads: state.threads.map((t) => (t.id === updated.id ? updated : t)) };
        newMessages.push(
          message(state, "interviewer", "rescue", utterance(speech, action.input.hint), {
            threadId: active.id,
            toolName: action.name,
          }),
        );
        break;
      }
      case "close_thread": {
        const closed = closeActive(state, { note: action.input.note, skipped: skippedByCandidate }, newMessages);
        state = closed.state;
        if (closed.effect) effects.push(closed.effect);
        // 关掉一段之后紧接着开下一段或收尾，候选人不用面对一句"到这里"却没有下文。
        // 优先用模型自己紧接着做的下一步；没有或不被允许时由代码决定。
        const wanted = decision.followUp;
        const next: InterviewerAction =
          wanted && canAct(state, wanted.name, "areaId" in wanted.input ? { areaId: wanted.input.areaId } : {}).ok
            ? wanted
            : fallbackAction(state);
        if (wanted && next !== wanted) {
          effects.push({ type: "action_replaced", requested: wanted.name, applied: next.name, reason: "接续动作不被允许" });
        }
        if (next.name === "open_thread") {
          // 代码兜底开线程时，模型的话里若已带着问句，就以它为切入问题，不重复简报里的那句。
          const asked = wanted === next || !/[?？]/.test(speech) ? next.input.question : speech;
          const thread: ThreadState = {
            id: randomUUID(),
            areaId: next.input.areaId,
            entryQuestion: asked.trim(),
            status: "active",
            depth: 0,
            rescues: 0,
            openedAtTurn: state.turnIndex,
            closedAtTurn: null,
            note: null,
          };
          state = { ...state, threads: [...state.threads, thread] };
          newMessages.push(
            message(state, "interviewer", "question", utterance(speech || FALLBACK_SPEECH.transition, thread.entryQuestion), {
              threadId: thread.id,
              toolName: "open_thread",
            }),
          );
        } else {
          // 被迫收尾时模型的话往往还在提问，不能让面试停在一个问句上。
          const closing =
            wanted === next || !/[?？]/.test(speech)
              ? utterance(speech, FALLBACK_SPEECH.closeInterview)
              : FALLBACK_SPEECH.closeInterview;
          newMessages.push(message(state, "interviewer", "closing", closing, { toolName: "close_interview" }));
          state = { ...state, phase: "ended" };
          effects.push({ type: "interview_ended" });
        }
        break;
      }
      case "close_interview": {
        const closed = closeActive(state, { note: null, skipped: skippedByCandidate }, newMessages);
        state = closed.state;
        if (closed.effect) effects.push(closed.effect);
        newMessages.push(message(state, "interviewer", "closing", speech || FALLBACK_SPEECH.closeInterview, { toolName: action.name }));
        state = { ...state, phase: "ended" };
        effects.push({ type: "interview_ended" });
        break;
      }
    }
  }

  return {
    state: { ...state, messages: [...state.messages, ...newMessages], turnIndex: state.turnIndex + 1 },
    newMessages,
    effects,
  };
}
