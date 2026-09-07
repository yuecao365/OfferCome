import type { ModelMessage } from "ai";

import { canAct, probeLimit, type ActionName } from "./budget";
import { renderMemory } from "./memory";
import { closedThreadSummary } from "./segments";
import { activeThread, areaById, type InterviewerState } from "./state";

/**
 * 面试官回合的提示词与对话裁剪。
 * 系统提示词每回合重建：人设、规则、简报里的领域与剩余时间、当前线程与阶梯位置、
 * 工作记忆、本回合允许的动作。对话只带最近几回合原文，远处的靠记忆与线程摘要。
 */

export const INTERVIEWER_PROMPT_VERSION = "interviewer-v3";
const RECENT_TURNS = 6;
const MAX_RESUME_CHARS = 6_000;
const MAX_JD_CHARS = 4_000;

function persona(round: string | null): string {
  switch (round) {
    case "second_interview":
      return "你是二面面试官，偏重系统设计、技术取舍与工程判断。";
    case "hr_interview":
      return "你是 HR 面试官，偏重动机、协作、复盘与自我认知；不考八股。";
    default:
      return "你是技术一面面试官，偏重项目深挖与基础原理。";
  }
}

const ACTION_NAMES: ActionName[] = [
  "ask_intro",
  "open_thread",
  "probe",
  "rescue",
  "close_thread",
  "close_interview",
];

export function allowedActions(state: InterviewerState): ActionName[] {
  return ACTION_NAMES.filter((name) => {
    if (name === "open_thread") {
      return state.brief.areas.some((area) => canAct(state, name, { areaId: area.id }).ok);
    }
    return canAct(state, name).ok;
  });
}

export function buildInterviewerSystemPrompt(
  state: InterviewerState,
  context: { jobTitle: string; jobDescription: string; resumeText: string },
): string {
  const active = activeThread(state);
  const activeArea = active ? areaById(state, active.areaId) : null;
  const areas = state.brief.areas
    .map((area) => {
      const threads = state.threads.filter((thread) => thread.areaId === area.id);
      const status = threads.some((t) => t.status === "active")
        ? "进行中"
        : threads.length > 0
          ? "已考察"
          : "未考察";
      return `- [${area.id}] ${area.name}（${area.kind}${area.style ? ` · ${area.style}` : ""}，目标深度 ${area.depth} 层，${status}）：${area.description}\n  切入问题：${area.entryQuestion}\n  深度阶梯：${area.ladder.map((rung, index) => `${index + 1}.${rung.text}${rung.style ? `（${rung.style}）` : ""}`).join(" → ")}`;
    })
    .join("\n");
  const closed = state.threads
    .filter((thread) => thread.status !== "active")
    .map((thread) => closedThreadSummary(thread, areaById(state, thread.areaId)?.name ?? thread.areaId))
    .join("\n");
  const allowed = allowedActions(state);

  const { min, max } = state.brief.turnRange;
  return `${persona(state.brief.round)}你正在进行一场模拟面试，目标岗位：${context.jobTitle}。本场预计 ${min}–${max} 个回合（一个回合 = 你问一次），现在是第 ${state.turnIndex + 1} 回合。

你的工作方式和真实面试官一样：手里没有题目清单，只有要考察的领域、要验证的简历假设和自己的判断。顺着候选人的回答往下追，答得好就继续挖，明显卡住就给一次台阶，再卡就换话题。每个领域考察够了就结束这一段；过了 ${min} 回合之后，你觉得整场考察够了就可以 close_interview，不必问完所有领域；到 ${max} 回合系统会强制收尾。

每回合你要做两件事：
1. 说一段话（先用一句话简短回应候选人刚才说的，不评分、不透露你的评分标准与期望信号，然后提出你的问题或过渡）。
2. 用工具做至多一个推进动作；另外可以用 note 更新工作记忆。候选人说"跳过""提示""再说一遍""结束"时，必须用对应的动作而不是口头答应。

本回合允许的推进动作：${allowed.join(", ")}${allowed.length === 0 ? "（无，只需说话）" : ""}。不被允许的动作会被系统拒绝并换成默认推进。

考察领域（深度是目标，最多多追一层）：
${areas}

${active ? `当前线程：领域 [${active.areaId}] ${activeArea?.name ?? ""}，切入问题「${active.entryQuestion}」，已追问 ${active.depth} 层（目标 ${activeArea?.depth ?? 1}，最多 ${probeLimit(state, active.areaId)}），已提示 ${active.rescues} 次（上限 1）。下一级阶梯：${(() => { const rung = activeArea?.ladder[Math.min(active.depth, activeArea.ladder.length - 1)]; return rung ? `${rung.text}${rung.style ? `（${rung.style}）` : ""}` : ""; })()}` : "当前没有进行中的线程。"}

已结束的线程：
${closed || "（无）"}

工作记忆：
${renderMemory(state.memory, state.brief)}

岗位描述（节选）：
${context.jobDescription.slice(0, MAX_JD_CHARS)}

候选人简历（节选）：
${context.resumeText.slice(0, MAX_RESUME_CHARS)}

提示词版本：${INTERVIEWER_PROMPT_VERSION}`;
}

/** 最近几回合的对话原文；更早的内容靠记忆与线程摘要。 */
export function buildConversation(state: InterviewerState): ModelMessage[] {
  const fromTurn = Math.max(0, state.turnIndex - RECENT_TURNS);
  return state.messages
    .filter((message) => message.turnIndex >= fromTurn)
    .map((message) => ({
      role: message.role === "interviewer" ? ("assistant" as const) : ("user" as const),
      content: message.content,
    }));
}
