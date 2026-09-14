import "server-only";

import { randomUUID } from "node:crypto";

import type { UIMessageChunk } from "ai";

import type { SkillPack } from "../skills/types";
import type { CandidateIntent } from "./actions";
import type { MemoryPatch } from "./memory";
import { applyTurn, planTurn, turnsUsed, type CandidateInput, type TurnDecision, type TurnDecisionRecord, type TurnResult } from "./reducer";
import type { InterviewerState, MessageMetrics, MessageState } from "./state";
import { runTurnAgent } from "./turn-agent";

/**
 * 一个面试官回合的纯核心：分支 → 模型一次调用 → reducer。不知道状态从哪来、写到哪去：
 * 本地版从数据库装配并落库（session.ts），体验版从浏览器带上来、结果原样带回去。
 *
 * 只有两种回合不调模型：候选人按了"结束"，或总回合预算用完——固定告别语直接流回。
 * 模型偶发失败（超时、5xx）用一句固定的话接上；额度 / 密钥这类不可恢复的错误直接抛出。
 */

export type TurnCandidate = {
  content: string;
  intent: CandidateIntent;
  /** 作答元数据：本地版按上一条面试官消息的落库时间算，体验版由浏览器算。 */
  metrics?: MessageMetrics | null;
};

/** 每回合一条决策记录：本地版写 InterviewTurnDecision，体验版存进会话文档，trace 页两边读同一形状。 */
export type TurnDecisionRow = TurnDecisionRecord & {
  turnIndex: number;
  runId: string;
  memoryPatch: MemoryPatch | null;
  /** 本回合结束后面试官已说了几回合（预算按它算）。 */
  turnsUsed: number;
  skillsLoaded: number;
  effects: string[];
};

export type TurnOutcome = { result: TurnResult; decision: TurnDecisionRow };

/** 给 HTTP 响应的流：模型回合是 streamText 的结果，固定措辞的回合是一段现成文本。 */
export type TurnStream = { toUIMessageStream: () => ReadableStream<UIMessageChunk> };

export type TurnRun = {
  stream: TurnStream;
  /** 流结束后调用：应用 reducer，返回新状态、新消息、副作用与决策记录。 */
  finalize: () => Promise<TurnOutcome>;
};

function fixedSpeechStream(messages: MessageState[]): TurnStream {
  const text = messages.filter((message) => message.role === "interviewer").map((message) => message.content).join("\n\n");
  return {
    toUIMessageStream: () =>
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          const id = randomUUID();
          controller.enqueue({ type: "text-start", id });
          controller.enqueue({ type: "text-delta", id, delta: text });
          controller.enqueue({ type: "text-end", id });
          controller.close();
        },
      }),
  };
}

function decisionRow(input: { runId: string; state: InterviewerState }, result: TurnResult, memoryPatch: MemoryPatch | null, skillsLoaded: number): TurnDecisionRow {
  return {
    ...result.decision,
    turnIndex: input.state.turnIndex,
    runId: input.runId,
    memoryPatch,
    turnsUsed: turnsUsed(result.state),
    skillsLoaded,
    effects: result.effects.map((effect) => effect.type),
  };
}

export async function runInterviewerTurn(input: {
  runId: string;
  state: InterviewerState;
  candidate: TurnCandidate | null;
  context: { jobTitle: string; jobDescription: string; resumeText: string };
  skillPacks: SkillPack[];
}): Promise<TurnRun> {
  const candidateInput: CandidateInput | null = input.candidate
    ? { id: randomUUID(), content: input.candidate.content, intent: input.candidate.intent, metrics: input.candidate.metrics ?? null }
    : null;
  const empty: TurnDecision = { speech: "", plan: null, leave: null, enter: null, ended: false, aside: false, memoryPatch: null };

  if (planTurn(input.state, candidateInput?.intent ?? null).kind === "fixed") {
    const result = applyTurn(input.state, candidateInput, empty);
    return {
      stream: fixedSpeechStream(result.newMessages),
      finalize: async () => ({ result, decision: decisionRow(input, result, null, 0) }),
    };
  }

  const { stream, settled } = await runTurnAgent({
    runId: input.runId,
    state: input.state,
    candidate: input.candidate ? { content: input.candidate.content } : null,
    context: input.context,
    skillPacks: input.skillPacks,
  });
  return {
    stream,
    finalize: async () => {
      const { decision, skillsLoaded } = await settled;
      const result = applyTurn(input.state, candidateInput, decision);
      return { result, decision: decisionRow(input, result, decision.memoryPatch, skillsLoaded) };
    },
  };
}
