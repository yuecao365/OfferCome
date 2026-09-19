import process from "node:process";

import { generateText, Output, type LanguageModel, type LanguageModelUsage } from "ai";
import { z } from "zod";

import { PROVIDER_LABELS } from "../src/lib/ai/config";
import { costOf } from "../src/lib/ai/pricing";
import { createTextModel } from "../src/lib/ai/providers";
import { prisma } from "../src/lib/db";
import { getAiTaskConfig, isAiTaskConfigured } from "../src/lib/settings/ai";

/**
 * 服务商契约探针：对当前配置的文本模型跑四次最小调用，把 docs/provider-contracts.md 那张表的六个维度当场测一遍。
 *   npm run probe
 *
 * 每个维度输出一行，措辞与表里的表头一一对应：换服务商 / 换模型时先跑一次，再照结果改表，不要凭印象填。
 * 探针故意不带 `lowReasoningOptions`——要看的就是服务商的默认行为；线上调用一律压低或关掉思考（providers.ts）。
 * 花销：四次调用，末尾按价格表报一下（模型不在表里就不报）。
 */

const TIMEOUT_MS = 60_000;

/** 表头与这里的维度名共用一份措辞，输出才对得上表。 */
const DIMENSIONS = {
  schema: "结构化输出的 schema 随请求下发",
  reasoning: "思考 token 算在输出上限里",
  toolInText: "JSON 模式下把工具调用写成正文",
  blankTurn: "历史里 assistant 是裸文本时整回合吐空白",
  cacheField: "缓存命中 token 读哪个字段",
  toolChannel: "工具调用走协议通道",
} as const;

type Finding = { dimension: string; verdict: string; detail: string };

const usages: LanguageModelUsage[] = [];
const signal = () => AbortSignal.timeout(TIMEOUT_MS);

function record<T extends { usage: LanguageModelUsage }>(result: T): T {
  usages.push(result.usage);
  return result;
}

