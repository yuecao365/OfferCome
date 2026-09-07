import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";

import {
  buildMockInterviewContext,
  serializeMockInterviewContext,
  type MockInterviewContext,
} from "./context";
import { isMockInterviewGenerationError } from "./errors";
import { isInterviewPace } from "./interviewer/brief";
import { generateInterviewBrief } from "./interviewer/brief-agent";
import { emptyMemory } from "./interviewer/memory";
import { analyzeMockInterviewJob } from "./job-analysis-agent";
import {
  claimSession,
  parseGenerationSnapshot,
  type GenerationSnapshot,
} from "./session-state";
import {
  ACTIVE_MOCK_INTERVIEW_STATUS,
  storedJobBlueprintSchema,
  type MockInterviewJobBlueprint,
} from "./types";

/**
 * 备课流水线：上下文 → 岗位蓝图 → 面试简报 → 落库开房。
 *
 * JD 是必填的第一依据；JD 没写到的部分由备课 agent 从技能包补齐，
 * 所以这里不再判断 JD 够不够、也不联网补全。
 *
 * 两条贯穿全程的规则：
 * 1. 每一步推进状态都用乐观锁，写不中就安静放弃——说明用户已经重试或删除了会话。
 * 2. 除了"模型完全不可用"，任何一步都要降级继续，绝不把死胡同丢给用户。
 */

type GenerationSessionRow = NonNullable<
  Awaited<ReturnType<typeof loadGeneratingSession>>
>;

async function loadGeneratingSession(sessionId: string) {
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    include: {
      interview: { select: { companyName: true, jobTitle: true } },
    },
  });
  if (!session || session.status !== "generating" || !session.resumeId || !isInterviewPace(session.pace)) {
    return null;
  }
  return { ...session, pace: session.pace };
}

type GenerationRequest = {
  round: string | null;
  seedQuestionId: string | null;
  seedInsightId: string | null;
};

/** 创建会话时写进快照的生成参数。历史数据字段可能缺失，逐个兜底。 */
function readGenerationRequest(snapshot: GenerationSnapshot): GenerationRequest {
  const request = snapshot.generationRequest ?? {};
  return {
    round: typeof request.round === "string" ? request.round : null,
    seedQuestionId:
      typeof request.seedQuestionId === "string" ? request.seedQuestionId : null,
    seedInsightId:
      typeof request.seedInsightId === "string" ? request.seedInsightId : null,
  };
}

/**
 * 阶段一：拿到岗位能力蓝图。
 * 蓝图已经在快照里就直接复用——重试时不必重跑一次模型。
 */
async function ensureBlueprint(
  session: GenerationSessionRow,
  snapshot: GenerationSnapshot,
  generationId: string,
): Promise<MockInterviewJobBlueprint | null> {
  const stored = storedJobBlueprintSchema.safeParse(snapshot.jobBlueprint);
  if (stored.success) return stored.data;

  await claimSession(prisma, {
    where: { id: session.id, status: "generating" },
    data: { generationPhase: "job_blueprint" },
  });
  // analyzeMockInterviewJob 自带降级链，不会抛出"没有蓝图"这种终态。
  const blueprint = await analyzeMockInterviewJob({
    generationId,
    jobTitle: session.interview.jobTitle,
    jobDescription: session.jdTextSnapshot,
  });
  snapshot.jobBlueprint = blueprint;

  const saved = await claimSession(prisma, {
    where: { id: session.id, status: "generating" },
    data: { contextSnapshotJson: JSON.stringify(snapshot) },
  });
  return saved ? blueprint : null;
}

/** 阶段二：简报连同空的工作记忆一起落库，并把房间打开。 */
async function persistBrief(
  session: GenerationSessionRow,
  snapshot: GenerationSnapshot,
  context: MockInterviewContext,
  blueprint: MockInterviewJobBlueprint,
  brief: Awaited<ReturnType<typeof generateInterviewBrief>>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const claimed = await claimSession(tx, {
      where: { id: session.id, status: "generating", generationPhase: "brief" },
      data: {
        contextSnapshotJson: JSON.stringify({
          ...parseGenerationSnapshot(serializeMockInterviewContext(context, { blueprint })),
          generationRequest: snapshot.generationRequest,
        }),
        briefJson: JSON.stringify(brief),
        memoryJson: JSON.stringify(emptyMemory(brief)),
        status: "in_progress",
        generationPhase: null,
        generationErrorCode: null,
        generationError: null,
        questionCount: 0,
        currentQuestionIndex: 0,
      },
    });
    if (!claimed) {
      throw new Error("生成状态已变化，请刷新页面。");
    }
    await tx.interview.update({
      where: { id: session.interviewId },
      data: { status: ACTIVE_MOCK_INTERVIEW_STATUS },
    });
  });
}

/** 把失败写进会话，让房间显示可操作的失败卡片，而不是一直转圈。 */
async function recordGenerationFailure(
  sessionId: string,
  snapshot: GenerationSnapshot,
  error: unknown,
): Promise<void> {
  snapshot.generationErrorContext = isMockInterviewGenerationError(error)
    ? error.context
    : null;

  await claimSession(prisma, {
    where: { id: sessionId, status: "generating" },
    data: {
      status: "generation_failed",
      generationPhase: null,
      generationErrorCode: isMockInterviewGenerationError(error)
        ? error.code
        : "model_unavailable",
      generationError:
        error instanceof Error
          ? error.message.slice(0, 1_000)
          : "面试准备没有完成。生成服务没有返回可用结果。你可以重新分析岗位描述后重试。",
      contextSnapshotJson: JSON.stringify(snapshot),
    },
  });
}

/** 后台备课入口：创建会话后调度，失败重试时再次调度。 */
export async function prepareMockInterview(sessionId: string): Promise<void> {
  const session = await loadGeneratingSession(sessionId);
  if (!session) return;

  const generationId = randomUUID();
  const snapshot = parseGenerationSnapshot(session.contextSnapshotJson);
  const request = readGenerationRequest(snapshot);

  try {
    const context = await buildMockInterviewContext({
      resumeId: session.resumeId!,
      jobTitle: session.interview.jobTitle,
      jobDescription: session.jdTextSnapshot,
      seedQuestionId: request.seedQuestionId,
      seedInsightId: request.seedInsightId,
    });

    const blueprint = await ensureBlueprint(session, snapshot, generationId);
    if (!blueprint) return;

    const advanced = await claimSession(prisma, {
      where: { id: sessionId, status: "generating" },
      data: { generationPhase: "brief" },
    });
    if (!advanced) return;

    // generateInterviewBrief 自带兜底简报，不会抛出"没有简报"这种终态。
    const brief = await generateInterviewBrief({
      generationId,
      jobTitle: session.interview.jobTitle,
      blueprint,
      context,
      pace: session.pace,
      round: request.round,
    });

    await persistBrief(session, snapshot, context, blueprint, brief);
  } catch (error) {
    await recordGenerationFailure(sessionId, snapshot, error);
  }
}

export async function claimMockInterviewGenerationRetry(sessionId: string): Promise<boolean> {
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id: sessionId },
    select: { status: true, contextSnapshotJson: true },
  });
  if (!session || session.status !== "generation_failed") return false;

  const snapshot = parseGenerationSnapshot(session.contextSnapshotJson);
  snapshot.generationErrorContext = null;

  return claimSession(prisma, {
    where: { id: sessionId, status: "generation_failed" },
    data: {
      status: "generating",
      generationPhase: "job_blueprint",
      generationErrorCode: null,
      generationError: null,
      contextSnapshotJson: JSON.stringify(snapshot),
    },
  });
}
