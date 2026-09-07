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

/** 当前进程写入的记录统一带的标签；评测运行器设置，真实服务不设。 */
let currentTag: string | null = null;

export function setAgentRunTag(tag: string | null): void {
  currentTag = tag;
}

/** 落点是 fire-and-forget 的；评测要在跑完后读回记录，需要等它们真的写完。 */
const pending = new Set<Promise<void>>();

export async function flushAgentRunPersistence(): Promise<void> {
  await Promise.allSettled([...pending]);
}

export function persistAgentRun(record: AgentLogRecord): Promise<void> {
  const write = writeAgentRun(record).finally(() => pending.delete(write));
  pending.add(write);
  return write;
}

async function writeAgentRun(record: AgentLogRecord): Promise<void> {
  await prisma.agentRun.create({
    data: {
      tag: currentTag,
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
  input: { agent?: string; status?: string; tag?: string | null; limit?: number } = {},
) {
  return prisma.agentRun.findMany({
    where: {
      ...(input.agent ? { agent: input.agent } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.tag !== undefined ? { tag: input.tag } : {}),
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
      tag: true,
      createdAt: true,
    },
  });
}
