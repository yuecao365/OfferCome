import "server-only";

import { isStepCount, tool, type ModelMessage, type ToolSet } from "ai";

import { streamAgent, type AgentStreamOutcome } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";
import { normalizedText } from "@/lib/text/similarity";

import { createSkillTools, renderSkillIndex } from "../skills/tools";
import type { SkillPack } from "../skills/types";
import { ACTION_DESCRIPTIONS, ACTION_NAMES, actionSchemas, isActionName, type CandidateIntent, type InterviewerAction } from "./actions";
import { canAct } from "./budget";
import { memoryPatchSchema } from "./memory";
import { buildConversation } from "./conversation";
import { buildInterviewerSystemPrompt, INTERVIEWER_PROMPT_VERSION } from "./prompt";
import type { TurnDecision } from "./reducer";
import type { InterviewerState } from "./state";

const TURN_TIMEOUT_MS = 45_000;
/** 查技能包 ≤2 次 + note + 推进动作（被拒后可换一次）+ 收口说话。 */
const MAX_STEPS = 5;
/** 追问锚点最多被拒这么多次；再不过就照常应用并记为 anchor_missing。 */
const ANCHOR_RETRIES = 2;

type TurnTools = {
  tools: ToolSet;
  /** 流结束后读取：追问锚点是否命中（没追问为 null）、本回合加载的技能包数。 */
  outcome: () => { anchorHit: boolean | null; skillsLoaded: number };
};

/**
 * 工具的 execute 只回答"预算允不允许"，不改状态：模型看到拒绝理由可以换一个动作，
 * 真正的状态变更由 reducer 在流结束后统一应用（保证原子，也保证不越权）。
 *
 * 追问的锚点在这里校验：必须是候选人这条回答里的原话，让追问贴着回答走。
 */
function buildTools(initial: InterviewerState, candidateContent: string | null, packs: SkillPack[]): TurnTools {
  const tools: ToolSet = {};
  // close_thread 之后允许在同一回合紧接着 open_thread / close_interview（"这块到这里，接下来聊 X"），
  // 所以接受 close_thread 后，后续检查按"当前线程已关闭"的状态来算。
  let state = initial;
  const answer = normalizedText(candidateContent ?? "");
  let anchorMisses = 0;
  let anchorHit: boolean | null = null;

  for (const name of ACTION_NAMES) {
    tools[name] = tool({
      description: ACTION_DESCRIPTIONS[name],
      inputSchema: actionSchemas[name],
      execute: async (input: unknown) => {
        const fields = (input ?? {}) as { areaId?: unknown; anchor?: unknown };
        const check = canAct(state, name, { areaId: typeof fields.areaId === "string" ? fields.areaId : undefined });
        if (!check.ok) return { accepted: false, reason: check.reason };
        if (name === "probe") {
          const anchor = normalizedText(typeof fields.anchor === "string" ? fields.anchor : "");
          const hit = anchor.length > 0 && answer.includes(anchor);
          if (!hit && anchorMisses < ANCHOR_RETRIES) {
            anchorMisses += 1;
            return { accepted: false, reason: "anchor 不是候选人这条回答里的原话，请逐字引用回答里的一段再追问" };
          }
          anchorHit = hit;
        }
        if (name === "close_thread") {
          state = {
            ...state,
            threads: state.threads.map((thread) =>
              thread.status === "active" ? { ...thread, status: "closed" as const } : thread,
            ),
          };
          return {
            accepted: true,
            next: "这一段已结束。如果你已经想好下一段，紧接着调用 open_thread 或 close_interview；然后把要对候选人说的话说出来。",
          };
        }
        return { accepted: true, next: "本回合的推进动作已用完，不要再调用其他推进动作；把要对候选人说的话说出来。" };
      },
    });
  }
  tools.note = tool({
    description: ACTION_DESCRIPTIONS.note,
    inputSchema: actionSchemas.note,
    execute: async () => ({ recorded: true }),
  });
  const skills = createSkillTools(packs);
  Object.assign(tools, skills.tools);

  return { tools, outcome: () => ({ anchorHit, skillsLoaded: skills.loaded.length }) };
}

