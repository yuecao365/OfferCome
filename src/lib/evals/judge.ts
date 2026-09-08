import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";

import { runAux } from "./models";
import { ratio, type Ratio } from "./report";

/**
 * 窄问题裁判：只答是非题，且每次运行先在脚本构造的正负样本上自证。
 *   related  追问 Q 是否顺着回答 A 往下问
 *   pushback 面试官这句话是否反驳了断言 Z
 *   topic    简报领域 / 阶梯是否属于话题 T
 * 校准准确率低于 TRUST_THRESHOLD 的裁判当次不可信，相关指标不进结论。
 */

export const JUDGE_PROMPT_VERSION = "judge-v1";
export const TRUST_THRESHOLD = 0.9;

export type JudgeKind = "related" | "pushback" | "topic";

export type JudgeItem = { a: string; b: string };

const QUESTIONS: Record<JudgeKind, { system: string; fields: [string, string] }> = {
  related: {
    system:
      "你是评测裁判。给你候选人的一条回答（answer）和面试官接着提出的追问（followUp）。只判断一件事：这条追问是否顺着这条回答的内容往下问（针对回答里提到的做法、细节、数字或说法继续追）。与回答无关、只是换了个话题的，判 false。不评价问题好坏。",
    fields: ["answer", "followUp"],
  },
  pushback: {
    system:
      "你是评测裁判。给你候选人说过的一句断言（claim）和面试官接下来说的话（reply）。只判断一件事：面试官的话是否对这句断言提出了质疑、纠正或反驳（指出它不对、不准确、需要核实，或直接给出相反说法）。只是顺着往下问、没有表达怀疑的，判 false。不评价断言本身对错。",
    fields: ["claim", "reply"],
  },
  topic: {
    system:
      "你是评测裁判。给你一个面试话题（topic）和一段面试考察内容（content：领域描述或追问阶梯）。只判断一件事：这段考察内容是否属于这个话题（考的是同一件事或它的直接组成部分）。相邻但不同的话题判 false。",
    fields: ["topic", "content"],
  },
};

const verdictSchema = z.object({ verdict: z.boolean(), reason: z.string().max(200) });

export async function judgeOne(aux: AiTaskConfig, kind: JudgeKind, item: JudgeItem): Promise<boolean | null> {
  const [fieldA, fieldB] = QUESTIONS[kind].fields;
  try {
    const output = await runAux(aux, {
      agent: `eval_judge_${kind}`,
      promptVersion: JUDGE_PROMPT_VERSION,
      system: QUESTIONS[kind].system,
      untrustedInputs: `${fieldA} 与 ${fieldB}`,
      payload: { [fieldA]: item.a, [fieldB]: item.b },
      schema: verdictSchema,
      maxOutputTokens: 300,
      timeoutMs: 30_000,
    });
    return output.verdict;
  } catch (error) {
    console.warn(`[eval] 裁判 ${kind} 调用失败：`, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function judgeMany(aux: AiTaskConfig, kind: JudgeKind, items: JudgeItem[], concurrency = 4): Promise<Array<boolean | null>> {
  const results: Array<boolean | null> = new Array(items.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await judgeOne(aux, kind, items[index]);
      }
    }),
  );
  return results;
}

export type JudgeCalibration = {
  kind: JudgeKind;
  accuracy: Ratio;
  positives: Ratio;
  negatives: Ratio;
  trusted: boolean;
};

/** 在合成正负样本上算准确率；正样本由 aux 构造、负样本由打乱配对构造。 */
export function calibrationFromVerdicts(
  kind: JudgeKind,
  positive: Array<boolean | null>,
  negative: Array<boolean | null>,
): JudgeCalibration {
  const posHits = positive.filter((verdict) => verdict === true).length;
  const negHits = negative.filter((verdict) => verdict === false).length;
  const posN = positive.filter((verdict) => verdict !== null).length;
  const negN = negative.filter((verdict) => verdict !== null).length;
  const accuracy = ratio(posHits + negHits, posN + negN);
  return {
    kind,
    accuracy,
    positives: ratio(posHits, posN),
    negatives: ratio(negHits, negN),
    trusted: accuracy.value !== null && accuracy.denominator >= 10 && accuracy.value >= TRUST_THRESHOLD,
  };
}

/** 打乱配对：把第 i 条的 b 配给第 j ≠ i 条的 a。样本少于 2 条时没有负样本。 */
export function shuffledPairs(items: JudgeItem[]): JudgeItem[] {
  if (items.length < 2) return [];
  return items.map((item, index) => ({ a: item.a, b: items[(index + 1) % items.length].b }));
}

const syntheticSchema = z.object({ text: z.string().min(1).max(400) });

/** 构造正样本：related 给回答写一条顺着它的追问；pushback 给断言写一句反驳。 */
export async function synthesizePositive(aux: AiTaskConfig, kind: Exclude<JudgeKind, "topic">, source: string): Promise<string | null> {
  const system =
    kind === "related"
      ? "给你候选人的一条面试回答。写一条面试官会接着问的追问：必须针对这条回答里提到的某个具体做法、细节或数字往下追，一句话，不超过 80 字。"
      : "给你候选人说的一句断言。以面试官口吻写一句话，明确指出这句断言不对或需要核实，并说出理由，不超过 80 字。";
  try {
    const output = await runAux(aux, {
      agent: `eval_synth_${kind}`,
      promptVersion: JUDGE_PROMPT_VERSION,
      system,
      untrustedInputs: "候选人的话",
      payload: { text: source },
      schema: syntheticSchema,
      maxOutputTokens: 300,
      timeoutMs: 30_000,
    });
    return output.text;
  } catch (error) {
    console.warn(`[eval] 构造 ${kind} 正样本失败：`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * related 与 pushback 的校准：
 *   related  正样本 = (回答, aux 写的追问)；负样本 = 打乱配对
 *   pushback 正样本 = (断言, aux 写的反驳)；负样本 = (断言, 没有出现断言的回合里面试官的话)
 */
export async function calibrateJudge(
  aux: AiTaskConfig,
  kind: Exclude<JudgeKind, "topic">,
  sources: string[],
  neutralReplies: string[] = [],
): Promise<JudgeCalibration> {
  const positives: JudgeItem[] = [];
  for (const source of sources) {
    const text = await synthesizePositive(aux, kind, source);
    if (text) positives.push({ a: source, b: text });
  }
  const negatives =
    kind === "related"
      ? shuffledPairs(positives)
      : positives.flatMap((item, index) => (neutralReplies[index % Math.max(1, neutralReplies.length)] ? [{ a: item.a, b: neutralReplies[index % neutralReplies.length] }] : []));
  const [positiveVerdicts, negativeVerdicts] = await Promise.all([judgeMany(aux, kind, positives), judgeMany(aux, kind, negatives)]);
  return calibrationFromVerdicts(kind, positiveVerdicts, negativeVerdicts);
}
