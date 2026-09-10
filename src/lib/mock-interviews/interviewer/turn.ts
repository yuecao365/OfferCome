import "server-only";

import { randomUUID } from "node:crypto";

import type { UIMessageChunk } from "ai";

import type { SkillPack } from "../skills/types";
import type { CandidateIntent } from "./actions";
import { evidenceSummary } from "./evidence";
import type { MemoryPatch } from "./memory";
import { applyTurn, planTurn, ruleTurn, type CandidateInput, type TurnDecision, type TurnResult } from "./reducer";
import type { InterviewerState, MessageMetrics, MessageState } from "./state";
import { decideTurn, speakTurn } from "./turn-agent";

/**
 * 一个面试官回合的纯核心：定分支 → 决定 → 裁决 → 说话 → reducer。不知道状态从哪来、写到哪去：
 * 本地版从数据库装配并落库（session.ts），体验版从浏览器带上来、结果原样带回去。
 *
 * 候选人的插话由代码定分支（reducer.planTurn）：跳过 / 再说一遍 / 结束 / 卡住第二次不调模型，
 * 固定措辞直接流回；开场、一次提示、对质简历由代码定动作、模型只写话；其余回合模型先用工具
 * 决定（decideTurn），代码裁决（ruleTurn）后再让模型为最终动作说话（speakTurn，流式）。
 */

export type TurnCandidate = {
  content: string;
  intent: CandidateIntent;
  /** 作答元数据：本地版按上一条面试官消息的落库时间算，体验版由浏览器算。 */
  metrics?: MessageMetrics | null;
};

/** 每回合一条决策记录：本地版写 InterviewTurnDecision，体验版存进会话文档，trace 页两边读同一形状。 */
export type TurnDecisionRow = {
  turnIndex: number;
  runId: string;
  proposedAction: string | null;
  appliedAction: string | null;
  followUp: string | null;
  replacedReason: string | null;
  anchorHit: boolean | null;
  memoryPatch: MemoryPatch | null;
  evidenceBefore: number;
  evidenceAfter: number;
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

function decisionRow(
  input: { runId: string; state: InterviewerState },
  result: TurnResult,
  memoryPatch: MemoryPatch | null,
  skillsLoaded: number,
): TurnDecisionRow {
  return {
    turnIndex: input.state.turnIndex,
    runId: input.runId,
    proposedAction: result.decision.proposed,
    appliedAction: result.decision.applied,
    followUp: result.decision.followUp,
    replacedReason: result.decision.replacedReason,
    anchorHit: result.decision.anchorHit,
    memoryPatch,
    evidenceBefore: evidenceSummary(input.state).total,
    evidenceAfter: evidenceSummary(result.state).total,
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
  const plan = planTurn(input.state, candidateInput?.intent ?? null);

  if (plan.kind === "fixed") {
    const result = applyTurn(input.state, candidateInput, { speech: "", action: null, memoryPatch: null });
    return {
      stream: fixedSpeechStream(result.newMessages),
      finalize: async () => ({ result, decision: decisionRow(input, result, null, 0) }),
    };
  }

  const agentInput = {
    runId: input.runId,
    state: input.state,
    candidate: input.candidate ? { content: input.candidate.content } : null,
    context: input.context,
    skillPacks: input.skillPacks,
  };
  let decision: TurnDecision = { speech: "", action: null, memoryPatch: null };
  let skillsLoaded = 0;
  if (plan.kind === "model") ({ decision, skillsLoaded } = await decideTurn(agentInput));
  const ruling = ruleTurn(input.state, candidateInput, decision);
  const { stream, settled } = await speakTurn({ ...agentInput, ruling });
  return {
    stream,
    finalize: async () => {
      const { speech } = await settled;
      const result = applyTurn(input.state, candidateInput, { ...decision, speech });
      return { result, decision: decisionRow(input, result, decision.memoryPatch, skillsLoaded) };
    },
  };
}
