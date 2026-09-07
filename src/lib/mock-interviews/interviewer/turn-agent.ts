import "server-only";

import { isStepCount, tool, type ModelMessage, type ToolSet } from "ai";

import { streamAgent, type AgentStreamOutcome } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { ACTION_DESCRIPTIONS, actionSchemas, type InterviewerAction } from "./actions";
import { canAct, type ActionName } from "./budget";
import { memoryPatchSchema } from "./memory";
import { buildConversation, buildInterviewerSystemPrompt, INTERVIEWER_PROMPT_VERSION } from "./prompt";
import type { TurnDecision } from "./reducer";
import type { InterviewerState } from "./state";

const TURN_TIMEOUT_MS = 45_000;
/** note + 被拒后换一个动作 + 收口，最多三步。 */
const MAX_STEPS = 3;
const PROGRESS_ACTIONS: ActionName[] = [
  "ask_intro",
  "open_thread",
  "probe",
  "rescue",
  "close_thread",
  "close_interview",
];

function isProgressAction(name: string): name is ActionName {
  return (PROGRESS_ACTIONS as string[]).includes(name);
}

/**
 * 工具的 execute 只回答"预算允不允许"，不改状态：模型看到拒绝理由可以换一个动作，
 * 真正的状态变更由 reducer 在流结束后统一应用（保证原子，也保证不越权）。
 */
function buildTools(initial: InterviewerState): ToolSet {
  const tools: ToolSet = {};
  // close_thread 之后允许在同一回合紧接着 open_thread / close_interview（"这块到这里，接下来聊 X"），
  // 所以接受 close_thread 后，后续检查按"当前线程已关闭"的状态来算。
  let state = initial;
  for (const name of PROGRESS_ACTIONS) {
    tools[name] = tool({
      description: ACTION_DESCRIPTIONS[name],
      inputSchema: actionSchemas[name],
      execute: async (input: unknown) => {
        const areaId =
          input && typeof input === "object" && "areaId" in input
            ? String((input as { areaId: unknown }).areaId)
            : undefined;
        const check = canAct(state, name, { areaId });
        if (!check.ok) return { accepted: false, reason: check.reason };
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
  return tools;
}

function wasAccepted(output: unknown): boolean {
  return Boolean((output as { accepted?: boolean } | undefined)?.accepted);
}

/**
 * 从流的结果里提取决定：第一个被预算接受的推进动作（模型偶尔会在一回合里连做两步，
 * 后面的作废；唯一例外是 close_thread 之后紧接的 open_thread / close_interview，作为
 * followUp 一起应用）、最后一次记忆更新、最后一步的话。全被拒绝时交最后一个给 reducer 兜底。
 */
export function decisionFromOutcome(outcome: AgentStreamOutcome): TurnDecision {
  let memoryPatch: TurnDecision["memoryPatch"] = null;
  const progress: InterviewerAction[] = [];
  const accepted: InterviewerAction[] = [];
  for (const call of outcome.toolCalls) {
    if (call.toolName === "note") {
      const parsed = memoryPatchSchema.safeParse(call.input);
      if (parsed.success) memoryPatch = parsed.data;
      continue;
    }
    if (!isProgressAction(call.toolName)) continue;
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
    failed: outcome.error !== null && outcome.text.trim().length === 0,
  };
}

/**
 * 一个面试官回合。返回流（给 HTTP 响应）与决定（流结束后解析）。
 * 候选人这条消息由调用方追加到 messages 末尾；开场回合没有候选人消息。
 */
export async function streamInterviewerTurn(input: {
  runId: string;
  state: InterviewerState;
  candidateContent: string | null;
  context: { jobTitle: string; jobDescription: string; resumeText: string };
}) {
  const config = await getAiTaskConfig("text");
  const conversation: ModelMessage[] = buildConversation(input.state);
  if (input.candidateContent) {
    conversation.push({ role: "user", content: input.candidateContent });
  } else if (conversation.length === 0) {
    conversation.push({ role: "user", content: "（候选人已就座，请开场。）" });
  }

  const { stream, outcome } = streamAgent({
    agent: "interviewer_turn",
    runId: input.runId,
    config,
    feature: "AI 模拟面试",
    promptVersion: INTERVIEWER_PROMPT_VERSION,
    system: buildInterviewerSystemPrompt(input.state, input.context),
    untrustedInputs: "候选人的回答、简历和岗位描述",
    messages: conversation,
    tools: buildTools(input.state),
    stopWhen: isStepCount(MAX_STEPS),
    timeoutMs: TURN_TIMEOUT_MS,
    maxOutputTokens: 1_200,
  });

  return { stream, decision: outcome.then(decisionFromOutcome), outcome };
}
