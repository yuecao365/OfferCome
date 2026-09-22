import type { InterviewBrief } from "@/lib/mock-interviews/brief/brief";
import { questionSimilarity } from "@/lib/text/similarity";

import { planMaterials } from "../progress";
import { isNoInfo, replyKindOf, transcriptOf, type InterviewEvent, type ReplyKind, type TranscriptLine } from "../events";
import { SIGNALS } from "../state";
import { evaluationTrajectoryMetrics, type EvaluationRunFact } from "./metrics";

/**
 * 每场自动复盘（设计修订 v3 §3，F2）：从事件日志现算、不落库——备课备好了没、候选人的行为分类、面试官违反准则的回合、
 * 底线触发次数，再拼一句归因。真实场次的失败先在这里露出来，进失败清单（docs/interview-failures.md），再回灌模拟器。零模型调用。
 */

export type ViolationRule = "repeat" | "multi_ask" | "over_reference" | "stuck_after_dont_know";

export type Postmortem = {
  /** 备课备好了没（占位蓝图 / 兜底简报 = 没备好）。 */
  ready: boolean;
  /** 候选人的话按信号计数（模型判的 signal，按钮直接映射）；long = 超过 500 字的回答。 */
  replies: Record<ReplyKind | "long", number>;
  /** 面试官违反准则的回合。 */
  violations: { seq: number; rule: ViolationRule; text: string }[];
  /** 代码接话或底线触发的回合（fallback_used）：原因与被替换掉的原话。 */
  guards: { seq: number; reason: string; original: string | null }[];
  /** 轨迹（G6，从记账行算）：评分每段步数与工具调用、无效调用、预算触顶、面试官查资料次数；没有记账为 null。 */
  trajectory: { evaluationSteps: number | null; evaluationToolCalls: number | null; invalidToolCalls: number; budgetHits: number; interviewerLookups: number } | null;
  summary: string[];
};

export const VIOLATION_LABELS: Record<ViolationRule, string> = {
  repeat: "同一题重复问",
  multi_ask: "一句多问",
  over_reference: "超过参考句数一倍还在问",
  stuck_after_dont_know: "两次答不上还没换题",
};

const LONG_ANSWER_CHARS = 500;
const REPEAT_SIMILARITY = 0.8;

function currentTopic(transcript: Pick<TranscriptLine, "role" | "topic">[]): string | null {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const line = transcript[index];
    if (line.role === "interviewer" && line.topic) return line.topic;
  }
  return null;
}

function trailingDontKnows(transcript: TranscriptLine[]): number {
  let count = 0;
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const line = transcript[index];
    if (line.role !== "candidate") continue;
    if (!isNoInfo(line)) break;
    count += 1;
  }
  return count;
}

