import type { Interviewer } from "../turn";
import type { InterviewerOutput } from "../interviewer";
import { initialNotes } from "../notes";

/**
 * 固定题本（评测基线，设计 v2 / 施工图 D 段）：不调模型，按备课顺序逐份材料问，问满就换，全问完就收尾。
 * 它**不听回答**：signal 永远是 answered，不会因为候选人答不上而换题或收尾——这正是"非自适应"的定义，
 * 也是它作为基线的意义：同样的备课、同样的预算、同样的约束表与评分，只差"下一句问什么"是不是根据回答定的。
 * 话术只用备课产出（切入问法、追问角度）拼成，不额外写题。句数按状态卡的参考值走，同一角度最多问两句。
 */
const SCRIPT_FACET_PROBES = 2;
export const scriptInterviewer: Interviewer = async (input) => {
  const { state, brief } = input;
  const areaOf = (id: string) => brief.areas.find((area) => area.id === id);
  // 固定题本不做笔记：每回合交开场预填的那份，格式门自然过。
  const notes = initialNotes(brief);
  let output: InterviewerOutput;
  if (state.phase === "opening") {
    output = { signal: "answered", action: "probe", target: null, facet: null, notes, reply: "你好，先请你用一两分钟介绍一下与这个岗位相关的经历。" };
  } else {
    const now = state.materials.find((item) => item.id === state.currentId) ?? null;
    const next = state.materials.find((item) => item.status === "untouched") ?? null;
    if (now && now.asked < now.reference) {
      if (now.facets.length > 0) {
        const facet = now.facets.find((item) => item.probes < SCRIPT_FACET_PROBES);
        if (facet) {
          output = { signal: "answered", action: "probe", target: now.id, facet: facet.text, notes, reply: `接着这个项目：${facet.text}——展开说说。` };
        } else if (next) {
          output = { signal: "answered", action: "switch", target: next.id, facet: null, notes, reply: areaOf(next.id)?.entryQuestion ?? `我们聊聊${next.name}。` };
        } else {
          output = { signal: "answered", action: "end", target: null, facet: null, notes, reply: "今天就到这里，谢谢你的时间。" };
        }
      } else {
        const guide = areaOf(now.id)?.guides[Math.min(now.asked - 1, (areaOf(now.id)?.guides.length ?? 1) - 1)];
        output = { signal: "answered", action: "probe", target: now.id, facet: null, notes, reply: guide ? `再往下说一层：${guide}` : "再具体一点。" };
      }
    } else if (next) {
      output = { signal: "answered", action: "switch", target: next.id, facet: null, notes, reply: areaOf(next.id)?.entryQuestion ?? `我们聊聊${next.name}。` };
    } else {
      output = { signal: "answered", action: "end", target: null, facet: null, notes, reply: "今天就到这里，谢谢你的时间。" };
    }
  }
  return { output, partial: false, runId: input.runId, provider: "script", model: "fixed-script", durationMs: 0, steps: 0, toolCalls: [], events: [] };
};
