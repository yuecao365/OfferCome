import "server-only";

import { prisma } from "@/lib/db";
import { parseJsonObject } from "@/lib/json";

/**
 * 模拟面试会话的状态机基础设施。
 *
 * 生成、作答、交卷三条流程都在并发下推进同一条会话记录（后台任务、用户操作、
 * 页面轮询可能同时到达），所以每一次状态推进都必须带上"我以为的当前状态"作为
 * 条件写入。此前这个模式在 service.ts 里手抄了十几遍，很容易漏掉判定。
 */

/** 会话上下文快照。字段全部可选——历史数据不保证写全。 */
export type GenerationSnapshot = {
  jobBlueprint?: unknown;
  generationRequest?: {
    difficulty?: unknown;
    round?: unknown;
    seedQuestionId?: unknown;
    seedInsightId?: unknown;
    jdStrategy?: unknown;
  };
  jdReviewCount?: unknown;
  generationErrorContext?: unknown;
  [key: string]: unknown;
};

export function parseGenerationSnapshot(value: string): GenerationSnapshot {
  return parseJsonObject(value) as GenerationSnapshot;
}

type SessionDelegate = Pick<typeof prisma.mockInterviewSession, "updateMany">;

/** prisma 和事务客户端都满足这个形状。 */
export type SessionClient = { mockInterviewSession: SessionDelegate };

type UpdateManyArgs = Parameters<SessionDelegate["updateMany"]>[0];

/**
 * 带条件的状态推进：写中恰好一行才算认领成功。
 *
 * 返回 false 表示这条会话已经被别的流程改过——调用方应当安静放弃本轮，
 * 而不是覆盖对方的结果。
 */
export async function claimSession(
  client: SessionClient,
  args: NonNullable<UpdateManyArgs>,
): Promise<boolean> {
  const result = await client.mockInterviewSession.updateMany(args);
  return result.count === 1;
}