export function postmortem(input: { events: InterviewEvent[]; brief: InterviewBrief | null; ready: boolean; trajectory?: { evaluation: EvaluationRunFact[]; interviewerLookups: number } }): Postmortem {
  const transcript = transcriptOf(input.events);
  const replies = Object.fromEntries([...SIGNALS, "skip", "long"].map((kind) => [kind, 0])) as Postmortem["replies"];
  for (const line of transcript) {
    if (line.role !== "candidate") continue;
    replies[replyKindOf(line)] += 1;
    if (line.content.length > LONG_ANSWER_CHARS) replies.long += 1;
  }
  const violations: Postmortem["violations"] = [];
  // 句数只是参考（agent-freedom-plan）：超过参考值一倍才提出来看，不算违规。
  const references = new Map((input.brief ? planMaterials(input.brief) : []).map((item) => [item.id, item.reference * 2]));
  const askedOn = new Map<string, number>();
  const said: TranscriptLine[] = [];
  for (const item of input.events) {
    if (item.type !== "interviewer_said" || (item.payload.kind !== "say" && item.payload.kind !== "aside")) continue;
    const line = transcript.find((entry) => entry.seq === item.seq);
    if (!line) continue;
    const before = transcript.filter((entry) => entry.seq < item.seq);
    if (said.some((prior) => questionSimilarity(prior.content, line.content) >= REPEAT_SIMILARITY)) violations.push({ seq: item.seq, rule: "repeat", text: line.content });
    if ((line.content.match(/[？?]/g) ?? []).length >= 2) violations.push({ seq: item.seq, rule: "multi_ask", text: line.content });
    if (line.topic && line.kind === "say") {
      const asked = (askedOn.get(line.topic) ?? 0) + 1;
      askedOn.set(line.topic, asked);
      if (asked > (references.get(line.topic) ?? Infinity)) violations.push({ seq: item.seq, rule: "over_reference", text: line.content });
    }
    const previous = currentTopic(before);
    if (trailingDontKnows(before) >= 2 && previous !== null && (line.topic ?? previous) === previous) violations.push({ seq: item.seq, rule: "stuck_after_dont_know", text: line.content });
    said.push(line);
  }
  const guards = input.events.flatMap((item) => (item.type === "fallback_used" ? [{ seq: item.seq, reason: item.payload.reason, original: item.payload.original ?? null }] : []));
  const summary: string[] = [];
  if (!input.ready) summary.push("备课没备好（占位蓝图或兜底简报），这场按通用要求出题");
  if (replies.long > 0) summary.push(`候选人有 ${replies.long} 条超过 500 字的回答`);
  if (replies.dont_know > 0) summary.push(`候选人 ${replies.dont_know} 次答不上`);
  if (replies.help > 0) summary.push(`候选人 ${replies.help} 次求助 / 要求具体`);
  if (replies.not_mine > 0) summary.push(`候选人 ${replies.not_mine} 次说不是自己做的`);
  if (replies.refuse > 0) summary.push(`候选人 ${replies.refuse} 次不作答 / 要分`);
  if (replies.thin > 0) summary.push(`候选人 ${replies.thin} 句答了但空`);
  const byRule = new Map<ViolationRule, number>();
  for (const item of violations) byRule.set(item.rule, (byRule.get(item.rule) ?? 0) + 1);
  for (const [rule, count] of byRule) summary.push(`面试官${VIOLATION_LABELS[rule]} ${count} 次`);
  if (guards.length > 0) summary.push(`代码接话或底线触发 ${guards.length} 次`);
  const lookups = input.events.filter((item) => item.type === "tool_called").length;
  if (lookups > 0) summary.push(`面试官查资料 ${lookups} 次`);
  const trajectory = input.trajectory
    ? {
        evaluationSteps: evaluationTrajectoryMetrics(input.trajectory.evaluation).evaluationSteps,
        evaluationToolCalls: evaluationTrajectoryMetrics(input.trajectory.evaluation).evaluationToolCalls,
        invalidToolCalls: input.trajectory.evaluation.reduce((sum, run) => sum + run.invalidCalls, 0),
        budgetHits: input.trajectory.evaluation.filter((run) => run.budgetHit).length,
        interviewerLookups: input.trajectory.interviewerLookups,
      }
    : null;
  // 轨迹级失败（G6）：给了工具一次没用、无效调用、预算触顶——这些从分数上看不出来。
  if (trajectory && trajectory.evaluationSteps !== null && (trajectory.evaluationToolCalls ?? 0) === 0) summary.push("评分带着工具一次都没调（检查提示词里的触发时机）");
  if (trajectory && trajectory.invalidToolCalls > 0) summary.push(`评分有 ${trajectory.invalidToolCalls} 次无效工具调用`);
  if (trajectory && trajectory.budgetHits > 0) summary.push(`评分有 ${trajectory.budgetHits} 段触顶预算`);
  if (summary.length === 0) summary.push("没有发现准则违反或异常行为");
  return { ready: input.ready, replies, violations, guards, trajectory, summary };
}
