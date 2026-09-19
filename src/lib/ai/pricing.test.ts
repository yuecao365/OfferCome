import assert from "node:assert/strict";
import test from "node:test";

import type { LanguageModelUsage } from "ai";

import { costOf } from "./pricing";

/** 价格表：命中就折算成美元，缓存命中的输入按更便宜的一档，表里没有的型号返回 null（不猜）。 */

const usage = (input: number, cacheRead: number, output: number): LanguageModelUsage => ({
  inputTokens: input,
  inputTokenDetails: { noCacheTokens: input - cacheRead, cacheReadTokens: cacheRead, cacheWriteTokens: undefined },
  outputTokens: output,
  outputTokenDetails: { textTokens: output, reasoningTokens: undefined },
  totalTokens: input + output,
});

test("命中价格表：按未命中输入 / 缓存命中输入 / 输出三档折算；带版本后缀的型号走最长前缀", () => {
  // gpt-4.1-mini：输入 0.4 / 缓存 0.1 / 输出 1.6 美元每百万 token。
  const cost = costOf({ provider: "openai", model: "gpt-4.1-mini" }, usage(1_000_000, 0, 1_000_000));
  assert.equal(cost, 2);
  // 前缀匹配长的优先：gpt-4.1-mini 不能被 gpt-4.1 抢走。
  assert.equal(costOf({ provider: "openai", model: "gpt-4.1-mini-2026-03-01" }, usage(1_000_000, 0, 0)), 0.4);
  assert.equal(costOf({ provider: "openai", model: "gpt-4.1" }, usage(1_000_000, 0, 0)), 2);
  assert.equal(costOf({ provider: "deepseek", model: "deepseek-v4-flash" }, usage(1_000_000, 0, 1_000_000)), 1.37);
});

test("缓存命中的输入比普通输入便宜：同样的 token 数，命中缓存后这次调用更便宜", () => {
  const model = { provider: "deepseek", model: "deepseek-v4-flash" } as const;
  const full = costOf(model, usage(1_000_000, 0, 0));
  const cached = costOf(model, usage(1_000_000, 1_000_000, 0));
  assert.equal(full, 0.27);
  assert.equal(cached, 0.07);
  assert.equal(costOf(model, usage(1_000_000, 500_000, 0)), 0.17, "一半命中就是两档各算一半");
  // 服务商没报明细时按"输入总量全价"兜底，不因为缺字段就算不出钱。
  assert.equal(costOf(model, { ...usage(1_000_000, 0, 0), inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined } }), 0.27);
});

test("表里没有的型号与没有用量都返回 null，不猜一个数字进记账行", () => {
  assert.equal(costOf({ provider: "openai", model: "gpt-9-unreleased" }, usage(1_000, 0, 1_000)), null);
  assert.equal(costOf({ provider: "local", model: "qwen3-32b" }, usage(1_000, 0, 1_000)), null);
  assert.equal(costOf({ provider: "openai", model: "gpt-4.1-mini" }, undefined), null);
});