function wasAccepted(output: unknown): boolean {
  return Boolean((output as { accepted?: boolean } | undefined)?.accepted);
}

/**
 * 从流的结果里提取决定：第一个被预算接受的推进动作（模型偶尔会在一回合里连做两步，
 * 后面的作废；唯一例外是 close_thread 之后紧接的 open_thread / close_interview，作为
 * followUp 一起应用）、最后一次记忆更新、最后一步的话。全被拒绝时交最后一个给 reducer 兜底。
 */
export function decisionFromOutcome(outcome: AgentStreamOutcome, anchorHit: boolean | null = null): TurnDecision {
  let memoryPatch: TurnDecision["memoryPatch"] = null;
  const progress: InterviewerAction[] = [];
  const accepted: InterviewerAction[] = [];
  for (const call of outcome.toolCalls) {
    if (call.toolName === "note") {
      const parsed = memoryPatchSchema.safeParse(call.input);
      if (parsed.success) memoryPatch = parsed.data;
      continue;
    }
    if (!isActionName(call.toolName)) continue;
    const parsed = actionSchemas[call.toolName].safeParse(call.input);
    if (!parsed.success) continue;
    const action = { name: call.toolName, input: parsed.data } as InterviewerAction;
    progress.push(action);
    if (wasAccepted(call.output)) accepted.push(action);
  }
  const action = accepted[0] ?? progress[progress.length - 1] ?? null;
  const second = accepted[1];
  const followUp =
    action?.name === "close_thread" && second && (second.name === "open_thread" || second.name === "close_interview")
      ? second
      : null;
  // 推理型模型常在工具调用之后再单独说一步，且会把前一步的话复述一遍：只取最后一步。
  const speech = [...outcome.stepTexts].reverse().find((text) => text.trim()) ?? outcome.text;
  return {
    speech: speech.trim(),
    action,
    followUp,
    memoryPatch,
    anchorHit: action?.name === "probe" ? anchorHit : null,
    failed: outcome.error !== null && outcome.text.trim().length === 0,
  };
}

export type TurnAgentInput = {
  runId: string;
  state: InterviewerState;
  candidate: { content: string; intent: CandidateIntent } | null;
  context: { jobTitle: string; jobDescription: string; resumeText: string };
  /** 本场可查的技能包（备课时加载过的及其父包）。 */
  skillPacks: SkillPack[];
};

/**
 * 一个面试官回合。返回流（给 HTTP 响应）与决定（流结束后解析）。
 * 候选人这条消息由调用方追加到 messages 末尾；开场回合没有候选人消息。
 */
export async function streamInterviewerTurn(input: TurnAgentInput) {
  const config = await getAiTaskConfig("text");
  const conversation: ModelMessage[] = buildConversation(input.state);
  if (input.candidate?.content) {
    conversation.push({ role: "user", content: input.candidate.content });
  } else if (conversation.length === 0) {
    conversation.push({ role: "user", content: "（候选人已就座，请开场。）" });
  }
  const turnTools = buildTools(input.state, input.candidate?.content ?? null, input.skillPacks);

  const { stream, outcome } = streamAgent({
    agent: "interviewer_turn",
    runId: input.runId,
    config,
    feature: "AI 模拟面试",
    promptVersion: INTERVIEWER_PROMPT_VERSION,
    system: buildInterviewerSystemPrompt(input.state, {
      ...input.context,
      skillIndex: input.skillPacks.length > 0 ? renderSkillIndex(input.skillPacks) : "",
      candidateIntent: input.candidate?.intent ?? null,
    }),
    untrustedInputs: "候选人的回答、简历和岗位描述",
    messages: conversation,
    tools: turnTools.tools,
    stopWhen: isStepCount(MAX_STEPS),
    timeoutMs: TURN_TIMEOUT_MS,
    maxOutputTokens: 1_200,
  });

  const settled = outcome.then((result) => {
    const extras = turnTools.outcome();
    return { decision: decisionFromOutcome(result, extras.anchorHit), skillsLoaded: extras.skillsLoaded };
  });
  return { stream, settled, outcome };
}
