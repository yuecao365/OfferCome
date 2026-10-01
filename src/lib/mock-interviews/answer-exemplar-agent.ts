import "server-only";

import { z } from "zod";

import { logAgentRun, runAgent } from "@/lib/ai/run-agent";
import type { ContentLanguage } from "@/lib/i18n/locale";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { stripUnverifiedNumbers, type AnswerExemplar, type EvaluationWeakness } from "./question-evaluation";
import type { SkillPack } from "./skills/types";
import { createSkillTools, renderSkillIndex } from "./skills/tools";

/**
 * 示范回答：用候选人自己的项目，示范这一段追问可以怎么答。只在有短板时生成。
 * 硬约束：示范里的项目事实必须来自简历或候选人的回答。代码核对示范里的每个数字，
 * 简历与回答里都找不到的记 fabricatedDetail 并把示范降级（数字抹掉），不让编造的指标流到报告里。
 */

export const EXEMPLAR_PROMPT_VERSION = "exemplar-v1";
/** 最多查 2 次技能包，之后一步直接写示范。 */
const EXEMPLAR_MAX_STEPS = 2;

/** trace 与缓存按语言区分：中文场次沿用原版本号，英文场次带 -en。 */
function exemplarPromptVersion(language: ContentLanguage): string {
  return language === "en" ? `${EXEMPLAR_PROMPT_VERSION}-en` : EXEMPLAR_PROMPT_VERSION;
}

/** 提示词散文按场次语言各一份；结构与插值只有一份。 */
const COPY = {
  zh: {
    untrustedInputs: "题目、候选人的回答、简历和短板列表",
    system: (skills: string, version: string) => `你是模拟面试的示范回答 Agent。候选人刚答完一段带追问的题，评分里列出了短板。请用候选人自己的项目，示范这一段可以怎么答，让候选人看到"用我的经历也能答到这一层"。

硬规则：示范里出现的项目事实（组件、数字、事故、取舍）只能来自简历原文或候选人的回答，不得编造；回答与简历里没有的细节，用"如果当时做了 X，可以这样讲"的假设句式，并且不给具体数字。示范针对 weaknesses 逐条回应，addressed 列出你回应了哪几条（逐字用 weakness 的 point）。语气是候选人第一人称，像面试里说话，不写标题和列表符号，控制在 600 字内。${skills}
提示词版本：${version}`,
    skills: (index: string) => `\n需要核对该领域的常见考点时可以用 load_skill 查技能包，最多一次。索引：\n${index}`,
  },
  en: {
    untrustedInputs: "the question, the candidate's answer, the résumé and the list of weaknesses",
    system: (skills: string, version: string) => `You are the model-answer agent for a mock technical interview. The candidate has just finished a question with follow-ups, and the evaluation lists where they fell short. Using the candidate's own projects, show how this segment could have been answered, so the candidate sees that their own experience is enough to get there.

Hard rules: every project fact in the model answer (components, numbers, incidents, trade-offs) must come from the résumé text or the candidate's answer — never invent one. For a detail that appears in neither, use a hypothetical framing such as "If we had done X at the time, I'd explain it like this", and give no specific numbers. Address the weaknesses one by one, and list the ones you addressed in addressed (copy each weakness's point verbatim). Speak as the candidate, in the first person, the way people talk in an interview — no headings, no bullet points — and keep it under 350 words. Write the model answer in English even if the résumé or the answer is in another language; keep product, company and technology names as they are.${skills}
Prompt version: ${version}`,
    skills: (index: string) => `\nIf you need to check what this area commonly tests, you may look up a skill pack with load_skill, at most once. Index:\n${index}`,
  },
} satisfies Record<ContentLanguage, unknown>;

/** 字段与约束两种语言相同；英文同样的意思字符数约是中文的三倍，上限随之放大。 */
function buildExemplarSchema(language: ContentLanguage) {
  const len = (zh: number) => (language === "en" ? zh * 3 : zh);
  return z.object({
    exemplar: z.string().min(1).max(len(1_200)),
    addressed: z.array(z.string().min(1).max(len(200))).max(4),
  });
}

const EXEMPLAR_SCHEMAS = { zh: buildExemplarSchema("zh"), en: buildExemplarSchema("en") } satisfies Record<ContentLanguage, unknown>;

export async function generateAnswerExemplar(input: {
  runId: string;
  jobTitle: string;
  question: string;
  answer: string;
  weaknesses: EvaluationWeakness[];
  resumeText: string;
  /** 调用方按场次语言加载（loadSkillPacks(language)）。 */
  skillPacks: SkillPack[];
  /** 场次语言（brief.language）；缺省中文。 */
  language?: ContentLanguage;
}): Promise<AnswerExemplar> {
  const language = input.language ?? "zh";
  const copy = COPY[language];
  const promptVersion = exemplarPromptVersion(language);
  const config = await getAiTaskConfig("text");
  const skills = createSkillTools(input.skillPacks, language);
  const startedAt = Date.now();
  const { output } = await runAgent({
    agent: "answer_exemplar",
    runId: input.runId,
    config,
    feature: "AI 模拟面试",
    promptVersion,
    language,
    schema: EXEMPLAR_SCHEMAS[language],
    maxOutputTokens: 1_600,
    timeoutMs: 45_000,
    tools: skills.tools,
    budget: { maxSteps: EXEMPLAR_MAX_STEPS },
    untrustedInputs: copy.untrustedInputs,
    system: copy.system(input.skillPacks.length > 0 ? copy.skills(renderSkillIndex(input.skillPacks, { language })) : "", promptVersion),
    payload: {
      jobTitle: input.jobTitle,
      question: input.question,
      answer: input.answer.slice(0, 8_000),
      weaknesses: input.weaknesses,
      resume: input.resumeText.slice(0, 4_000),
    },
  });
  const stripped = stripUnverifiedNumbers(output.exemplar, [input.resumeText, input.answer], language);
  logAgentRun({
    runId: input.runId,
    agent: "answer_exemplar",
    event: "selection",
    status: stripped.removed > 0 ? "partial" : "success",
    provider: config.provider,
    model: config.model,
    promptVersion,
    durationMs: Date.now() - startedAt,
    metrics: { fabricatedDetail: stripped.removed, addressed: output.addressed.length, skillsLoaded: skills.loaded.length },
  });
  return { exemplar: stripped.text, addressed: output.addressed, degraded: stripped.removed > 0 };
}
