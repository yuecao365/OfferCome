import { policyVariant } from "@/lib/interview/variants";
import { describeAgentError, isAgentRunError } from "@/lib/ai/run-agent";
import { CANDIDATE_CONTROLS, CONTROL_PLACEHOLDERS, type CandidateControl } from "@/lib/interview/events";
import { turnResponse } from "@/lib/interview/stream";
import { runTurn, type TurnState } from "@/lib/interview/turn";
import type { ConversationMessage } from "@/lib/interview/views";
import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { loadSkillPacks } from "@/lib/mock-interviews/skills/loader";
import { packsForInterview } from "@/lib/mock-interviews/skills/selector";
import { getAiTaskConfig } from "@/lib/settings/ai";
import { withTrialAiResponse } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTENT_LENGTH = 20_000;

type Body = {
  state: { brief: InterviewBrief; notebook: string; totalMinutes: number; messages: ConversationMessage[] };
  context: { jobTitle: string; jobDescription: string; resumeText: string };
  /** null = 开场回合。 */
  candidate: { content: string; intent: string | null; composeMs: number | null } | null;
};

/**
 * 体验版的面试官回合：状态随请求带上来，跑与本地版同一个核心，流式返回面试官的话，
 * 流结束时以 data-turn 把回合结果交回浏览器写进会话文档。服务端不留任何东西。
 */
export const POST = withTrialAiResponse<Body>(async (body) => {
  if (!body.state?.brief) return Response.json({ error: "这场面试还没有准备好。" }, { status: 400 });
  const content = typeof body.candidate?.content === "string" ? body.candidate.content.trim() : "";
  const control = body.candidate && (CANDIDATE_CONTROLS as readonly string[]).includes(body.candidate.intent as string) ? (body.candidate.intent as CandidateControl) : null;
  if (body.candidate && !content && !control) return Response.json({ error: "消息不能为空。" }, { status: 400 });
  if (content.length > MAX_CONTENT_LENGTH) return Response.json({ error: "消息不能超过 2 万字符。" }, { status: 400 });

  const messages = Array.isArray(body.state.messages) ? body.state.messages : [];
  const state: TurnState = {
    brief: body.state.brief,
    notebook: typeof body.state.notebook === "string" ? body.state.notebook : "",
    transcript: messages.map((message, seq) => ({ seq, role: message.role, content: message.content, kind: message.role === "interviewer" ? message.kind : null, control: null })),
    totalMinutes: body.state.totalMinutes,
    phase: messages.length === 0 ? "opening" : "running",
    covered: [],
    estimates: [],
    critic: null,
    variant: policyVariant(null),
    realTime: false,
  };
  try {
    const run = runTurn({
      runId: `trial-turn:${messages.length}:${Date.now()}`,
      config: await getAiTaskConfig("text"),
      state,
      candidate: body.candidate ? { clientId: null, content: content || (control ? CONTROL_PLACEHOLDERS[control] : ""), control, composeMs: body.candidate.composeMs ?? null } : null,
      context: { ...body.context, totalMinutes: body.state.totalMinutes, skillPacks: packsForInterview(body.state.brief.skillPacks, await loadSkillPacks()) },
    });
    const turnIndex = messages.filter((message) => message.role === "interviewer").length;
    return turnResponse({
      replay: false,
      say: run.say,
      finalize: async () => {
        const result = await run.finalize();
        return {
          newMessages: result.said.map((line) => ({ id: crypto.randomUUID(), turnIndex, role: line.role, kind: line.kind, content: line.content })),
          phase: result.phase,
          clock: result.clock,
          endedBy: result.endedBy,
          coveredCount: 0,
          notebook: result.notebook,
        };
      },
    });
  } catch (error) {
    return Response.json({ error: isAgentRunError(error) ? describeAgentError(error) : "无法开始回合。" }, { status: 503 });
  }
});
