import type { Action, InterviewState, MaterialState } from "./state";

/**
 * 动作底线（agent-freedom-plan §2.1）：代码不替模型决定每一步，也不再按配额退回；只守四条产品不能破的线：
 * 候选人要结束就结束、连续太多句没信息必须收尾、switch 的目标要存在且不是候选人跳过的、probe / clarify 要有当前材料。
 * 违约就让模型重出，仍违约才由代码定一个合法动作。全是纯函数。
 * 句数、角度、切回聊过的材料、什么时候收尾：这些是状态卡上的信号，由模型定。
 */

export type Proposal = { action: Action; target: string | null; facet: string | null };
export type Verdict = { ok: true } | { ok: false; reason: string };

/** 候选人连续这么多句没有信息就必须收尾：只防无限空转，正常面试碰不到（用户 2026-09-22 定要有上限）。 */
export const END_REQUIRED_AFTER = 10;

const LEAK_PATTERN = /(评分标准|期望信号|材料|状态卡|现场卡|我的笔记|系统提示(词)?(里|要求|让我|说))/;

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
  if (endRequired(state) && proposal.action !== "end") return { ok: false, reason: state.candidate.wantsToEnd ? "候选人已表示要结束：这句必须是告别（action=end）" : `候选人已连续 ${state.candidate.noInfoStreak} 句没有信息：这句必须是告别（action=end），不再提问` };
  const now = current(state);
  switch (proposal.action) {
    case "end":
      return { ok: true };
    case "clarify":
      return now ? { ok: true } : { ok: false, reason: "还没开始聊任何材料，不能答疑：先用 switch 进第一份材料" };
    case "switch": {
      const target = state.materials.find((item) => item.id === proposal.target);
      if (!target) return { ok: false, reason: `switch 的 target 必须是材料 id，可选：${state.materials.filter((item) => item.status !== "skipped").map((item) => item.id).join("、") || "无（只能 end）"}` };
      if (target.status === "skipped") return { ok: false, reason: `材料 ${target.id} 是候选人主动跳过的，不再回去；可选：${state.materials.filter((item) => item.status !== "skipped" && item.id !== target.id).map((item) => item.id).join("、") || "无（只能 end）"}` };
      return { ok: true };
    }
    case "probe":
      return now ? { ok: true } : { ok: false, reason: "还没开始聊任何材料，不能追问：先用 switch 进第一份材料" };
  }
}

/** 说的话只有一条硬规则：不带内部词。 */
export function checkReply(reply: string): Verdict {
  return LEAK_PATTERN.test(reply) ? { ok: false, reason: "话里带了内部词（评分标准 / 期望信号 / 材料 / 状态卡这类），换个说法，候选人不该听到这些" } : { ok: true };
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
