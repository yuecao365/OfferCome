import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";
import { normalizedText } from "@/lib/text/similarity";

import { runAux } from "./models";
import { personaSchema, scorerCaseSchema, type JdFixture, type Persona, type ScorerCase } from "./fixtures";

/**
 * 用 aux 模型生成后冻结的评测数据：人设、评分器蜕变用例。
 * 生成一次进仓库，之后每次评测读同一份，结果才可比。
 */

export const GENERATE_PROMPT_VERSION = "generate-v1";

const personaOutputSchema = z.object({
  style: z.string().min(1).max(60),
  strong: z.array(z.string().min(1).max(60)).min(2).max(3),
  weakTopic: z.string().min(1).max(60),
  wrongClaim: z.string().min(8).max(120),
  whyWrong: z.string().min(1).max(300),
  /** 逐字取自简历的一条带数字的成果。 */
  unsupportable: z.string().min(4).max(120),
});

function verbatim(haystack: string, needle: string): boolean {
  return normalizedText(haystack).includes(normalizedText(needle));
}

export async function generatePersona(
  aux: AiTaskConfig,
  input: { id: string; jd: JdFixture; resumeId: string; resumeText: string; offtopic: boolean; attempts?: number },
): Promise<Persona> {
  const attempts = input.attempts ?? 3;
  let lastError = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const output = await runAux(aux, {
      agent: "eval_generate_persona",
      promptVersion: GENERATE_PROMPT_VERSION,
      system: `根据岗位描述与简历，为一位模拟面试的候选人设计人设，供评测使用。要求：
- strong：简历里能支撑、且与岗位相关的 2–3 个擅长话题。
- weakTopic：岗位会考、简历里有沾边经历、但候选人其实不懂的一个话题。
- wrongClaim：候选人谈到 weakTopic 时会说出的一句明确错误的技术断言。必须是陈述句、放进口语回答里自然、8 到 60 字、错误明确到有经验的面试官一眼能看出（不是"有争议"或"过时"）。不要在句子里带引号。
- whyWrong：这句为什么错，一两句。
- unsupportable：从简历原文里逐字抄一条带数字的成果（不改一个字、不加标点），候选人在人设里说不出它的细节。
- style：一句话的说话风格。${lastError ? `\n上一次的问题：${lastError}` : ""}`,
      untrustedInputs: "岗位描述与简历",
      payload: { jobTitle: input.jd.title, jobDescription: input.jd.jobDescription, resume: input.resumeText },
      schema: personaOutputSchema,
      maxOutputTokens: 1_000,
    });
    if (!verbatim(input.resumeText, output.unsupportable)) {
      lastError = `unsupportable 不是简历原文：「${output.unsupportable}」`;
      continue;
    }
    if (/[「」“”"]/.test(output.wrongClaim)) {
      lastError = "wrongClaim 里不要带引号";
      continue;
    }
    return personaSchema.parse({
      id: input.id,
      jd: input.jd.id,
      resume: input.resumeId,
      style: output.style,
      strong: output.strong,
      weak: { topic: output.weakTopic, wrongClaim: output.wrongClaim, whyWrong: output.whyWrong },
      unsupportable: output.unsupportable,
      offtopic: input.offtopic,
    });
  }
  throw new Error(`人设 ${input.id} 生成失败：${lastError}`);
}

const scorerOutputSchema = z.object({
  base: z.string().min(80).max(2_000),
  wrongClaim: z.string().min(8).max(120),
  whyWrong: z.string().min(1).max(300),
  /** base 里被删掉的那段机制（逐字）。 */
  droppedMechanism: z.string().min(10).max(600),
  drop: z.string().min(40).max(2_000),
  fluff: z.string().min(80).max(2_000),
  para: z.string().min(80).max(2_000),
});

export type ScorerCaseSource = {
  id: string;
  questionId: string;
  jobTitle: string;
  jobDescription: string;
  round: string | null;
  question: string;
  rubric: ScorerCase["rubric"];
  expectedSignals: string[];
  thread: ScorerCase["thread"];
};

/** offtopic 变体由调用方从另一道用例的 base 填入；这里生成其余五个。 */
export async function generateScorerCase(
  aux: AiTaskConfig,
  input: { source: ScorerCaseSource; resumeText: string; attempts?: number },
): Promise<Omit<ScorerCase, "answers"> & { answers: Omit<ScorerCase["answers"], "offtopic"> }> {
  const attempts = input.attempts ?? 3;
  let lastError = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const output = await runAux(aux, {
      agent: "eval_generate_scorer_case",
      promptVersion: GENERATE_PROMPT_VERSION,
      system: `为评分器评测构造一组回答。题目是 question（切入问题加追问），候选人是 resume 里的人。要求：
- base：一个主干正确、细节一般的回答，口语化、第一人称、150 到 400 字，回应题目里的每一层追问，可引用简历里的项目与数字。
- wrongClaim：一句明确错误的技术断言（陈述句、8 到 60 字、不带引号、有经验的面试官一眼能看出错），错误要与题目相关。
- whyWrong：为什么错。
- droppedMechanism：base 里对回答这道题最关键的一段机制描述，逐字抄出来。
- drop：把 droppedMechanism 从 base 里删掉后的回答（其余不改，可做最小的语句衔接）。
- fluff：与 base 长度相近、只有态度与套话、不含任何具体机制或数字的回答。
- para：base 的同义改写，意思与信息量完全一致，措辞和句序不同。
不要在任何回答里带引号。${lastError ? `\n上一次的问题：${lastError}` : ""}`,
      untrustedInputs: "题目、岗位描述与简历",
      payload: {
        jobTitle: input.source.jobTitle,
        question: input.source.question,
        resume: input.resumeText.slice(0, 6_000),
      },
      schema: scorerOutputSchema,
      maxOutputTokens: 4_000,
      timeoutMs: 120_000,
    });
    if (verbatim(output.base, output.wrongClaim)) {
      lastError = "base 里不能含 wrongClaim";
      continue;
    }
    if (!verbatim(output.base, output.droppedMechanism)) {
      lastError = "droppedMechanism 必须逐字来自 base";
      continue;
    }
    if (verbatim(output.drop, output.droppedMechanism)) {
      lastError = "drop 里仍含被删的机制";
      continue;
    }
    const err = insertClaim(output.base, output.wrongClaim);
    return {
      ...input.source,
      answers: { base: output.base, err, drop: output.drop, fluff: output.fluff, para: output.para },
      truth: { wrongClaim: output.wrongClaim, whyWrong: output.whyWrong, droppedMechanism: output.droppedMechanism },
    };
  }
  throw new Error(`评分器用例 ${input.source.id} 生成失败：${lastError}`);
}

/** 把错句插进基准回答的中段（第二个句号之后），由代码插入以保证逐字存在。 */
export function insertClaim(base: string, claim: string): string {
  const sentence = /[。！？]/.test(claim.slice(-1)) ? claim : `${claim}。`;
  const cuts = [...base.matchAll(/[。！？]\s*/g)].map((match) => match.index! + match[0].length);
  const at = cuts.length >= 2 ? cuts[Math.floor((cuts.length - 1) / 2)] : base.length;
  return `${base.slice(0, at)}${sentence}${base.slice(at)}`;
}

export function finalizeScorerCase(partial: Awaited<ReturnType<typeof generateScorerCase>>, offtopic: string): ScorerCase {
  return scorerCaseSchema.parse({ ...partial, answers: { ...partial.answers, offtopic } });
}
