import "server-only";

import { tool, type ToolSet } from "ai";

import { describeAgentError, isFatalAgentError, streamAgent, type AgentStreamOutcome } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { createSkillTools, renderSkillIndex } from "../skills/tools";
import type { SkillPack } from "../skills/types";
import { TURN_TOOL, TURN_TOOL_DESCRIPTION, turnSchema } from "./actions";
import { buildConversation } from "./conversation";
import { buildInterviewerSystem, INTERVIEWER_PROMPT_VERSION, renderTurnMessage } from "./prompt";
import { pickSpeech, type TurnDecision } from "./reducer";
import type { InterviewerState } from "./state";

/**
 * 面试官的一回合就是一次模型调用：先一次记账（turn 工具），再说话（文本，流式返回给候选人）。
 * 记账工具的 execute 只回"已记录"，不改状态；状态变更由 reducer 在流结束后统一应用。
 *
 * 成本：系统提示词整场不变、对话历史只追加，每回合新增的只有最后一条用户消息（候选人的话 + 现场状态），
 * provider 的提示词缓存能命中前缀；一回合最多 3 步（查技能包 / 记账 / 说话）。
 */

const TURN_TIMEOUT_MS = 60_000;
const MAX_STEPS = 3;

function buildTools(packs: SkillPack[]) {
  const tools: ToolSet = {
    [TURN_TOOL]: tool({ description: TURN_TOOL_DESCRIPTION, inputSchema: turnSchema, execute: async () => ({ recorded: true }) }),
  };
  const skills = createSkillTools(packs);
  Object.assign(tools, skills.tools);
  return { tools, skills };
}

/** 从一次调用的结果里读出这回合做的事：多次 turn 调用按先后合并（后面非空的字段覆盖前面的），话取最后一步说的。 */
export function decisionFromOutcome(outcome: AgentStreamOutcome): TurnDecision {
  const decision: TurnDecision = { speech: "", plan: null, leave: null, enter: null, ended: false, memoryPatch: null, failed: false };
  for (const call of outcome.toolCalls) {
    if (call.toolName !== TURN_TOOL) continue;
    const parsed = turnSchema.safeParse(call.input);
    if (!parsed.success) continue;
    const input = parsed.data;
    if (input.plan) decision.plan = input.plan;
    if (input.leave) decision.leave = input.leave;
    if (input.enter) decision.enter = input.enter;
    if (input.note) decision.memoryPatch = input.note;
    if (input.end) decision.ended = true;
  }
  decision.speech = pickSpeech(outcome.stepTexts, outcome.text);
  decision.failed = outcome.error !== null && decision.speech.length === 0;
  return decision;
}

export type TurnAgentInput = {
  runId: string;
  state: InterviewerState;
  candidate: { content: string } | null;
  context: { jobTitle: string; jobDescription: string; resumeText: string };
  /** 本场可查的技能包（备课时加载过的及其父包）。 */
  skillPacks: SkillPack[];
};

export async function runTurnAgent(input: TurnAgentInput) {
  const config = await getAiTaskConfig("text");
  const { tools, skills } = buildTools(input.skillPacks);
  const messages = buildConversation(input.state);
  messages.push({ role: "user", content: renderTurnMessage(input.state, input.candidate?.content ?? null) });

  const { stream, outcome } = streamAgent({
    agent: "interviewer",
    runId: input.runId,
    config,
    feature: "AI 模拟面试",
    promptVersion: INTERVIEWER_PROMPT_VERSION,
    system: buildInterviewerSystem(input.state.brief, { ...input.context, skillIndex: input.skillPacks.length > 0 ? renderSkillIndex(input.skillPacks) : "" }),
    untrustedInputs: "候选人的回答、简历和岗位描述",
    messages,
    tools,
    toolChoice: "auto",
    stopWhen: ({ steps }) => steps.length >= MAX_STEPS,
    timeoutMs: TURN_TIMEOUT_MS,
    maxOutputTokens: 1_500,
  });
  const settled = outcome.then((result) => {
    // 额度用完 / 密钥无效 / 连不上：重试也不会好，直接报给房间。
    if (result.error && isFatalAgentError(result.error.kind)) throw result.error;
    return { decision: decisionFromOutcome(result), skillsLoaded: skills.loaded.length };
  });
  // 流里的错误块要带可读原因（AI SDK 默认只给 "An error occurred."）。
  return { stream: { toUIMessageStream: () => stream.toUIMessageStream({ onError: describeAgentError }) }, settled };
}