function preview(text: string, length = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length)}…` : flat || "（空）";
}

/**
 * 模型这次自己挑的键名。salvageJson 那套按 schema 校验，这里要看的恰好是"键名对不上"的输出，所以单独解析一次。
 */
function jsonKeys(text: string): string[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" ? Object.keys(parsed) : null;
  } catch {
    return null;
  }
}

/** 工具调用被写进正文时的样子（DeepSeek 的 `<｜DSML｜ calls>`、其它口的 tool_call / function_call 文本）。 */
const TOOL_CALL_IN_TEXT = /DSML|tool_call|function_call|<\s*tool|<\s*function/i;

/** 探针一：纯文本。用量里报了推理 token，就说明思考算在输出上限里（线上因此统一加推理余量）。 */
async function probePlainText(model: LanguageModel): Promise<Finding[]> {
  const result = record(
    await generateText({ model, maxOutputTokens: 200, abortSignal: signal(), prompt: "用一句话说明 HTTP 的 ETag 是做什么的。" }),
  );
  const reasoning = result.usage.outputTokenDetails?.reasoningTokens ?? 0;
  const cacheRead = result.usage.inputTokenDetails?.cacheReadTokens;
  return [
    {
      dimension: DIMENSIONS.reasoning,
      verdict: reasoning > 0 ? "算" : "这次没报推理 token",
      detail: `输出 ${result.usage.outputTokens ?? "-"}（推理 ${reasoning}）、正文 ${result.text.trim().length} 字、finishReason=${result.finishReason}`,
    },
    {
      dimension: DIMENSIONS.cacheField,
      verdict: cacheRead === undefined ? "没报（inputTokenDetails.cacheReadTokens 为空）" : "usage.inputTokenDetails.cacheReadTokens",
      detail: `这次 ${cacheRead ?? "-"}；单次调用不保证命中，看记账行的 cachedTokens 更准`,
    },
  ];
}

/** 探针二：带 schema 的结构化输出，但故意不把 schema 写进提示词——键名对得上就说明 schema 随请求下发了。 */
async function probeSchema(model: LanguageModel): Promise<Finding[]> {
  const result = record(
    await generateText({
      model,
      output: Output.object({ schema: z.object({ mainPoint: z.string(), sideNote: z.string() }) }),
      maxOutputTokens: 400,
      abortSignal: signal(),
      system: "只输出一个 JSON 对象。",
      prompt: "一句话介绍 TCP 三次握手，再给一句补充说明。",
    }),
  );
  const keys = jsonKeys(result.text);
  const matched = keys !== null && ["mainPoint", "sideNote"].every((key) => keys.includes(key));
  return [
    {
      dimension: DIMENSIONS.schema,
      verdict: matched ? "下发" : "不下发（schema 必须写进提示词）",
      detail: keys === null ? `正文不是 JSON：${preview(result.text)}` : `模型挑的键：${keys.join(", ")}`,
    },
  ];
}

/** 探针三：JSON 模式下给一个工具。看调用走不走协议通道，以及正文里有没有混进工具调用文本。 */
async function probeTool(model: LanguageModel): Promise<Finding[]> {
  const result = record(
    await generateText({
      model,
      output: Output.object({ schema: z.object({ reply: z.string() }) }),
      tools: { lookup_resume: { description: "按关键词查候选人简历原文，返回命中的句子。", inputSchema: z.object({ keyword: z.string() }) } },
      maxOutputTokens: 400,
      abortSignal: signal(),
      system: "你在面试候选人。要提简历里的经历，必须先用 lookup_resume 查原文，不要凭印象说。最终答案是一个 JSON 对象，只有 reply 一个键。",
      prompt: "候选人简历里写了「Kafka 削峰」，先查原文，再就这段经历问一个问题。",
    }),
  );
  const calls = result.toolCalls ?? [];
  const inText = TOOL_CALL_IN_TEXT.exec(result.text);
  return [
    {
      dimension: DIMENSIONS.toolChannel,
      verdict: calls.length > 0 ? "走" : "这次没调工具（看不出）",
      detail: calls.length > 0 ? `toolCalls：${calls.map((call) => call.toolName).join(", ")}` : `finishReason=${result.finishReason}、正文：${preview(result.text)}`,
    },
    {
      dimension: DIMENSIONS.toolInText,
      verdict: inText ? `会（正文里出现 ${inText[0]}）` : "这次没有",
      detail: `正文：${preview(result.text)}`,
    },
  ];
}

/** 探针四：历史里放一条裸文本 assistant 消息（不是模型上一轮的 JSON 形状），看这一回合的正文是不是只剩空白。 */
async function probeBareHistory(model: LanguageModel): Promise<Finding[]> {
  const result = record(
    await generateText({
      model,
      output: Output.object({ schema: z.object({ reply: z.string() }) }),
      maxOutputTokens: 400,
      abortSignal: signal(),
      system: '你是面试官。每次只输出一个 JSON 对象：{"reply": "你要对候选人说的话"}。',
      messages: [
        { role: "user", content: "（面试开始）" },
        { role: "assistant", content: "你好，先简单介绍一下你自己吧。" },
        { role: "user", content: "我叫小王，上一段实习做的是订单系统削峰。" },
      ],
    }),
  );
  const blank = result.text.trim().length === 0;
  return [
    {
      dimension: DIMENSIONS.blankTurn,
      verdict: blank ? "会（正文只有空白）" : "不会",
      detail: `输出 ${result.usage.outputTokens ?? "-"} token、正文：${preview(result.text)}`,
    },
  ];
}

const PROBES: { name: string; dimensions: string[]; run: (model: LanguageModel) => Promise<Finding[]> }[] = [
  { name: "纯文本输出", dimensions: [DIMENSIONS.reasoning, DIMENSIONS.cacheField], run: probePlainText },
  { name: "带 schema 的结构化输出", dimensions: [DIMENSIONS.schema], run: probeSchema },
  { name: "JSON 模式 + 一个工具", dimensions: [DIMENSIONS.toolChannel, DIMENSIONS.toolInText], run: probeTool },
  { name: "历史里的裸文本 assistant", dimensions: [DIMENSIONS.blankTurn], run: probeBareHistory },
];

async function main(): Promise<void> {
  const config = await getAiTaskConfig("text");
  if (!isAiTaskConfigured(config)) {
    console.log(`还没有配置文本模型（当前 ${PROVIDER_LABELS[config.provider]} · ${config.model}，缺 API Key）。到设置页填好再跑 npm run probe。`);
    return;
  }

  console.log(`探针：${PROVIDER_LABELS[config.provider]} · ${config.model}（${PROBES.length} 次调用）\n`);
  const model = createTextModel(config);
  for (const probe of PROBES) {
    // 一个探针失败不该带走其它维度：把它覆盖的几行记成"未测"继续。
    const findings = await probe.run(model).catch((error: unknown) =>
      probe.dimensions.map((dimension) => ({ dimension, verdict: "未测", detail: `探针「${probe.name}」失败：${error instanceof Error ? error.message : String(error)}` })),
    );
    for (const item of findings) console.log(`${item.dimension}：${item.verdict}  — ${item.detail}`);
  }

  const spent = usages.reduce((sum, usage) => sum + (costOf(config, usage) ?? 0), 0);
  const priced = usages.some((usage) => costOf(config, usage) !== null);
  console.log(`\n${usages.length} 次调用${priced ? `，约 ${spent.toFixed(4)} 美元` : "（这个模型不在价格表里，算不出花销）"}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
