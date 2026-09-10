import type { InterviewMemory } from "./memory";
import type { TurnEffect, TurnResult } from "./reducer";
import type { InterviewPhase, MessageState, ThreadState } from "./state";
import type { TurnDecisionRow } from "./turn";

/**
 * 一个回合流结束时交给前端的结果。本地版与体验版的回合接口都以 `data-turn` 数据块发它：
 * 本地版前端只用它替换流中的临时消息；体验版前端把它整个应用到浏览器里的会话文档。
 */
export type TurnPayload = {
  newMessages: MessageState[];
  threads: ThreadState[];
  memory: InterviewMemory;
  phase: InterviewPhase;
  effects: TurnEffect[];
  decision: TurnDecisionRow;
};

export function turnPayload(result: TurnResult, decision: TurnDecisionRow): TurnPayload {
  return {
    newMessages: result.newMessages,
    threads: result.state.threads,
    memory: result.state.memory,
    phase: result.state.phase,
    effects: result.effects,
    decision,
  };
}

/** 回放（重复提交）时只回当时的面试官消息。 */
export type TurnData = { replay: true; messages: MessageState[] } | { replay: false; payload: TurnPayload };
