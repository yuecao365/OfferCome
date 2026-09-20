/**
 * trace 页按步查看（深度扩展 G6）：把 AgentRun 行（一次调用的汇总、循环的每一步、每次工具调用、修补、预算触顶……）
 * 变成可读的"步"，并从事件日志上找出某一回合的边界（重放到这里用）。纯函数。
 */

export type AgentRunRow = {
  runId: string;
  agent: string;
  event: string;
  status: string;
  durationMs: number;
  totalTokens: number | null;
  cachedTokens: number | null;
  errorKind: string | null;
  metricsJson: string | null;
  payloadJson: string | null;
  outputJson: string | null;
  rawText: string | null;
  systemText: string | null;
  createdAt: Date;
};

export type TraceStep = {
  event: string;
  status: string;
  durationMs: number;
  totalTokens: number | null;
  cachedTokens: number | null;
  errorKind: string | null;
  /** 模型看到的输入片段（多条消息时只取最后一条，通常是现场卡）。 */
  input: string | null;
  /** 模型的输出片段（原始文本或结构化结果）。 */
  output: string | null;
  tool: { name: string; access: string; input: string; ok: boolean } | null;
  metrics: Record<string, number> | null;
  /** 发给模型的完整系统提示词（只有 model_call 汇总行有）。 */
  system: string | null;
};

export type TraceAgentChain = {
  runId: string;
  agent: string;
  label: string;
  status: string;
  durationMs: number;
  totalTokens: number;
  steps: TraceStep[];
};

const INPUT_CHARS = 600;
const OUTPUT_CHARS = 600;

export const AGENT_LABELS: Record<string, string> = {
  interviewer: "面试官",
  question_evaluation: "评分",
  answer_exemplar: "示范回答",
  candidate_dossier: "候选人档案",
  interview_summary: "报告汇总",
  interview_brief: "备课简报",
  job_blueprint: "岗位蓝图",
};

function parse(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return json;
  }
}

function excerpt(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 输入片段：消息列表取最后一条（现场卡）并注明条数；其它载荷截断。 */
function inputExcerpt(payload: unknown): string | null {
  if (Array.isArray(payload) && payload.length > 0 && typeof payload[0] === "object") {
    const last = payload[payload.length - 1] as { role?: string; content?: unknown };
    const content = typeof last.content === "string" ? last.content : JSON.stringify(last.content ?? "");
    return `共 ${payload.length} 条消息；最后一条（${last.role ?? "?"}）：${excerpt(content, INPUT_CHARS) ?? ""}`;
  }
  return excerpt(payload, INPUT_CHARS);
}

export function traceStepOf(row: AgentRunRow): TraceStep {
  const payload = parse(row.payloadJson);
  const metrics = (parse(row.metricsJson) as Record<string, number> | null) ?? null;
  const base = { event: row.event, status: row.status, durationMs: row.durationMs, totalTokens: row.totalTokens, cachedTokens: row.cachedTokens, errorKind: row.errorKind, metrics };
  if (row.event === "tool_result" || row.event === "interrupted" || row.event === "resumed") {
    const call = (payload ?? {}) as { tool?: string; access?: string; input?: unknown };
    return { ...base, input: null, output: excerpt(parse(row.outputJson), OUTPUT_CHARS), tool: { name: call.tool ?? "?", access: call.access ?? "read", input: excerpt(call.input, 200) ?? "", ok: row.status === "success" }, system: null };
  }
  return {
    ...base,
    input: row.event === "model_call" ? inputExcerpt(payload) : null,
    output: excerpt(row.rawText ?? parse(row.outputJson), OUTPUT_CHARS),
    tool: null,
    system: row.systemText,
  };
}

/** 按 runId 归成链：同一次调用的所有行按时间排。 */
export function agentChainsOf(rows: AgentRunRow[]): TraceAgentChain[] {
  const byRun = new Map<string, AgentRunRow[]>();
  for (const row of rows) byRun.set(row.runId, [...(byRun.get(row.runId) ?? []), row]);
  return [...byRun.entries()].map(([runId, group]) => {
    const sorted = [...group].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    const summary = sorted.find((row) => row.event === "model_call") ?? sorted[0];
    return {
      runId,
      agent: summary.agent,
      label: AGENT_LABELS[summary.agent] ?? summary.agent,
      status: sorted.some((row) => row.event === "model_call" && row.status === "failed") ? "failed" : sorted.some((row) => row.status === "partial") ? "partial" : "success",
      durationMs: sorted.filter((row) => row.event === "model_call").reduce((sum, row) => sum + row.durationMs, 0),
      totalTokens: sorted.filter((row) => row.event === "model_call").reduce((sum, row) => sum + (row.totalTokens ?? 0), 0),
      steps: sorted.map(traceStepOf),
    };
  });
}

/**
 * 某一回合在事件日志里的边界（重放到这里）：第 turnIndex 个面试官发言之前的事件是状态，它前面的候选人发言是这回合的输入。
 * 返回 events 里的下标：prefixEnd 之前的事件构成状态；candidateIndex 是这回合候选人那条（开场没有为 null）。找不到该回合返回 null。
 */
export function turnBoundary(events: { type: string }[], turnIndex: number): { prefixEnd: number; candidateIndex: number | null } | null {
  let seen = -1;
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].type !== "interviewer_said") continue;
    seen += 1;
    if (seen !== turnIndex) continue;
    let candidateIndex: number | null = null;
    for (let back = index - 1; back >= 0; back -= 1) {
      const type = events[back].type;
      if (type === "interviewer_said") break;
      if (type === "candidate_said") {
        candidateIndex = back;
        break;
      }
    }
    return { prefixEnd: candidateIndex ?? index, candidateIndex };
  }
  return null;
}
