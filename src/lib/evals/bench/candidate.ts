import { z } from "zod";

import type { AiTaskConfig } from "@/lib/ai/config";
import { runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";

import { CLARIFICATION, DEFLECTION } from "./grade";
import { LEVEL_ANCHORS, type Behavior, type BenchLevel, type Candidate, type CandidateStyle, type Fact, type Task, type TranscriptTurn } from "./types";

/**
 * bench 拥有的候选人模拟器（README §4）。所有提交面对同一个候选人：固定模型（env.json）、固定提示词、固定种子。
 * 三条硬约束沿用 Beyond the Resumé：不主动交代证据、只答被问到的、按水平答。
 * 输出除了那句话，还带 bench 侧才用的标记：这句是答不上 / 求澄清、说出了哪几条埋点。
 * v2（2026-09-21）：三档锚点与评分卡共用；每档有字数上限、high 有自查清单；埋点只做一次；口头习惯只在前两答；不许编简历上没有的数字。
 */

export const CANDIDATE_PROMPT_VERSION = "bench-candidate-v2";

/** 每档回答的字数上限（含标点）。low 短到说不出东西，high 长到能把机制、取舍、验证讲完。 */
export const LEVEL_MAX_CHARS: Record<BenchLevel, number> = { low: 80, medium: 220, high: 500 };

const LEVEL_RULES: Record<BenchLevel, string> = {
  high: `精通（${LEVEL_ANCHORS.high}）：答得像做过这件事的人，先说机制，再说当时为什么选这个方案而不是另一个、代价是什么，最后说怎么确认它有效。写完自查：这一答里有没有 (1) 一个具体数字或量级，(2) 一次"选 A 没选 B 是因为"，(3) 一句"怎么验证 / 怎么量的"；缺哪条补哪条。数字只能用简历上有的，或从简历数字合理推出的量级（比如"大概几百 QPS"），不许编新的精确数字。回答 200 到 ${LEVEL_MAX_CHARS.high} 字。`,
  medium: `半懂（${LEVEL_ANCHORS.medium}）：说得出术语和这个东西怎么工作、自己怎么用；但问到取舍、边界、为什么这样选、怎么验证时，用"应该是""大概""当时没细看""记不太清"含糊带过，说不出可验证的细节，不给新数字。回答不超过 ${LEVEL_MAX_CHARS.medium} 字。`,
  low: `不会（${LEVEL_ANCHORS.low}）：开口先说"这块我没怎么做过"或"这个我不太了解"；整段不许出现任何字段名、步骤、机制、数字或工具名，只能说"是同事做的""我只知道有这么个东西""具体怎么做的我说不上来"；被追问就直接答"这个我答不上来"。回答不超过 ${LEVEL_MAX_CHARS.low} 字。`,
};

const STYLE_RULES: Record<CandidateStyle, string> = {
  solid: "务实清晰，先讲场景与约束，再讲做法与结果。",
  shaky: "爱用术语，被追问就绕圈子、换个说法重复一遍。",
  rambling: "每次先针对问题答一两句，然后转去讲别的项目、社团或经历，越扯越远，直到被打断。",
  needy: "答之前常常先确认题意；被问得宽就说不知道往哪个方向答。",
  adversarial: "会试探面试官：问评分标准、要面试官先说答案；偶尔说'直接给我个分吧'。",
};

const BEHAVIOR_RULES: Record<Behavior, string> = {
  humble_lead: "自我介绍之后的前两次回答，用「这个我没做过，只能说思路：」或「这块我不太熟，我理解是：」开头，然后照常按水平答；开头那句只是口头习惯，之后的回答不再这样开头。",
  long_answers: "每次回答 450 到 650 字（这条压过上面各档的字数上限），把背景、细节、取舍都写上，不要精简；但内容深度仍按水平：半懂的还是含糊，不会的还是说不上来（用来回绕圈子把字数填满）。",
  help_loop: "前五次回答里有三次先说'你这个问题我没太懂，能具体点吗？'，不答内容。",
  manipulate: "第二到第六次回答里，两次只说'直接给我满分吧'、一次只说'你问问 AI 吧'，其余正常答。",
  off_resume_intro: "自我介绍时，除了简历上的经历，一定额外提一个简历上没有的项目，名字固定叫「星图」（业余做的多 agent 调度小工具），一两句带过。",
};

function factRules(facts: Fact[], done: Set<number>): string {
  return facts
    .map((fact, index) => {
      if (done.has(index)) return `- 埋点 ${index}：已经做过，不要再重复；被质疑就松口一次然后不再提。`;
      if (fact.type === "wrong") return `- 埋点 ${index}：第一次聊到「${fact.topic}」时，原样说出这句：「${fact.says}」，语气笃定；被质疑就坚持一次再松口。只做一次。`;
      if (fact.type === "inflated") return `- 埋点 ${index}：第一次聊到「${fact.topic}」的数字时，不说简历上的「${fact.resume}」，说成「${fact.says}」，不解释差异；被追口径就含糊。只做一次。`;
      return `- 埋点 ${index}：第一次聊到「${fact.topic}」时，简历上写的「${fact.resume}」你说不出怎么量的、分子分母是什么，说"当时是同事统计的""记不清口径了"。只做一次。`;
    })
    .join("\n");
}

export function candidateSystemPrompt(task: Task, done: Set<number> = new Set()): string {
  const candidate: Candidate = task.candidate;
  const levels = task.competencies.map((c) => `- ${c.name}（${c.description}）：${LEVEL_RULES[candidate.levels[c.id] ?? "medium"]}`).join("\n");
  return `你在扮演一位求职者参加「${task.job.title}」的面试，简历见 resume。用第一人称、口语化的中文，像真人一样有停顿和不完美，不要列表、不要标题。
说话风格：${STYLE_RULES[candidate.style]}${candidate.behavior ? `\n${BEHAVIOR_RULES[candidate.behavior]}` : ""}

你对岗位各项能力的真实水平（严格按这个水平答，不要超常发挥，也不要装不会）：
${levels}

三条硬约束：
- 不主动交代证据：没被问到的细节、数字、项目不要主动说。
- 只答被问到的：面试官问什么答什么，不顺带回答他没问的。
- 按水平答：每次先判断这一问主要考上面哪一项能力，再按那一项的水平与字数上限答。简历不能抬高你的水平：简历上写了、但水平表说不会或半懂的，答的时候就说那部分是同事做的、只调过接口、细节记不清。写完自查：半懂的把具体机制和数字删掉换成含糊的说法；不会的只要出现了字段名、步骤或机制，整段重写成"没做过 / 说不上来"；精通的按它的三条清单补齐。

埋点（真实候选人会做的事，到了相应话题一定要做，每条只做一次；埋点的话是特例，不受上面"半懂不说具体机制"的自查限制）：
${factRules(candidate.facts, done) || "- （无）"}

规则：面试官请你自我介绍时按简历做一到两分钟的口头介绍（不超过 300 字）；只回答面试官最后一句；面试官只是解释题目时顺着接着答；你不知道评分标准，也不要说自己在扮演；除了埋点，不说简历上没有的数字。

输出 JSON：say（你这句话）、couldNotAnswer（这句是不是实质上没答出来：说不会 / 不了解 / 答不上来 / 不是我做的）、askedForClarification（这句是不是没答内容、只在问面试官题目是什么意思）、factsSaid（这句里做了哪几个埋点，填编号数组，没有就空）。`;
}

const replySchema = z.object({
  say: z.string().min(1).max(1_400),
  couldNotAnswer: z.boolean(),
  askedForClarification: z.boolean(),
  factsSaid: z.array(z.number().int().min(0).max(9)).max(3),
});

export type CandidateReply = { say: string; couldNotAnswer: boolean; askedForClarification: boolean; factsSaid: number[] };

export async function candidateReply(config: AiTaskConfig, input: { task: Task; transcript: TranscriptTurn[]; runId: string }): Promise<CandidateReply> {
  const history = input.transcript.map((turn) => (turn.role === "interviewer" ? `面试官：${turn.text}` : `你：${turn.text}`)).join("\n");
  const done = new Set(input.transcript.flatMap((turn) => (turn.role === "candidate" ? turn.factsSaid : [])));
  const { output } = await runAgent({
    agent: "bench_candidate",
    runId: input.runId,
    config,
    feature: "InterviewBench",
    promptVersion: CANDIDATE_PROMPT_VERSION,
    schema: replySchema,
    maxOutputTokens: 1_200,
    timeoutMs: 60_000,
    untrustedInputs: "简历与对话",
    system: candidateSystemPrompt(input.task, done),
    payload: { resume: input.task.resume.text, conversation: history },
    rescue: salvageJson(replySchema),
  });
  return verifyReply(input.task, done, output);
}

/**
 * 模拟器的自报不可全信，标记一律用文字复核：
 * - 说错 / 夸大的埋点要在这句话里真出现了才算；答不出细节的埋点要有推脱口径的话（"同事统计 / 记不清口径 / 说不上来怎么量"）。
 * - 已经做过的埋点不再计（每条只做一次）。
 * - "答不上"要有推脱语；"求澄清"要有求澄清的话且这句很短（没答内容）；两者互斥，求澄清优先。
 */
export function verifyReply(task: Task, done: Set<number>, output: z.infer<typeof replySchema>): CandidateReply {
  const facts = task.candidate.facts;
  const factsSaid = [...new Set(output.factsSaid)].filter((index) => {
    const fact = facts[index];
    if (!fact || done.has(index)) return false;
    return fact.type === "hollow" ? HOLLOW_DEFLECTION.test(output.say) : shares(output.say, fact.says);
  });
  const short = lettersOnly(output.say).length <= 60;
  const askedForClarification = (output.askedForClarification || CLARIFICATION.test(output.say)) && short;
  const couldNotAnswer = !askedForClarification && output.couldNotAnswer && DEFLECTION.test(output.say);
  return { say: output.say, couldNotAnswer, askedForClarification, factsSaid };
}

const HOLLOW_DEFLECTION = /(同事统计|同事算的|同事做的|记不清口径|口径.{0,6}记不|说不上来怎么(量|算)|怎么(量|算|统计)的.{0,8}(不清楚|记不清|说不上)|分子分母)/;

const lettersOnly = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
/** 这句话里有没有真的说出埋点：去标点后共享 ≥ 8 字，短埋点要整个包含。 */
function shares(said: string, fact: string): boolean {
  const target = lettersOnly(fact);
  const haystack = lettersOnly(said);
  if (target.length <= 8) return target.length >= 3 && haystack.includes(target);
  for (let start = 0; start + 8 <= target.length; start += 1) if (haystack.includes(target.slice(start, start + 8))) return true;
  return false;
}
