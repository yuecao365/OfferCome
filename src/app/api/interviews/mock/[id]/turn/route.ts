import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import {
  CANDIDATE_INTENT_PLACEHOLDERS,
  detectCandidateIntent,
  type CandidateIntent,
} from "@/lib/mock-interviews/interviewer/actions";
import { startInterviewerTurn } from "@/lib/mock-interviews/interviewer/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const INTENTS = Object.keys(CANDIDATE_INTENT_PLACEHOLDERS) as NonNullable<CandidateIntent>[];
const MAX_CONTENT_LENGTH = 20_000;

type Body = {
  clientId?: unknown;
  content?: unknown;
  intent?: unknown;
  voiceMetricsJson?: unknown;
  /** start：开场回合，没有候选人消息。 */
  kind?: unknown;
};

function parseBody(body: Body) {
  if (body.kind === "start") return { candidate: null };
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const explicit = INTENTS.find((intent) => intent === body.intent) ?? null;
  if (!clientId) throw new Error("缺少消息标识。");
  if (!content && !explicit) throw new Error("消息不能为空。");
  if (content.length > MAX_CONTENT_LENGTH) throw new Error("消息不能超过 2 万字符。");
  return {
    candidate: {
      clientId,
      content: content || (explicit ? CANDIDATE_INTENT_PLACEHOLDERS[explicit] : ""),
      intent: explicit ?? detectCandidateIntent(content),
      voiceMetricsJson: typeof body.voiceMetricsJson === "string" ? body.voiceMetricsJson : null,
    },
  };
}

/**
 * 一个面试官回合：流式返回面试官的话；流结束前把 reducer 的结果落库，
 * 并以 data-turn 数据块把最终落库的消息交给前端替换流中的临时内容。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let parsed: ReturnType<typeof parseBody>;
  try {
    parsed = parseBody((await request.json()) as Body);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "请求无效。" }, { status: 400 });
  }

  let turn: Awaited<ReturnType<typeof startInterviewerTurn>>;
  try {
    turn = await startInterviewerTurn({ sessionId: id, candidate: parsed.candidate });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法开始回合。" }, { status: 409 });
  }

  const started = turn;
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // 重复提交：不调模型，直接把当时落库的面试官消息作为数据块回放。
      if (started.replay) {
        writer.write({
          type: "data-turn",
          data: { messages: started.messages, phase: null, threads: null, effects: [], replay: true },
        });
        return;
      }
      writer.merge(started.stream.toUIMessageStream());
      const result = await started.finalize();
      writer.write({
        type: "data-turn",
        data: {
          messages: result.newMessages.filter((message) => message.role === "interviewer"),
          phase: result.state.phase,
          threads: result.state.threads,
          effects: result.effects.map((effect) => effect.type),
          replay: false,
        },
      });
    },
    onError: (error) => (error instanceof Error ? error.message : "回合失败。"),
  });
  return createUIMessageStreamResponse({ stream });
}
