import { describeAgentError, isAgentRunError } from "@/lib/ai/run-agent";
import { CANDIDATE_CONTROLS, CONTROL_PLACEHOLDERS, type CandidateControl } from "@/lib/interview/events";
import { startTurn } from "@/lib/interview/orchestrator";
import { turnResponse } from "@/lib/interview/stream";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTENT_LENGTH = 20_000;

type Body = {
  clientId?: unknown;
  content?: unknown;
  intent?: unknown;
  voiceMetricsJson?: unknown;
  composeMs?: unknown;
  /** start：开场回合，没有候选人消息。 */
  kind?: unknown;
};

function parseBody(body: Body) {
  if (body.kind === "start") return { candidate: null };
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const control = (CANDIDATE_CONTROLS as readonly string[]).includes(body.intent as string) ? (body.intent as CandidateControl) : null;
  if (!clientId) throw new Error("缺少消息标识。");
  if (!content && !control) throw new Error("消息不能为空。");
  if (content.length > MAX_CONTENT_LENGTH) throw new Error("消息不能超过 2 万字符。");
  return {
    candidate: {
      clientId,
      content: content || (control ? CONTROL_PLACEHOLDERS[control] : ""),
      control,
      composeMs: typeof body.composeMs === "number" ? body.composeMs : null,
      voiceMetricsJson: typeof body.voiceMetricsJson === "string" ? body.voiceMetricsJson : null,
    },
  };
}

/** 一个面试官回合：流式返回面试官的话；流结束前落库，并以 data-turn 把回合结果交给前端。 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let parsed: ReturnType<typeof parseBody>;
  try {
    parsed = parseBody((await request.json()) as Body);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "请求无效。" }, { status: 400 });
  }
  try {
    return turnResponse(await startTurn({ sessionId: id, candidate: parsed.candidate }));
  } catch (error) {
    const message = isAgentRunError(error) ? describeAgentError(error) : error instanceof Error ? error.message : "无法开始回合。";
    return Response.json({ error: message }, { status: isAgentRunError(error) ? 503 : 409 });
  }
}
