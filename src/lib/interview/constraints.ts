import type { ContentLanguage } from "@/lib/i18n/locale";

import type { Action, InterviewState, MaterialState } from "./state";

/**
 * 动作底线（agent-freedom-plan §2.1）：代码不替模型决定每一步，也不再按配额退回；只守四条产品不能破的线：
 * 候选人要结束就结束、连续太多句没信息必须收尾、switch 的目标要存在且不是候选人跳过的、probe / clarify 要有当前材料。
 * 违约就让模型重出，仍违约才由代码定一个合法动作。全是纯函数。退回原因按场次语言写（原话发回给模型）。
 * 句数、角度、切回聊过的材料、什么时候收尾：这些是状态卡上的信号，由模型定。
 */

export type Proposal = { action: Action; target: string | null; facet: string | null };
export type Verdict = { ok: true } | { ok: false; reason: string };

/** 候选人连续这么多句没有信息就必须收尾：只防无限空转，正常面试碰不到（用户 2026-09-22 定要有上限）。 */
export const END_REQUIRED_AFTER = 10;

/** 内部词：候选人不该听到的说法，每种语言一份词表。英文的 material 是常用词，只在当作内部术语用时算（the / next / backup material、material id 这类）。 */
const LEAK_PATTERNS: Record<ContentLanguage, RegExp> = {
  zh: /(评分标准|期望信号|材料|状态卡|现场卡|我的笔记|系统提示(词)?(里|要求|让我|说))/,
  en: /\b(rubrics?|scoring criteria|expected signals?|state card|status card|my notes|system prompt|skill packs?|(?:the|this|that|next|another|each|every|main|main-track|backup|remaining|these|those) materials?|materials? (?:id|list))\b/i,
};

type ConstraintCopy = {
  mustEndWants: string;
  mustEndStreak: (streak: number) => string;
  clarifyWithout: string;
  probeWithout: string;
  switchTarget: (choices: string) => string;
  switchSkipped: (id: string, choices: string) => string;
  noChoice: string;
  separator: string;
  leak: string;
};

const COPY: Record<ContentLanguage, ConstraintCopy> = {
  zh: {
    mustEndWants: "候选人已表示要结束：这句必须是告别（action=end）",
    mustEndStreak: (streak) => `候选人已连续 ${streak} 句没有信息：这句必须是告别（action=end），不再提问`,
    clarifyWithout: "还没开始聊任何材料，不能答疑：先用 switch 进第一份材料",
    probeWithout: "还没开始聊任何材料，不能追问：先用 switch 进第一份材料",
    switchTarget: (choices) => `switch 的 target 必须是材料 id，可选：${choices}`,
    switchSkipped: (id, choices) => `材料 ${id} 是候选人主动跳过的，不再回去；可选：${choices}`,
    noChoice: "无（只能 end）",
    separator: "、",
    leak: "话里带了内部词（评分标准 / 期望信号 / 材料 / 状态卡这类），换个说法，候选人不该听到这些",
  },
  en: {
    mustEndWants: "The candidate has said they want to stop: this turn must be the goodbye (action=end)",
    mustEndStreak: (streak) => `The candidate has given ${streak} answers in a row with no information: this turn must be the goodbye (action=end), no more questions`,
    clarifyWithout: "No agenda item is open yet, so there is nothing to clarify: use switch to open the first item",
    probeWithout: "No agenda item is open yet, so there is nothing to probe: use switch to open the first item",
    switchTarget: (choices) => `switch needs target to be an agenda item id; available: ${choices}`,
    switchSkipped: (id, choices) => `The candidate chose to skip ${id}; don't go back to it. Available: ${choices}`,
    noChoice: "none (only end is possible)",
    separator: ", ",
    leak: "Your reply uses internal terms (rubric / expected signals / materials / state card and the like). Rephrase it: the candidate should never hear these",
  },
};

function current(state: InterviewState): MaterialState | null {
  return state.materials.find((item) => item.id === state.currentId) ?? null;
}

export function untouched(state: InterviewState): MaterialState[] {
  return state.materials.filter((item) => item.status === "untouched");
}

export function endRequired(state: InterviewState): boolean {
  return state.candidate.wantsToEnd || state.candidate.noInfoStreak >= END_REQUIRED_AFTER;
}

/** 校验一个提议：违约返回原因（原话发回让模型重出）。 */
export function checkAction(state: InterviewState, proposal: Proposal): Verdict {
  const copy = COPY[state.language];
  const choices = (items: MaterialState[]) => items.map((item) => item.id).join(copy.separator) || copy.noChoice;
  if (endRequired(state) && proposal.action !== "end") return { ok: false, reason: state.candidate.wantsToEnd ? copy.mustEndWants : copy.mustEndStreak(state.candidate.noInfoStreak) };
  const now = current(state);
  switch (proposal.action) {
    case "end":
      return { ok: true };
    case "clarify":
      return now ? { ok: true } : { ok: false, reason: copy.clarifyWithout };
    case "switch": {
      const target = state.materials.find((item) => item.id === proposal.target);
      if (!target) return { ok: false, reason: copy.switchTarget(choices(state.materials.filter((item) => item.status !== "skipped"))) };
      if (target.status === "skipped") return { ok: false, reason: copy.switchSkipped(target.id, choices(state.materials.filter((item) => item.status !== "skipped" && item.id !== target.id))) };
      return { ok: true };
    }
    case "probe":
      return now ? { ok: true } : { ok: false, reason: copy.probeWithout };
  }
}

/** 说的话只有一条硬规则：不带内部词（按场次语言的词表）。 */
export function checkReply(reply: string, language: ContentLanguage = "zh"): Verdict {
  return LEAK_PATTERNS[language].test(reply) ? { ok: false, reason: COPY[language].leak } : { ok: true };
}

/** 模型两次都违约时代码定的动作：必须收尾就收尾；有当前材料就接着问；有没聊的就切过去；否则收尾。 */
export function fallbackAction(state: InterviewState): Proposal {
  if (endRequired(state)) return { action: "end", target: null, facet: null };
  const now = current(state);
  if (now) return { action: "probe", target: now.id, facet: null };
  const next = untouched(state)[0];
  if (next) return { action: "switch", target: next.id, facet: null };
  return { action: "end", target: null, facet: null };
}
