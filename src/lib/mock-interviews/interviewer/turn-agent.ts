import "server-only";

import { tool, type ToolSet } from "ai";
import type { z } from "zod";

import { describeAgentError, isFatalAgentError, streamAgent, type AgentStreamOutcome } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { createSkillTools, renderSkillIndex } from "../skills/tools";
import type { SkillPack } from "../skills/types";
import { isToolName, TOOL_DESCRIPTIONS, TOOL_NAMES, toolSchemas } from "./actions";
import { buildConversation } from "./conversation";
import { buildInterviewerPrompt, INTERVIEWER_PROMPT_VERSION } from "./prompt";
import { pickSpeech, type TurnDecision, type TurnMove } from "./reducer";
import type { InterviewerState } from "./state";

/**
 * 面试官的一回合就是一次模型调用：先记账（工具），再说话（文本，流式返回给候选人）。
 * 记账工具的 execute 只回"已记录"，不改状态；状态变更由 reducer 在流结束后统一应用。
 */

const TURN_TIMEOUT_MS = 60_000;
/** 一回合最多几步：查技能包 + 记账 + 说话。 */
const MAX_STEPS = 5;

function buildTools(packs: SkillPack[]) {
  const tools: ToolSet = {};
  for (const name of TOOL_NAMES) {
    tools[name] = tool({
      description: TOOL_DESCRIPTIONS[name],
      inputSchema: toolSchemas[name] as z.ZodTypeAny,
      execute: async () => ({ recorded: true }),
    });
  }
  const skills = createSkillTools(packs);
  Object.assign(tools, skills.tools);
  return { tools, skills };
}

/** 从一次调用的结果里读出这回合做的事：记账按调用顺序，话取最后一步说的（多步时后一步常会复述前一步）。 */
export function decisionFromOutcome(outcome: AgentStreamOutcome): TurnDecision {
  const decision: TurnDecision = { speech: "", plan: null, moves: [], ended: false, memoryPatch: null, failed: false };
  for (const call of outcome.toolCalls) {
    if (!isToolName(call.toolName)) continue;
    const parsed = toolSchemas[call.toolName].safeParse(call.input);
    if (!parsed.success) continue;
    switch (call.toolName) {
      case "plan":
        decision.plan = parsed.data as TurnDecision["plan"];
        break;
      case "enter":
      case "leave":
        decision.moves.push({ type: call.toolName, input: parsed.data } as TurnMove);
        break;
      case "note":
        decision.memoryPatch = parsed.data as TurnDecision["memoryPatch"];
        break;
      case "end":
        decision.ended = true;
        break;
    }
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
  const conversation = buildConversation(input.state);
  if (input.candidate?.content) conversation.push({ role: "user", content: input.candidate.content });
  else if (conversation.length === 0) conversation.push({ role: "user", content: "（候选人已就座，请开场。）" });

  const { stream, outcome } = streamAgent({
    agent: "interviewer",
    runId: input.runId,
    config,
    feature: "AI 模拟面试",
    promptVersion: INTERVIEWER_PROMPT_VERSION,
    system: buildInterviewerPrompt(input.state, { ...input.context, skillIndex: input.skillPacks.length > 0 ? renderSkillIndex(input.skillPacks) : "" }),
    untrustedInputs: "候选人的回答、简历和岗位描述",
    messages: conversation,
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
