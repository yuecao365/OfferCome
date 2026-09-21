import { AI_TASKS, validateAiTaskConfig, type AiTaskConfig } from "@/lib/ai/config";
import { parseAuxConfig } from "@/lib/evals/models";
import { getAiTaskConfig } from "@/lib/settings/ai";

/**
 * bench 里点名模型的三种写法：main = 设置页的文本模型；provider:model = 借设置页里该服务商已存的 key 换个模型；
 * 其他名字 = 环境变量 BENCH_MODEL_<name> 的完整 JSON 配置。子任务层与端到端层共用。
 */
export async function resolveModel(spec: string): Promise<AiTaskConfig> {
  if (spec === "main") return getAiTaskConfig("text");
  const match = spec.match(/^([a-z]+):(.+)$/);
  if (match) {
    const [, provider, model] = match;
    const stored = await Promise.all(AI_TASKS.map((task) => getAiTaskConfig(task)));
    const donor = stored.find((config) => config.provider === provider && config.apiKey);
    if (!donor) throw new Error(`设置页里没有 ${provider} 的 key，无法用 ${spec}`);
    const validated = validateAiTaskConfig({ ...donor, task: "text", model }, donor.apiKey, true);
    if (!validated.ok) throw new Error(`模型 ${spec} 配置不合法：${validated.message}`);
    return validated.value;
  }
  const config = parseAuxConfig(process.env[`BENCH_MODEL_${spec}`]);
  if (!config) throw new Error(`环境变量 BENCH_MODEL_${spec} 没配或不合法`);
  return config;
}

/** 文件名里不能有冒号（Windows 会把它当 NTFS 备用数据流）。 */
export const safeName = (value: string): string => value.replace(/[^A-Za-z0-9._-]+/g, "-");
