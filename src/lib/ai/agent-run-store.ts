import { prisma } from "@/lib/db";
import { isTrialMode } from "@/lib/runtime-mode";

import { setAgentRunSink, type AgentLogRecord } from "./run-agent";

/**
 * agent 运行记录的持久化与查询。
 *
 * 控制台日志只能事后翻；落库之后同一次生成的调用能按 runId 串起来看：
 * 蓝图走到第几级、补全加了几条、出题采纳率、每步 token。payload / output /
 * rawText 原样保存，是之后离线回放与评测的样本来源。
 */

/** SDK 的 usage 字段在不同版本里可能是数字或带 total 的对象，两种都接。 */
function tokenCount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object" && "total" in value) {
    return tokenCount((value as { total: unknown }).total);
  }
  return null;
}

function toJson(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

export async function persistAgentRun(record: AgentLogRecord): Promise<void> {
  await prisma.agentRun.create({
    data: {
      runId: record.runId,
      agent: record.agent,
      event: record.event,
      status: record.status,
      provider: record.provider,
      model: record.model,
      promptVersion: record.promptVersion,
      durationMs: Math.max(0, Math.round(record.durationMs)),
      finishReason: record.finishReason ?? null,
      inputTokens: tokenCount(record.usage?.inputTokens),
      outputTokens: tokenCount(record.usage?.outputTokens),
      totalTokens: tokenCount(record.usage?.totalTokens),
      errorKind: record.errorKind ?? null,
      metricsJson: toJson(record.metrics),
      payloadJson: toJson(record.payload),
      outputJson: toJson(record.output),
      rawText: record.rawText ?? null,
    },
  });
}

/** 服务启动时调用一次。网页版无状态，不落库。 */
export function installAgentRunPersistence(): void {
  if (isTrialMode()) return;
  setAgentRunSink(persistAgentRun);
}

/** 一次生成的完整链路，按时间正序。 */
export function getAgentRunChain(runId: string) {
  return prisma.agentRun.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
  });
}

export function listRecentAgentRuns(
  input: { agent?: string; status?: string; limit?: number } = {},
) {
  return prisma.agentRun.findMany({
    where: {
      ...(input.agent ? { agent: input.agent } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, input.limit ?? 50)),
    select: {
      id: true,
      runId: true,
      agent: true,
      event: true,
      status: true,
      provider: true,
      model: true,
      promptVersion: true,
      durationMs: true,
      totalTokens: true,
      errorKind: true,
      metricsJson: true,
      createdAt: true,
    },
  });
}
