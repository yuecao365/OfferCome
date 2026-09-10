import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import {
  CANDIDATE_INTENT_PLACEHOLDERS,
  detectCandidateIntent,
  type CandidateIntent,
} from "@/lib/mock-interviews/interviewer/actions";
import type { InterviewBrief } from "@/lib/mock-interviews/interviewer/brief";
import type { InterviewMemory } from "@/lib/mock-interviews/interviewer/memory";
import { createInterviewerState, type MessageState, type ThreadState } from "@/lib/mock-interviews/interviewer/state";
import { runInterviewerTurn } from "@/lib/mock-interviews/interviewer/turn";
import { turnPayload, type TurnData } from "@/lib/mock-interviews/interviewer/turn-payload";
import { loadSkillPacks } from "@/lib/mock-interviews/skills/loader";
import { packsForInterview } from "@/lib/mock-interviews/skills/selector";
import { withTrialAiResponse } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

const INTENTS = Object.keys(CANDIDATE_INTENT_PLACEHOLDERS) as NonNullable<CandidateIntent>[];
const MAX_CONTENT_LENGTH = 20_000;

type Body = {
  state: { brief: InterviewBrief; memory: InterviewMemory; threads: ThreadState[]; messages: MessageState[] };
  context: { jobTitle: string; jobDescription: string; resumeText: string };
  /** null = 开场回合。 */
  candidate: { content: string; intent: string | null; composeMs: number | null } | null;
};

/**
 * 体验版的面试官回合：状态随请求带上来，跑与本地版同一个核心，流式返回面试官的话，
 * 流结束时以 data-turn 把完整回合结果交回浏览器写进会话文档。服务端不留任何东西。
 */
export const POST = withTrialAiResponse<Body>(async (body) => {
  if (!body.state?.brief) return Response.json({ error: "这场面试还没有准备好。" }, { status: 400 });
  const content = typeof body.candidate?.content === "string" ? body.candidate.content.trim() : "";
  const explicit = body.candidate ? (INTENTS.find((intent) => intent === body.candidate!.intent) ?? null) : null;
  if (body.candidate && !content && !explicit) return Response.json({ error: "消息不能为空。" }, { status: 400 });
  if (content.length > MAX_CONTENT_LENGTH) return Response.json({ error: "消息不能超过 2 万字符。" }, { status: 400 });

  const state = createInterviewerState({ ...body.state, ended: false });
  const candidateContent = content || (explicit ? CANDIDATE_INTENT_PLACEHOLDERS[explicit] : "");
  const run = await runInterviewerTurn({
    runId: `trial-turn:${state.turnIndex}:${Date.now()}`,
    state,
    candidate: body.candidate
      ? {
          content: candidateContent,
          intent: explicit ?? detectCandidateIntent(content),
          metrics: { composeMs: body.candidate.composeMs ?? null, chars: candidateContent.length },
        }
      : null,
    context: body.context,
    skillPacks: packsForInterview(body.state.brief.skillPacks, await loadSkillPacks()),
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(run.stream.toUIMessageStream());
      const { result, decision } = await run.finalize();
      const data: TurnData = { replay: false, payload: turnPayload(result, decision) };
      writer.write({ type: "data-turn", data });
    },
    onError: (error) => (error instanceof Error ? error.message : "回合失败。"),
  });
  return createUIMessageStreamResponse({ stream });
});
