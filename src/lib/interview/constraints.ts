import { FACET_PROBE_MAX, type Action, type InterviewState, type MaterialState } from "./state";

/**
 * 动作约束（重建 v5 §4）：代码不替模型决定每一步，只校验模型提的动作有没有违约；违约就让它重出，仍违约才由代码定一个合法动作。
 * 全是纯函数：输入面试状态与提议，输出判决或一个合法动作。
 */

export type Proposal = { action: Action; target: string | null; facet: number | null };
export type Verdict = { ok: true } | { ok: false; reason: string };

/** 候选人连续这么多句没有信息就允许收尾；到 END_REQUIRED 必须收尾（用户 2026-09-18 定）。 */
export const END_ALLOWED_AFTER = 3;
export const END_REQUIRED_AFTER = 6;

const LEAK_PATTERN = /(评分标准|期望信号|材料|状态卡|现场卡|我的笔记|系统提示(词)?(里|要求|让我|说))/;

function current(state: InterviewState): MaterialState | null {
  return state.materials.find((item) => item.id === state.currentId) ?? null;
}

export function untouched(state: InterviewState): MaterialState[] {
  return state.materials.filter((item) => item.status === "untouched");
}

export function endAllowed(state: InterviewState): boolean {
  return state.candidate.wantsToEnd || state.candidate.noInfoStreak >= END_ALLOWED_AFTER || (untouched(state).length === 0 && (current(state) === null || current(state)!.asked >= current(state)!.budget));
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
      if (endAllowed(state)) return { ok: true };
      return { ok: false, reason: `还不能收尾：${untouched(state).length > 0 ? `还有没聊的材料（${untouched(state).map((item) => item.id).join("、")}）` : `当前材料 ${now?.id} 还有 ${(now?.budget ?? 0) - (now?.asked ?? 0)} 句余额`}，候选人也没有连续 ${END_ALLOWED_AFTER} 句答不上。${untouched(state).length > 0 ? "换材料或接着问" : "接着问"}` };
    case "clarify":
      return now ? { ok: true } : { ok: false, reason: "还没开始聊任何材料，不能答疑：先用 switch 进第一份材料" };
    case "switch": {
      const target = state.materials.find((item) => item.id === proposal.target);
      if (!target) return { ok: false, reason: `switch 的 target 必须是材料 id，可选：${untouched(state).map((item) => item.id).join("、") || "无（都聊完了，只能 end）"}` };
      if (target.status !== "untouched") return { ok: false, reason: `材料 ${target.id} 已经${target.status === "skipped" ? "被跳过" : "聊过了"}，不能再切回去；可选：${untouched(state).map((item) => item.id).join("、") || "无（只能 end）"}` };
      return { ok: true };
    }
    case "probe": {
      if (!now) return { ok: false, reason: "还没开始聊任何材料，不能追问：先用 switch 进第一份材料" };
      if (now.asked >= now.budget) return { ok: false, reason: `材料 ${now.id} 已问满 ${now.budget} 句：换材料（${untouched(state).map((item) => item.id).join("、") || "无"}）或收尾` };
      if (now.facets.length > 0) {
        if (proposal.facet === null || !now.facets[proposal.facet]) return { ok: false, reason: `项目材料的 probe 要带角度序号 facet（0–${now.facets.length - 1}）` };
        const facet = now.facets[proposal.facet];
        if (facet.status === "done" || facet.probes >= FACET_PROBE_MAX) return { ok: false, reason: `角度 ${proposal.facet + 1}「${facet.text}」已追满 ${FACET_PROBE_MAX} 句或已讲透：换一个没问的角度、换材料或收尾` };
      }
      return { ok: true };
    }
  }
}

/** 说的话只有一条硬规则：不带内部词。 */
export function checkReply(reply: string): Verdict {
  return LEAK_PATTERN.test(reply) ? { ok: false, reason: "话里带了内部词（评分标准 / 期望信号 / 材料 / 状态卡这类），换个说法，候选人不该听到这些" } : { ok: true };
}

/** 模型两次都违约时代码定的动作：当前材料没问够 → probe（项目取第一个没追满的角度）；有没聊的材料 → switch；否则 end。 */
export function fallbackAction(state: InterviewState): Proposal {
  if (endRequired(state)) return { action: "end", target: null, facet: null };
  const now = current(state);
  if (now && now.asked < now.budget) {
    const facet = now.facets.findIndex((item) => item.status !== "done" && item.probes < FACET_PROBE_MAX);
    if (now.facets.length === 0 || facet >= 0) return { action: "probe", target: now.id, facet: now.facets.length === 0 ? null : facet };
  }
  const next = untouched(state)[0];
  if (next) return { action: "switch", target: next.id, facet: null };
  return { action: "end", target: null, facet: null };
}

/** 给模型的可选动作与余额（状态卡尾部一行）。 */
export function renderOptions(state: InterviewState): string {
  if (endRequired(state)) return "这回合必须收尾（action=end）。";
  const now = current(state);
  const options: string[] = [];
  if (now && now.asked < now.budget) {
    const facets = now.facets.map((facet, index) => ({ facet, index })).filter(({ facet }) => facet.status !== "done" && facet.probes < FACET_PROBE_MAX);
    if (now.facets.length === 0) options.push(`probe：接着问「${now.name}」（还能问 ${now.budget - now.asked} 句）`);
    else if (facets.length > 0) options.push(`probe：接着问「${now.name}」的角度 ${facets.map(({ index, facet }) => `${index + 1}（${facet.text}${facet.probes > 0 ? `，已追 ${facet.probes} 句` : ""}）`).join(" / ")}（这份材料还能问 ${now.budget - now.asked} 句）`);
  }
  if (now) options.push("clarify：把上一句说具体或降一层（不占预算）");
  const next = untouched(state);
  if (next.length > 0) options.push(`switch：换到 ${next.map((item) => `${item.id}「${item.name}」`).join(" / ")}`);
  if (endAllowed(state)) options.push("end：收尾告别");
  return `可选动作：${options.join("；")}。`;
}
