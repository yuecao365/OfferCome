import "server-only";

import { tool, type ModelMessage, type ToolSet } from "ai";

import { streamAgent, type AgentStreamOutcome } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";
import { normalizedText } from "@/lib/text/similarity";

import { createSkillTools, renderSkillIndex } from "../skills/tools";
import type { SkillPack } from "../skills/types";
import { ACTION_DESCRIPTIONS, actionSchemas, isModelAction, MODEL_ACTIONS, type InterviewerAction } from "./actions";
import { canAct } from "./budget";
import { buildConversation } from "./conversation";
import { memoryPatchSchema } from "./memory";
import { buildDecidePrompt, buildSpeakPrompt, INTERVIEWER_PROMPT_VERSION } from "./prompt";
import type { TurnDecision, TurnRuling } from "./reducer";
import type { InterviewerState } from "./state";

/**
 * 一回合两步：先决定（只用工具，文本丢弃），代码裁决，再说话（不给工具，流式返回）。
 * 模型因此永远在为最终动作说话，不需要拼接，候选人看到的话一次出完。
 */

const TURN_TIMEOUT_MS = 45_000;
/** 决定这一步：查技能包 ≤2 次 + note + 推进动作（被拒后可换一次）。 */
const MAX_DECIDE_STEPS = 4;
/** 追问锚点最多被拒这么多次；再不过就照常应用并记为 anchor_missing。 */
const ANCHOR_RETRIES = 2;

type DecideTools = {
  tools: ToolSet;
  /** 已有一个被接受的推进动作（close_thread 之后还要等接续动作）：决定这一步可以停了。 */
  decided: () => boolean;
  /** 流结束后读取：追问锚点是否命中（没追问为 null）、本回合加载的技能包数。 */
  outcome: () => { anchorHit: boolean | null; skillsLoaded: number };
};

/**
 * 工具的 execute 只回答"预算允不允许"，不改状态：模型看到拒绝理由可以换一个动作，
 * 真正的状态变更由 reducer 在流结束后统一应用（保证原子，也保证不越权）。
 *
 * 追问的锚点在这里校验：必须是候选人这条回答里的原话，让追问贴着回答走。
 */
function buildDecideTools(initial: InterviewerState, candidateContent: string | null, packs: SkillPack[]): DecideTools {
  const tools: ToolSet = {};
  // close_thread 之后允许在同一回合紧接着 open_thread / close_interview（"这块到这里，接下来聊 X"），
  // 所以接受 close_thread 后，后续检查按"当前线程已关闭"的状态来算。
  let state = initial;
  const answer = normalizedText(candidateContent ?? "");
  let anchorMisses = 0;
  let anchorHit: boolean | null = null;
  let accepted: InterviewerAction["name"] | null = null;
  let closedThenDecided = false;

  for (const name of MODEL_ACTIONS) {
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
        if (accepted === "close_thread") closedThenDecided = true;
        accepted ??= name;
        if (name === "close_thread") {
          state = {
            ...state,
            threads: state.threads.map((thread) =>
              thread.status === "active" ? { ...thread, status: "closed" as const } : thread,
            ),
          };
          return { accepted: true, next: "这一段已结束。紧接着调用 open_thread 或 close_interview。" };
        }
        return { accepted: true, next: "本回合的推进动作已定，不要再调用其他推进动作。" };
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

  return {
    tools,
    decided: () => accepted !== null && (accepted !== "close_thread" || closedThenDecided),
    outcome: () => ({ anchorHit, skillsLoaded: skills.loaded.length }),
  };
}

function wasAccepted(output: unknown): boolean {
  return Boolean((output as { accepted?: boolean } | undefined)?.accepted);
}

/**
 * 从决定这一步的结果里提取决定：第一个被预算接受的推进动作（模型偶尔会在一回合里连做两步，
 * 后面的作废；唯一例外是 close_thread 之后紧接的 open_thread / close_interview，作为
 * followUp 一起应用）、最后一次记忆更新。全被拒绝时交最后一个给 reducer 兜底。
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
    if (!isModelAction(call.toolName)) continue;
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
  return {
    speech: "",
    action,
    followUp,
    memoryPatch,
    anchorHit: action?.name === "probe" ? anchorHit : null,
    failed: outcome.error !== null && action === null,
  };
}

export type TurnAgentInput = {
  runId: string;
  state: InterviewerState;
  candidate: { content: string } | null;
  context: { jobTitle: string; jobDescription: string; resumeText: string };
  /** 本场可查的技能包（备课时加载过的及其父包）。 */
  skillPacks: SkillPack[];
};

function conversationFor(input: TurnAgentInput): ModelMessage[] {
  const conversation = buildConversation(input.state);
  if (input.candidate?.content) {
    conversation.push({ role: "user", content: input.candidate.content });
  } else if (conversation.length === 0) {
    conversation.push({ role: "user", content: "（候选人已就座，请开场。）" });
  }
  return conversation;
}

/** 第 1 步：决定。不流式，文本丢弃；返回提案与记忆更新。 */
export async function decideTurn(input: TurnAgentInput): Promise<{ decision: TurnDecision; skillsLoaded: number }> {
  const config = await getAiTaskConfig("text");
  const decideTools = buildDecideTools(input.state, input.candidate?.content ?? null, input.skillPacks);
  const { stream, outcome } = streamAgent({
    agent: "interviewer_decide",
    runId: input.runId,
    config,
    feature: "AI 模拟面试",
    promptVersion: INTERVIEWER_PROMPT_VERSION,
    system: buildDecidePrompt(input.state, {
      ...input.context,
      skillIndex: input.skillPacks.length > 0 ? renderSkillIndex(input.skillPacks) : "",
    }),
    untrustedInputs: "候选人的回答、简历和岗位描述",
    messages: conversationFor(input),
    tools: decideTools.tools,
    toolChoice: "required",
    stopWhen: ({ steps }) => steps.length >= MAX_DECIDE_STEPS || decideTools.decided(),
    timeoutMs: TURN_TIMEOUT_MS,
    maxOutputTokens: 800,
  });
  await stream.consumeStream();
  const result = await outcome;
  const extras = decideTools.outcome();
  return { decision: decisionFromOutcome(result, extras.anchorHit), skillsLoaded: extras.skillsLoaded };
}

/** 第 2 步：说话。不给工具，流式返回面试官的话。 */
export async function speakTurn(input: TurnAgentInput & { ruling: TurnRuling }) {
  const config = await getAiTaskConfig("text");
  const { stream, outcome } = streamAgent({
    agent: "interviewer_speak",
    runId: input.runId,
    config,
    feature: "AI 模拟面试",
    promptVersion: INTERVIEWER_PROMPT_VERSION,
    system: buildSpeakPrompt(input.state, { ...input.context, skillIndex: "" }, input.ruling),
    untrustedInputs: "候选人的回答、简历和岗位描述",
    messages: conversationFor(input),
    tools: {},
    toolChoice: "none",
    timeoutMs: TURN_TIMEOUT_MS,
    maxOutputTokens: 600,
  });
  const settled = outcome.then((result) => ({ speech: result.text.trim(), failed: result.error !== null && result.text.trim().length === 0 }));
  return { stream, settled };
}
