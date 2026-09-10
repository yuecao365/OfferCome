import "server-only";

import { randomUUID } from "node:crypto";

import type { SkillPack } from "../skills/types";
import type { CandidateIntent } from "./actions";
import { evidenceSummary } from "./evidence";
import type { MemoryPatch } from "./memory";
import { applyTurn, type CandidateInput, type TurnResult } from "./reducer";
import type { InterviewerState, MessageMetrics } from "./state";
import { streamInterviewerTurn } from "./turn-agent";

/**
 * 一个面试官回合的纯核心：跑模型 → reducer。不知道状态从哪来、写到哪去：
 * 本地版从数据库装配并落库（session.ts），体验版从浏览器带上来、结果原样带回去。
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

export type TurnRun = {
  stream: Awaited<ReturnType<typeof streamInterviewerTurn>>["stream"];
  /** 流结束后调用：应用 reducer，返回新状态、新消息、副作用与决策记录。 */
  finalize: () => Promise<TurnOutcome>;
};

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
  const { stream, settled } = await streamInterviewerTurn({
    runId: input.runId,
    state: input.state,
    candidate: input.candidate ? { content: input.candidate.content, intent: input.candidate.intent } : null,
    context: input.context,
    skillPacks: input.skillPacks,
  });
  return {
    stream,
    finalize: async () => {
      const { decision, skillsLoaded } = await settled;
      const result = applyTurn(input.state, candidateInput, decision);
      return {
        result,
        decision: {
          turnIndex: input.state.turnIndex,
          runId: input.runId,
          proposedAction: result.decision.proposed,
          appliedAction: result.decision.applied,
          followUp: result.decision.followUp,
          replacedReason: result.decision.replacedReason,
          anchorHit: result.decision.anchorHit,
          memoryPatch: decision.memoryPatch,
          evidenceBefore: evidenceSummary(input.state).total,
          evidenceAfter: evidenceSummary(result.state).total,
          skillsLoaded,
          effects: result.effects.map((effect) => effect.type),
        },
      };
    },
  };
}
