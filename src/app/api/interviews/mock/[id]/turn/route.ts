import { describeAgentError, isAgentRunError } from "@/lib/ai/run-agent";
import { CANDIDATE_CONTROLS, type CandidateControl } from "@/lib/interview/events";
import { startTurn } from "@/lib/interview/orchestrator";
import { turnResponse } from "@/lib/interview/stream";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTENT_LENGTH = 20_000;

const messages = defineMessages({
  "zh-CN": {
    missingClientId: "缺少消息标识。",
    empty: "消息不能为空。",
    tooLong: "消息不能超过 2 万字符。",
    invalid: "请求无效。",
    cannotStart: "无法开始回合。",
  },
  en: {
    missingClientId: "Missing message ID.",
    empty: "Message can't be empty.",
    tooLong: "Messages can't exceed 20,000 characters.",
    invalid: "Invalid request.",
    cannotStart: "Couldn't start the turn.",
  },
});

type TurnMessages = (typeof messages)["zh-CN"];

type Body = {
  clientId?: unknown;
  content?: unknown;
  intent?: unknown;
  voiceMetricsJson?: unknown;
  composeMs?: unknown;
  /** start：开场回合，没有候选人消息。 */
  kind?: unknown;
};

function parseBody(body: Body, t: TurnMessages) {
  if (body.kind === "start") return { candidate: null };
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const control = (CANDIDATE_CONTROLS as readonly string[]).includes(body.intent as string) ? (body.intent as CandidateControl) : null;
  if (!clientId) throw new Error(t.missingClientId);
  if (!content && !control) throw new Error(t.empty);
  if (content.length > MAX_CONTENT_LENGTH) throw new Error(t.tooLong);
  return {
    candidate: {
      clientId,
      // 只点按钮时为空：编排器按场次语言补上替候选人说的那句。
      content,
      control,
      composeMs: typeof body.composeMs === "number" ? body.composeMs : null,
      voiceMetricsJson: typeof body.voiceMetricsJson === "string" ? body.voiceMetricsJson : null,
    },
  };
}

/** 一个面试官回合：流式返回面试官的话；流结束前落库，并以 data-turn 把回合结果交给前端。 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const t = messages[locale];
  const { id } = await params;
  let parsed: ReturnType<typeof parseBody>;
  try {
    parsed = parseBody((await request.json()) as Body, t);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : t.invalid }, { status: 400 });
  }
  try {
    return turnResponse(await startTurn({ sessionId: id, candidate: parsed.candidate, locale }), locale);
  } catch (error) {
    const message = isAgentRunError(error) ? describeAgentError(error, locale) : error instanceof Error ? error.message : t.cannotStart;
    return Response.json({ error: message }, { status: isAgentRunError(error) ? 503 : 409 });
  }
}
