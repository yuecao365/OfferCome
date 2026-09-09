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

const controlPersonaSchema = z.object({
  style: z.string().min(1).max(60),
  strong: z.array(z.string().min(1).max(60)).min(3).max(4),
});

/** 对照人设：没有弱项与错句，全程答得好，测误报。 */
async function generateControlPersona(aux: AiTaskConfig, input: { id: string; jd: JdFixture; resumeId: string; resumeText: string }): Promise<Persona> {
  const output = await runAux(aux, {
    agent: "eval_generate_persona",
    promptVersion: GENERATE_PROMPT_VERSION,
    system: "根据岗位描述与简历，为一位准备充分、基础扎实的候选人设计人设：strong 列出简历里能支撑、且与岗位相关的 3–4 个擅长话题；style 一句话的说话风格。这位候选人没有明显短板。",
    untrustedInputs: "岗位描述与简历",
    payload: { jobTitle: input.jd.title, jobDescription: input.jd.jobDescription, resume: input.resumeText },
    schema: controlPersonaSchema,
    maxOutputTokens: 600,
  });
  return personaSchema.parse({
    id: input.id,
    jd: input.jd.id,
    resume: input.resumeId,
    style: output.style,
    strong: output.strong,
    weak: null,
    unsupportable: null,
    offtopic: false,
    control: true,
  });
}

export async function generatePersona(
  aux: AiTaskConfig,
  input: { id: string; jd: JdFixture; resumeId: string; resumeText: string; offtopic: boolean; control?: boolean; attempts?: number },
): Promise<Persona> {
  if (input.control) return generateControlPersona(aux, input);
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

/* ------------------------------------------------------------ 面经话题表 */

const fileTopicsSchema = z.object({
  topics: z
    .array(
      z.object({
        name: z.string().min(1).max(30),
        description: z.string().min(1).max(80),
        /** 属于这个话题的题目下标（从 0 起）。 */
        questionIndexes: z.array(z.number().int().min(0)).min(1).max(40),
      }),
    )
    .max(25),
});

export type FileTopic = { file: string; name: string; description: string; example: string };

/** 一篇面经 → 它考到的话题（只看技术与场景题，跳过 HR、算法手撕与叙述）。 */
export async function extractFileTopics(aux: AiTaskConfig, input: { role: string; file: string; questions: string[] }): Promise<FileTopic[]> {
  const output = await runAux(aux, {
    agent: "eval_extract_topics",
    promptVersion: GENERATE_PROMPT_VERSION,
    system: `下面是一篇${input.role}岗位面经里按顺序抽出的题目列表（questions，带下标），其中混有叙述、HR 问题、算法手撕题和抽取噪声。把技术与场景题归成话题：
- 每个话题是面试官在考察的一件事，例如"Redis 分布式锁""K8s 调度与 Pod 生命周期""Agent 上下文压缩"，name 不超过 20 字，description 一句话说这个话题通常问什么。
- questionIndexes 只放确实属于这个话题的题目下标；叙述、HR 问题、纯算法手撕题、"介绍项目 / 实习"这类不归话题。
- 同一话题只出现一次；粒度以"一场面试会围绕它追问两三层"为准，不要细到单个知识点，也不要粗到"数据库"。`,
    untrustedInputs: "题目列表",
    payload: { role: input.role, questions: input.questions.map((text, index) => ({ index, text })) },
    schema: fileTopicsSchema,
    maxOutputTokens: 2_500,
  });
  return output.topics.flatMap((topic) => {
    const example = topic.questionIndexes.map((index) => input.questions[index]).find(Boolean);
    return example ? [{ file: input.file, name: topic.name, description: topic.description, example }] : [];
  });
}

const mergedTopicsSchema = z.object({
  topics: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/).max(40),
        name: z.string().min(1).max(40),
        description: z.string().min(1).max(200),
        /** 归入这个话题的原始条目下标。 */
        members: z.array(z.number().int().min(0)).min(1).max(200),
      }),
    )
    .min(1)
    .max(40),
});

export type MergedTopic = { id: string; name: string; description: string; count: number; examples: string[] };

/** 一个岗位所有面经的话题 → 去重合并成 ≤ 40 个规范话题；count 是提到它的面经篇数。 */
export async function mergeRoleTopics(aux: AiTaskConfig, input: { role: string; items: FileTopic[] }): Promise<MergedTopic[]> {
  const output = await runAux(aux, {
    agent: "eval_merge_topics",
    promptVersion: GENERATE_PROMPT_VERSION,
    system: `下面是从多篇${input.role}岗位面经里各自抽出的话题条目（items，带下标、来源文件与一道原题）。把同一件事的条目合并成规范话题：
- 输出不超过 40 个话题，按被提到的篇数从多到少排；每个话题 id 用小写字母、数字和连字符，name 不超过 20 字，description 一句话。
- members 列出归入该话题的全部条目下标；一个条目只归一个话题；明显不属于这个岗位技术考察的条目（HR、闲聊）不归入。
- 不要为了凑数把不同的事合成一个，也不要把同一件事拆成两个（例如"Redis 缓存一致性"和"缓存与数据库双写"应合并）。`,
    untrustedInputs: "话题条目",
    payload: { role: input.role, items: input.items.map((item, index) => ({ index, file: item.file, name: item.name, description: item.description, example: item.example })) },
    schema: mergedTopicsSchema,
    maxOutputTokens: 6_000,
    timeoutMs: 180_000,
  });
  const seen = new Set<string>();
  return output.topics.flatMap((topic) => {
    if (seen.has(topic.id)) return [];
    seen.add(topic.id);
    const members = topic.members.map((index) => input.items[index]).filter(Boolean);
    if (!members.length) return [];
    const examples = [...new Set(members.map((item) => item.example))].slice(0, 5);
    return [{ id: topic.id, name: topic.name, description: topic.description, count: new Set(members.map((item) => item.file)).size, examples }];
  });
}
