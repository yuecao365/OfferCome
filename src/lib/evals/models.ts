import type { FlexibleSchema } from "ai";

import { validateAiTaskConfig, type AiTaskConfig } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import { getAiTaskConfig } from "@/lib/settings/ai";

/**
 * 评测用的辅助模型（aux）：人设与变体生成、候选人模拟器、裁判都用它。
 * 读环境变量 EVAL_AUX_AI_CONFIG（JSON，形状同设置页的文本模型配置），
 * 没配就回落到主配置并在产物里标 auxSameFamily，报告必须带这个标记。
 */

export const EVAL_AUX_ENV = "EVAL_AUX_AI_CONFIG";

export type EvalModels = {
  main: AiTaskConfig;
  aux: AiTaskConfig;
  /** 裁判 / 模拟器与被测系统同一家模型：结论的可信度要打折。 */
  auxSameFamily: boolean;
};

/** 同一家模型的判定：provider 相同；兼容端点按服务地址主机名比。 */
export function modelFamily(config: AiTaskConfig): string {
  if (config.provider === "compatible" || config.provider === "local") {
    try {
      return new URL(config.baseURL ?? "").host || config.provider;
    } catch {
      return config.provider;
    }
  }
  return config.provider;
}

export function parseAuxConfig(raw: string | undefined): AiTaskConfig | null {
  if (!raw?.trim()) return null;
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error(`${EVAL_AUX_ENV} 不是合法 JSON。`);
  }
  const validated = validateAiTaskConfig({ task: "text", ...(input as object) }, null, true);
  if (!validated.ok) throw new Error(`${EVAL_AUX_ENV} 无效：${validated.message}`);
  return validated.value;
}

export async function loadEvalModels(env = process.env): Promise<EvalModels> {
  const main = await getAiTaskConfig("text");
  if (main.requiresApiKey && !main.apiKey) throw new Error("主模型没有配置 API Key，先在设置页配好。");
  const aux = parseAuxConfig(env[EVAL_AUX_ENV]) ?? main;
  const auxSameFamily = modelFamily(aux) === modelFamily(main);
  if (auxSameFamily) {
    console.warn(`[eval] 没有配置 ${EVAL_AUX_ENV} 或与主模型同家族；裁判与模拟器将与被测系统共享盲点，产物会标 auxSameFamily。`);
  }
  return { main, aux, auxSameFamily };
}

/** 一次结构化调用；评测里的 agent 名以 eval_ 开头，与生产 agent 分开。 */
export async function runAux<T>(
  aux: AiTaskConfig,
  input: {
    agent: `eval_${string}`;
    promptVersion: string;
    system: string;
    payload: unknown;
    schema: FlexibleSchema<T>;
    untrustedInputs?: string;
    maxOutputTokens?: number;
    timeoutMs?: number;
    runId?: string;
  },
): Promise<T> {
  const { output } = await runAgent({
    agent: input.agent,
    runId: input.runId,
    config: aux,
    feature: "评测",
    promptVersion: input.promptVersion,
    system: input.system,
    untrustedInputs: input.untrustedInputs,
    payload: input.payload,
    schema: input.schema,
    maxOutputTokens: input.maxOutputTokens ?? 2_000,
    timeoutMs: input.timeoutMs ?? 60_000,
  });
  return output;
}
