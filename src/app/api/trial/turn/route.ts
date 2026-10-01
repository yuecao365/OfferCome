import { describeAgentError, isAgentRunError } from "@/lib/ai/run-agent";
import { CANDIDATE_CONTROLS, CONTROL_PLACEHOLDERS_BY_LANGUAGE, type CandidateControl } from "@/lib/interview/events";
import { turnResponse } from "@/lib/interview/stream";
import { runTurn, type TurnState } from "@/lib/interview/turn";
import { eventsOfMessages, type ConversationMessage } from "@/lib/interview/views";
import { loadSkillPacks } from "@/lib/mock-interviews/skills/loader";
import { packsForInterview } from "@/lib/mock-interviews/skills/selector";
import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { defineMessages } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { getAiTaskConfig } from "@/lib/settings/ai";
import { withTrialAiResponse } from "@/lib/trial/route-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTENT_LENGTH = 20_000;

const messages = defineMessages({
  "zh-CN": {
    notReady: "这场面试还没有准备好。",
    empty: "消息不能为空。",
    tooLong: "消息不能超过 2 万字符。",
    cannotStart: "无法开始回合。",
  },
  en: {
    notReady: "This interview isn't ready yet.",
    empty: "Message can't be empty.",
    tooLong: "Messages can't exceed 20,000 characters.",
    cannotStart: "Couldn't start the turn.",
  },
});

type Body = {
  state: { brief: InterviewBrief; messages: ConversationMessage[] };
  context: { jobTitle: string; jobDescription: string; resumeText: string; skillPacks?: string[] };
  /** 随机种子（会话 id）：抽追问角度用。 */
  seed?: string;
  /** null = 开场回合。 */
  candidate: { content: string; intent: string | null; composeMs: number | null } | null;
};

/**
 * 体验版的面试官回合：状态随请求带上来，跑与本地版同一个核心，流式返回面试官的话，
 * 流结束时以 data-turn 把回合结果交回浏览器写进会话文档。服务端不留任何东西。
 */
export const POST = withTrialAiResponse<Body>(async (body) => {
  const locale = await getLocale();
  const t = messages[locale];
  if (!body.state?.brief) return Response.json({ error: t.notReady }, { status: 400 });
  const content = typeof body.candidate?.content === "string" ? body.candidate.content.trim() : "";
  const control = body.candidate && (CANDIDATE_CONTROLS as readonly string[]).includes(body.candidate.intent as string) ? (body.candidate.intent as CandidateControl) : null;
  if (body.candidate && !content && !control) return Response.json({ error: t.empty }, { status: 400 });
  if (content.length > MAX_CONTENT_LENGTH) return Response.json({ error: t.tooLong }, { status: 400 });

  const history = Array.isArray(body.state.messages) ? body.state.messages : [];
  // 体验版没有事件日志：从消息合成状态需要的事件（工具账因此每回合为空，面试官可能重复查）。
  // 浏览器里的旧会话文档没有语言：按中文读。
  const brief: InterviewBrief = { ...body.state.brief, language: body.state.brief.language === "en" ? "en" : "zh" };
  const state: TurnState = { brief, events: eventsOfMessages(history), phase: history.length === 0 ? "opening" : "running" };
  const context = { ...body.context, product: brief.product ?? null, skillPacks: packsForInterview(Array.isArray(body.context?.skillPacks) ? body.context.skillPacks : [], await loadSkillPacks(brief.language), 3) };
  try {
    const turnIndex = history.filter((message) => message.role === "interviewer").length;
    const config = await getAiTaskConfig("text");
    return turnResponse({
      replay: false,
      finalize: async () => {
        const result = await runTurn({
          runId: `trial-turn:${history.length}:${Date.now()}`,
          config,
          state,
          candidate: body.candidate ? { clientId: null, content: content || (control ? CONTROL_PLACEHOLDERS_BY_LANGUAGE[brief.language][control] : ""), control, composeMs: body.candidate.composeMs ?? null } : null,
          context,
        });
        return {
          newMessages: result.said.map((line) => ({ id: crypto.randomUUID(), turnIndex, role: line.role, kind: line.kind, content: line.content, topic: line.topic ?? null, facet: line.facet ?? null, action: line.action ?? null, signal: line.signal ?? null, notes: line.notes ?? null })),
          phase: result.phase,
          progress: result.progress,
          endedBy: result.endedBy,
          coveredCount: result.progress.covered,
          notes: result.said.find((line) => line.role === "interviewer")?.notes ?? null,
        };
      },
    }, locale);
  } catch (error) {
    return Response.json({ error: isAgentRunError(error) ? describeAgentError(error, locale) : t.cannotStart }, { status: 503 });
  }
});
