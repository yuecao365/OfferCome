import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageStreamWriter } from "ai";

import { describeAgentError, isAgentRunError } from "@/lib/ai/run-agent";

import type { TurnPayload } from "./views";

/**
 * 回合的 HTTP 响应：AI SDK 的 UI 消息流。面试官的话逐段流回（text 块），
 * 流结束前把回合结果以 data-turn 数据块交给前端（本地版已落库；体验版写进会话文档）。
 */

export type TurnData = { replay: true; messages: TurnPayload["newMessages"] } | { replay: false; payload: TurnPayload };

function describeError(error: unknown): string {
  return isAgentRunError(error) ? describeAgentError(error) : error instanceof Error ? error.message : "回合失败。";
}

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
      let payload: TurnPayload;
      try {
        payload = await run.finalize();
      } catch (error) {
        // 落库或裁决失败（额度、密钥、写锁超时）：记日志，并把原因显式写进流——
        // 文本块已经发出去之后再抛，客户端只会看到流断了、没有错误块。
        console.error("[interview] 回合收尾失败：", error instanceof Error ? error.stack ?? error.message : error);
        writer.write({ type: "error", errorText: describeError(error) });
        return;
      }
      const data: TurnData = { replay: false, payload };
      writer.write({ type: "data-turn", data });
    },
    onError: describeError,
  });
  return createUIMessageStreamResponse({ stream });
}
