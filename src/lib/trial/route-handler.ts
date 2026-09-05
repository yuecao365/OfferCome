import "server-only";

import { NextResponse } from "next/server";

import { isAgentRunError } from "@/lib/ai/run-agent";
import { isMockInterviewGenerationError } from "@/lib/mock-interviews/errors";
import { isTrialMode } from "@/lib/runtime-mode";

import { readTrialAiConfig, runWithTrialAiConfig } from "./ai-config";

/**
 * 体验版 API 的统一骨架。
 *
 * 每个体验接口都要做同样三件事：确认处于体验模式、从请求头取出访客自带的
 * AI 配置、把处理过程绑进该配置的异步上下文（这样 agent 内部的
 * getAiTaskConfig 能拿到）。集中在这里，路由本身只剩"读入参 → 调领域函数"。
 *
 * 服务端全程无状态：请求进来带着全部需要的数据，算完返回，什么都不留。
 */

export type TrialHandler<T> = (body: T) => Promise<unknown>;

function errorResponse(error: unknown) {
  if (isAgentRunError(error) && error.kind === "not_configured") {
    return NextResponse.json(
      { error: "请先连接你自己的模型服务。" },
      { status: 401 },
    );
  }

  const generationError = isMockInterviewGenerationError(error) ? error : null;
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "请求处理失败。",
      code: generationError?.code,
      retryable: generationError?.retryable ?? false,
    },
    { status: generationError ? 502 : 400 },
  );
}

async function respond(run: () => Promise<unknown>): Promise<Response> {
  try {
    return NextResponse.json(await run());
  } catch (error) {
    console.warn(
      "[trial] request failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return errorResponse(error);
  }
}

/** 需要访客 AI Key 的接口。 */
export function withTrialAi<T>(handler: TrialHandler<T>) {
  return async (request: Request): Promise<Response> => {
    if (!isTrialMode()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const config = readTrialAiConfig(request);
    if (!config) {
      return NextResponse.json(
        { error: "请先连接你自己的模型服务。" },
        { status: 401 },
      );
    }

    let body: T;
    try {
      body = (await request.json()) as T;
    } catch {
      return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
    }

    return respond(() => runWithTrialAiConfig(config, () => handler(body)));
  };
}

/**
 * 不强制 AI Key 的接口（例如简历解析）：访客带了 Key 就绑进上下文，
 * 让处理过程里的 agent 能用上；没带也照常走不依赖模型的路径。
 */
export function withTrial(
  handler: (request: Request) => Promise<unknown>,
) {
  return async (request: Request): Promise<Response> => {
    if (!isTrialMode()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const config = readTrialAiConfig(request);
    return respond(() =>
      config
        ? runWithTrialAiConfig(config, () => handler(request))
        : handler(request),
    );
  };
}
