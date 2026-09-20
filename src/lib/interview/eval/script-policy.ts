import { FACET_PROBE_MAX } from "../state";
import type { Interviewer } from "../turn";
import type { InterviewerOutput } from "../interviewer";

/**
 * 固定题本（评测基线，设计 v2 / 施工图 D 段）：不调模型，按备课顺序逐份材料问，问满就换，全问完就收尾。
 * 它**不听回答**：signal 永远是 answered，不会因为候选人答不上而换题或收尾——这正是"非自适应"的定义，
 * 也是它作为基线的意义：同样的备课、同样的预算、同样的约束表与评分，只差"下一句问什么"是不是根据回答定的。
 * 话术只用备课产出（切入问法、追问角度）拼成，不额外写题。
 */
export const scriptInterviewer: Interviewer = async (input) => {
  const { state, brief } = input;
  const areaOf = (id: string) => brief.areas.find((area) => area.id === id);
  let output: InterviewerOutput;
  if (state.phase === "opening") {
    output = { signal: "answered", action: "probe", target: null, facet: null, why: "固定题本：开场", ledger: "", reply: "你好，先请你用一两分钟介绍一下与这个岗位相关的经历。" };
  } else {
    const now = state.materials.find((item) => item.id === state.currentId) ?? null;
    const next = state.materials.find((item) => item.status === "untouched") ?? null;
    if (now && now.asked < now.budget) {
      if (now.facets.length > 0) {
        const facet = now.facets.findIndex((item) => item.status !== "done" && item.probes < FACET_PROBE_MAX);
        if (facet >= 0) {
          output = { signal: "answered", action: "probe", target: now.id, facet, why: "固定题本：按角度顺序追", ledger: "", reply: `接着这个项目：${now.facets[facet].text}——展开说说。` };
        } else if (next) {
          output = { signal: "answered", action: "switch", target: next.id, facet: null, why: "固定题本：角度问完换材料", ledger: "", reply: areaOf(next.id)?.entryQuestion ?? `我们聊聊${next.name}。` };
        } else {
          output = { signal: "answered", action: "end", target: null, facet: null, why: "固定题本：问完了", ledger: "", reply: "今天就到这里，谢谢你的时间。" };
        }
      } else {
        const guide = areaOf(now.id)?.guides[Math.min(now.asked - 1, (areaOf(now.id)?.guides.length ?? 1) - 1)];
        output = { signal: "answered", action: "probe", target: now.id, facet: null, why: "固定题本：唯一一层追问", ledger: "", reply: guide ? `再往下说一层：${guide}` : "再具体一点。" };
      }
    } else if (next) {
      output = { signal: "answered", action: "switch", target: next.id, facet: null, why: "固定题本：换下一份材料", ledger: "", reply: areaOf(next.id)?.entryQuestion ?? `我们聊聊${next.name}。` };
    } else {
      output = { signal: "answered", action: "end", target: null, facet: null, why: "固定题本：问完了", ledger: "", reply: "今天就到这里，谢谢你的时间。" };
    }
  }
  return { output, partial: false, runId: input.runId, provider: "script", model: "fixed-script", durationMs: 0, steps: 0, toolCalls: [], events: [] };
};
