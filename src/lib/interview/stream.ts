import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageStreamWriter } from "ai";

import { describeAgentError, isAgentRunError } from "@/lib/ai/run-agent";

import type { TurnPayload } from "./views";

/**
 * 回合的 HTTP 响应：仍是 AI SDK 的 UI 消息流（前端的 useChat 不用换），但不再流式——回合先跑完（说出口之前动作已校验、事件已落库），
 * 再把整句话作为一个 text 块、回合结果作为 data-turn 数据块交给前端；前端用打字机显示。
 */

export type TurnData = { replay: true; messages: TurnPayload["newMessages"] } | { replay: false; payload: TurnPayload };

function describeError(error: unknown): string {
  return isAgentRunError(error) ? describeAgentError(error) : error instanceof Error ? error.message : "回合失败。";
}

function writeText(writer: UIMessageStreamWriter, text: string): void {
  const id = crypto.randomUUID();
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

export function turnResponse(run: { replay: true; messages: TurnPayload["newMessages"] } | { replay: false; finalize: () => Promise<TurnPayload> }): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      if (run.replay) {
        const data: TurnData = { replay: true, messages: run.messages };
        writer.write({ type: "data-turn", data });
        return;
      }
      let payload: TurnPayload;
      try {
        payload = await run.finalize();
      } catch (error) {
        // 模型没说出话、动作两次都违约后仍失败、落库失败：把原因写进流，前端给"重试"。没有假装说话的固定句。
        console.error("[interview] 回合失败：", error instanceof Error ? error.stack ?? error.message : error);
        writer.write({ type: "error", errorText: describeError(error) });
        return;
      }
      writeText(writer, payload.newMessages.filter((message) => message.role === "interviewer").map((message) => message.content).join("\n"));
      const data: TurnData = { replay: false, payload };
      writer.write({ type: "data-turn", data });
    },
    onError: describeError,
  });
  return createUIMessageStreamResponse({ stream });
}
