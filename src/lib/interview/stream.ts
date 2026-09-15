import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageStreamWriter } from "ai";

import { describeAgentError, isAgentRunError } from "@/lib/ai/run-agent";

import type { TurnPayload } from "./views";

/**
 * 回合的 HTTP 响应：AI SDK 的 UI 消息流。面试官的话逐段流回（text 块），
 * 流结束前把回合结果以 data-turn 数据块交给前端（本地版已落库；体验版写进会话文档）。
 */

export type TurnData = { replay: true; messages: TurnPayload["newMessages"] } | { replay: false; payload: TurnPayload };

async function writeSay(writer: UIMessageStreamWriter, say: AsyncIterable<string>): Promise<void> {
  const id = crypto.randomUUID();
  writer.write({ type: "text-start", id });
  for await (const delta of say) writer.write({ type: "text-delta", id, delta });
  writer.write({ type: "text-end", id });
}

export function turnResponse(run: { replay: true; messages: TurnPayload["newMessages"] } | { replay: false; say: AsyncIterable<string>; finalize: () => Promise<TurnPayload> }): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      if (run.replay) {
        const data: TurnData = { replay: true, messages: run.messages };
        writer.write({ type: "data-turn", data });
        return;
      }
      await writeSay(writer, run.say);
      const data: TurnData = { replay: false, payload: await run.finalize() };
      writer.write({ type: "data-turn", data });
    },
    onError: (error) => (isAgentRunError(error) ? describeAgentError(error) : error instanceof Error ? error.message : "回合失败。"),
  });
  return createUIMessageStreamResponse({ stream });
}
