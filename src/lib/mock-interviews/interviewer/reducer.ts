import { randomUUID } from "node:crypto";

import { coverage } from "@/lib/text/similarity";

import type { CandidateIntent, InterviewerAction, ThreadVerdict } from "./actions";
import { atSafetyCap, canAct, nextAreaToOpen } from "./budget";
import { applyMemoryPatch, type MemoryPatch } from "./memory";
import { threadSegment, type ThreadSegment } from "./segments";
import {
  activeThread,
  areaById,
  lastInterviewerQuestion,
  openHypotheses,
  threadKind,
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
 * 结束 / 卡住 / 否定简历）、不被允许的动作、模型失败，都由 `planTurn` / `ruleTurn` 定成
 * 确定性的动作，模型再把定下的动作说成人话（两步回合，见 turn.ts）。
 * 全程纯函数，返回新状态、要落库的消息、副作用与一条决策记录。
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
  | { type: "action_replaced"; requested: string | null; applied: string; reason: string }
  /** 模型换题的话没落到下一领域的切入问题上，换成固定过渡 + 简报原句。 */
  | { type: "speech_replaced"; reason: string };

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

/** 代码定动作、模型只写话时的任务：开场白、一次提示、卡住换题、对质简历。 */
export type SpeechTask = "intro" | "hint" | "stuck" | "confront";

/**
 * 这一回合谁做主：
 * - model：模型自己提动作并说话（正常回合）；
 * - forced：代码定动作，模型只把话说出来；
 * - fixed：代码定动作与话，不调模型（跳过 / 再说一遍 / 结束）。
 */
export type TurnPlan =
  | { kind: "model" }
  | { kind: "forced"; action: InterviewerAction; task: SpeechTask }
  | { kind: "fixed"; action: InterviewerAction | null };

/** 面试官在没有模型话语时的固定措辞：跳过 / 再说一遍 / 结束由代码说；其余只在模型失败时用。 */
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
/** 换题的话至少要覆盖切入问题这么多（3 元字符组），否则视为模型还在问上一题。 */
export const NEXT_QUESTION_COVERAGE_MIN = 0.3;

/**
 * 关线程换题时模型的话必须落到下一题上（可以改写，不能是上一题换个问法）：
 * 覆盖不到就用固定过渡 + 简报原句。模型没说话不算替换。
 */
export function speechForNextQuestion(speech: string, prefix: string, question: string): { content: string; replaced: boolean } {
  if (speech && coverage(speech, question) >= NEXT_QUESTION_COVERAGE_MIN) return { content: speech, replaced: false };
  return { content: `${prefix}\n\n${question}`, replaced: speech.length > 0 };
}

/**
 * 开题时模型给的 question 必须是那道题（areaId）的问题（可以改写）：模型偶尔把 areaId 和别的题的问题配错，
 * 一道题就会被问两遍、另一道题被顶掉。对不上就用简报里那道题的原句。
 */
export function questionForArea(state: InterviewerState, input: { areaId: string; question: string }): string {
  const entry = areaById(state, input.areaId)?.entryQuestion;
  if (!entry || coverage(input.question, entry) >= NEXT_QUESTION_COVERAGE_MIN) return input.question;
  return entry;
}

/** 线程 note 里只有面试官自己写的才算判断。 */
export function interviewerNote(note: string | null): string | null {
  return note && note !== SYSTEM_CLOSE_NOTE ? note : null;
}

/**
 * 代码的确定性下一步：开场先请自我介绍；有线程就关掉；没线程就开当前阶段下一道没问过的题；
 * 各阶段走完或到安全上限就收尾。
 */
export function fallbackAction(state: InterviewerState): InterviewerAction {
  if (state.phase === "opening" && state.brief.askIntro) {
    return { name: "ask_intro", input: {} };
  }
  if (activeThread(state)) {
    return { name: "close_thread", input: { note: SYSTEM_CLOSE_NOTE, verdict: null } };
  }
  if (atSafetyCap(state)) {
    return { name: "close_interview", input: { reason: "提问次数已到安全上限" } };
  }
  const area = nextAreaToOpen(state);
  if (area) {
    return { name: "open_thread", input: { areaId: area.id, question: area.entryQuestion } };
  }
  return { name: "close_interview", input: { reason: "各阶段已走完" } };
}

/** 这一回合的分支：候选人插话与开场由代码定，其余交给模型。 */
export function planTurn(state: InterviewerState, intent: CandidateIntent): TurnPlan {
  if (state.phase === "ended") return { kind: "fixed", action: null };
  if (state.phase === "opening" && state.brief.askIntro) {
    return { kind: "forced", action: { name: "ask_intro", input: {} }, task: "intro" };
  }
  const active = activeThread(state);
  const kind = active ? threadKind(state, active) : null;
  // "没做过"只在考简历项目时算否认简历；场景题 / 基础题上说没做过就是卡住。
  const denying = intent === "deny" && kind === "project";
  switch (denying ? "deny" : intent === "deny" ? "hint" : intent) {
    case "skip":
      return { kind: "fixed", action: active ? { name: "close_thread", input: { note: THREAD_NOTES.skipped, verdict: null } } : fallbackAction(state) };
    case "repeat":
      return { kind: "fixed", action: null };
    case "end":
      return { kind: "fixed", action: { name: "close_interview", input: { reason: "候选人要求结束" } } };
    case "hint":
      if (!active) return { kind: "model" };
      // 基础题不给台阶：答不上就下一题。项目与场景题给一次提示，第二次卡住换题。
      return active.hinted || kind === "quick"
        ? { kind: "forced", action: { name: "close_thread", input: { note: THREAD_NOTES.stuck, verdict: "failed" } }, task: "stuck" }
        : { kind: "forced", action: { name: "hint", input: {} }, task: "hint" };
    case "deny":
      if (!active) return { kind: "model" };
      return { kind: "forced", action: { name: "close_thread", input: { note: THREAD_NOTES.denied, verdict: "failed" } }, task: "confront" };
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
    thinStreak: 0,
    verdict: null,
    openedAtTurn: turn,
    closedAtTurn: null,
    note: null,
  };
}

function updateThread(state: InterviewerState, thread: ThreadState): InterviewerState {
  return { ...state, threads: state.threads.map((item) => (item.id === thread.id ? thread : item)) };
}

function closeThread(
  state: InterviewerState,
  thread: ThreadState,
  input: { note: string | null; verdict: ThreadVerdict | null; skipped: boolean },
  messages: MessageState[],
) {
  const closed: ThreadState = {
    ...thread,
    status: input.skipped ? "skipped" : "closed",
    closedAtTurn: state.turnIndex,
    note: input.note ?? thread.note,
    verdict: input.skipped ? null : input.verdict,
  };
  const segment = threadSegment(closed, [...state.messages, ...messages]);
  const finalThread = segment.skipped ? { ...closed, status: "skipped" as const } : closed;
  const effect: TurnEffect = { type: "thread_closed", thread: finalThread, segment };
  return { state: updateThread(state, finalThread), effect };
}

/** 候选人否定了简历内容：记失守，否定挂在这个领域上的简历假设。 */
function denyResume(state: InterviewerState, thread: ThreadState): InterviewerState {
  const areaName = areaById(state, thread.areaId)?.name ?? thread.areaId;
  return {
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
}

function canDo(state: InterviewerState, action: InterviewerAction) {
  return canAct(state, action.name, "areaId" in action.input ? { areaId: action.input.areaId } : {});
}

function truncateHint(text: string): string {
  return text.length > HINT_HARD_LIMIT ? `${text.slice(0, HINT_HARD_LIMIT).trimEnd()}……` : text;
}

/** 同一项目的其余领域：候选人否定这个项目后它们直接标记跳过。 */
function deniedSiblings(state: InterviewerState, areaId: string): ThreadState[] {
  const area = areaById(state, areaId);
  if (!area?.projectId) return [];
  return state.brief.areas
    .filter((sibling) => sibling.id !== area.id && sibling.projectId === area.projectId && !threadOfArea(state, sibling.id))
    .map((sibling) => ({
      ...newThread(state, sibling.id, sibling.entryQuestion),
      status: "skipped" as const,
      closedAtTurn: state.turnIndex,
      note: THREAD_NOTES.deniedProject,
    }));
}

/**
 * 关掉当前线程之后的状态（只算线程，不落消息）：接续动作的预算检查按它来算。
 * 否定简历时同项目的其余领域也已标记跳过，接续不会再开到它们。
 */
function afterClose(state: InterviewerState, thread: ThreadState, intent: CandidateIntent): InterviewerState {
  const closed = updateThread(state, { ...thread, status: "closed", closedAtTurn: state.turnIndex });
  return intent === "deny" ? { ...closed, threads: [...closed.threads, ...deniedSiblings(closed, thread.areaId)] } : closed;
}

/** 这一回合最终要做的事：动作、close_thread 之后的接续、被换掉的提案。 */
export type TurnRuling = {
  plan: TurnPlan;
  /** 本回合的动作；只有"再说一遍"为 null。 */
  action: InterviewerAction | null;
  /** close_thread 之后紧接的动作（open_thread / close_interview）。 */
  next: InterviewerAction | null;
  replaced: { requested: string | null; applied: string; reason: string }[];
};

/**
 * 裁决：代码分支直接用；模型的提案过预算检查，不允许或模型失败时换成代码的下一步。
 * 两步回合在这一步之后才让模型说话，所以模型永远在为最终动作说话。
 */
export function ruleTurn(state: InterviewerState, candidate: CandidateInput | null, decision: TurnDecision): TurnRuling {
  const plan = planTurn(state, candidate?.intent ?? null);
  const replaced: TurnRuling["replaced"] = [];
  const replace = (requested: string | null, reason: string): InterviewerAction => {
    const applied = fallbackAction(state);
    replaced.push({ requested, applied: applied.name, reason });
    return applied;
  };
  let action: InterviewerAction | null;
  if (plan.kind === "model") {
    action = decision.action;
    if (action) {
      const check = canDo(state, action);
      if (!check.ok) action = replace(action.name, check.reason);
    } else {
      action = replace(null, decision.failed ? "模型回合失败" : "模型没有可用动作");
    }
  } else {
    action = plan.action;
  }

  let next: InterviewerAction | null = null;
  if (action?.name === "close_thread") {
    // 关掉一段之后紧接着开下一段或收尾，候选人不用面对一句"到这里"却没有下文。
    // 模型自己紧接着做的下一步优先；没有或不被允许时由代码决定。
    const closed = afterClose(state, activeThread(state)!, candidate?.intent ?? null);
    const wanted = plan.kind === "model" ? decision.followUp ?? null : null;
    next = wanted && canDo(closed, wanted).ok ? wanted : fallbackAction(closed);
    if (wanted && next !== wanted) replaced.push({ requested: wanted.name, applied: next.name, reason: "接续动作不被允许" });
  }
  return { plan, action, next, replaced };
}

/** 应用回合：候选人消息、记忆更新、裁决出的动作与面试官的话。 */
export function applyTurn(
  initial: InterviewerState,
  candidate: CandidateInput | null,
  decision: TurnDecision,
): TurnResult {
  let state = initial;
  const newMessages: MessageState[] = [];
  const effects: TurnEffect[] = [];
  const ruling = ruleTurn(state, candidate, decision);
  const record: TurnDecisionRecord = {
    proposed: ruling.plan.kind === "model" ? decision.action?.name ?? null : ruling.plan.action?.name ?? null,
    applied: ruling.action?.name ?? null,
    followUp: ruling.next?.name ?? null,
    replacedReason: ruling.replaced[0]?.reason ?? null,
    anchorHit: decision.anchorHit ?? null,
  };

  if (state.phase === "ended") {
    return { state, newMessages, effects, decision: record };
  }
  for (const item of ruling.replaced) effects.push({ type: "action_replaced", ...item });
  // 模型的话是为裁决出的动作说的（两步回合）；代码定话的分支没有模型的话。
  const speech = ruling.plan.kind === "fixed" ? "" : decision.speech.trim();
  const intent = candidate?.intent ?? null;

  // 1. 候选人消息落进当前线程（自我介绍等线程外的话 threadId 为空）。插话不算回答。
  if (candidate) {
    newMessages.push(
      message(state, "candidate", intent ? "aside" : "answer", candidate.content, {
        id: candidate.id,
        threadId: activeThread(state)?.id ?? null,
        metrics: candidate.metrics ?? null,
      }),
    );
  }

  // 2. 记忆更新（挂在当前线程的领域上）。
  if (decision.memoryPatch) {
    state = {
      ...state,
      memory: applyMemoryPatch(state.memory, decision.memoryPatch, {
        turn: state.turnIndex,
        areaId: activeThread(state)?.areaId ?? null,
      }),
    };
  }

  // 3. 应用动作。
  const say = (kind: MessageKind, content: string, extra: { threadId?: string | null; toolName?: string | null } = {}) =>
    newMessages.push(message(state, "interviewer", kind, content, extra));
  const endInterview = (content: string) => {
    say("closing", content, { toolName: "close_interview" });
    state = { ...state, phase: "ended" };
    effects.push({ type: "interview_ended" });
  };
  const openThread = (input: { areaId: string; question: string }, content: string) => {
    const thread = newThread(state, input.areaId, questionForArea(state, input));
    state = { ...state, threads: [...state.threads, thread], phase: "running" };
    say("question", content || thread.entryQuestion, { threadId: thread.id, toolName: "open_thread" });
  };

  const action = ruling.action;
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
        // 模型的话也要落在这道题上：配错题的问题改用简报原句时，话跟着换。
        const question = questionForArea(state, action.input);
        const said = question === action.input.question ? { content: speech, replaced: false } : speechForNextQuestion(speech, "", question);
        if (said.replaced) effects.push({ type: "speech_replaced", reason: "开题的问题与这道题对不上" });
        openThread(action.input, said.content.trim());
        break;
      }
      case "probe": {
        const active = activeThread(state)!;
        const thinStreak = action.input.lastAnswer === "thin" ? active.thinStreak + 1 : 0;
        state = updateThread(state, { ...active, depth: active.depth + 1, thinStreak });
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
        // 面试官自己关的线程里还有没验证的假设：记在 note 后面，状态留给汇总判。
        const unverified = ruling.plan.kind === "model" ? openHypotheses(state, active.areaId).map((item) => item.id) : [];
        const note = unverified.length > 0 ? `${action.input.note}（没验证到 ${unverified.join("、")}）` : action.input.note;
        const closed = closeThread(state, active, { note, verdict: action.input.verdict, skipped: intent === "skip" }, newMessages);
        state = closed.state;
        effects.push(closed.effect);
        if (intent === "hint") {
          const areaName = areaById(state, active.areaId)?.name ?? active.areaId;
          state = { ...state, memory: { ...state.memory, failed: [...state.memory.failed, { areaId: active.areaId, text: `${areaName}：${THREAD_NOTES.stuck}`, turn: state.turnIndex }] } };
        }
        if (intent === "deny") {
          state = denyResume(state, active);
          for (const sibling of deniedSiblings(state, active.areaId)) {
            state = { ...state, threads: [...state.threads, sibling] };
            effects.push({ type: "thread_closed", thread: sibling, segment: threadSegment(sibling, []) });
          }
        }
        const prefix = intent === "skip" ? FALLBACK_SPEECH.skipped : intent === "hint" ? FALLBACK_SPEECH.stuck : FALLBACK_SPEECH.transition;
        const next = ruling.next!;
        if (next.name === "open_thread") {
          const said = speechForNextQuestion(speech, prefix, questionForArea(state, next.input));
          if (said.replaced) effects.push({ type: "speech_replaced", reason: "换题的话没落到下一题上" });
          openThread(next.input, said.content);
        } else {
          endInterview(speech || FALLBACK_SPEECH.closeInterview);
        }
        break;
      }
      case "close_interview": {
        const active = activeThread(state);
        if (active) {
          const closed = closeThread(state, active, { note: null, verdict: null, skipped: intent === "skip" }, newMessages);
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
