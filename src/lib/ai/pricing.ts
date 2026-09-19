import type { LanguageModelUsage } from "ai";

import type { AiProvider, AiTaskConfig } from "./config";

/**
 * 模型价格表：把 token 用量折算成钱。记账行的 costUsd 与预算里的 maxCostUsd 共用这一份，
 * 免得"这次花了多少"和"还能花多少"用两套口径。
 *
 * 口径：数字是**每百万 token 的美元数**，按服务商公开价目表填。三档分开是因为提示词缓存差一个数量级——
 * 这个项目的系统提示词长、一场面试十几回合复用同一个前缀，命中缓存的那部分占输入的大头。
 * - input：输入里没命中缓存的部分
 * - cachedInput：输入里命中提示词缓存的部分
 * - output：输出，思考型模型的推理 token 也按这一档计费（见 run-agent 的推理余量）
 *
 * 匹配按模型名前缀、长的优先，所以带日期或小版本后缀的型号（gpt-5.4-mini-2026-xx）不用单独列一行。
 * 表里没有的型号返回 null：记账宁可缺这一项，也不要写一个猜出来的数字进库，让后面看数的人当真。
 * 服务商调价就改这里，别在调用点上各写各的。
 */
type TokenPrice = { input: number; cachedInput: number; output: number };

const PRICES: Partial<Record<AiProvider, Record<string, TokenPrice>>> = {
  openai: {
    "gpt-5.6": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-5.4-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
    "gpt-5.4-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
    "gpt-5.4": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-5.2": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
    "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
    "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
  },
  // V4 两档沿用 V3 对应档位的价（pro 按 reasoner、flash 按 chat）；档位变了同样改这里。
  deepseek: {
    "deepseek-v4-pro": { input: 0.55, cachedInput: 0.14, output: 2.19 },
    "deepseek-v4-flash": { input: 0.27, cachedInput: 0.07, output: 1.1 },
    "deepseek-reasoner": { input: 0.55, cachedInput: 0.14, output: 2.19 },
    "deepseek-chat": { input: 0.27, cachedInput: 0.07, output: 1.1 },
  },
};

export type PricedModel = Pick<AiTaskConfig, "provider" | "model">;

/** 最长前缀优先：gpt-4.1-mini 不能被 gpt-4.1 抢走。 */
function priceOf(config: PricedModel): TokenPrice | null {
  const table = PRICES[config.provider];
  if (!table) return null;
  const key = Object.keys(table)
    .filter((prefix) => config.model.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];
  return key ? table[key] : null;
}

/**
 * 这次用量值多少钱（美元）；模型不在价格表里、或者根本没有用量就返回 null。
 * 小数留 6 位：单步常在 1e-5 量级，再细的位数只是浮点噪声，进了记账行反而难读。
 */
export function costOf(config: PricedModel, usage: LanguageModelUsage | undefined): number | null {
  const price = priceOf(config);
  if (!price || !usage) return null;
  const cached = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  // inputTokens 是输入总量（含命中缓存的部分）；服务商没报明细时按"总量减命中数"当作全价部分。
  const fresh = usage.inputTokenDetails?.noCacheTokens ?? Math.max((usage.inputTokens ?? 0) - cached, 0);
  const usd = (fresh * price.input + cached * price.cachedInput + (usage.outputTokens ?? 0) * price.output) / 1_000_000;
  return Number(usd.toFixed(6));
}
