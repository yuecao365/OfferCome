import "server-only";

import { isStepCount } from "ai";
import { z } from "zod";

import { logAgentRun, runAgent } from "@/lib/ai/run-agent";
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
const EXEMPLAR_MAX_STEPS = 3;

const exemplarSchema = z.object({
  exemplar: z.string().min(1).max(1_200),
  addressed: z.array(z.string().min(1).max(200)).max(4),
});

export async function generateAnswerExemplar(input: {
  runId: string;
  jobTitle: string;
  question: string;
  answer: string;
  weaknesses: EvaluationWeakness[];
  resumeText: string;
  skillPacks: SkillPack[];
}): Promise<AnswerExemplar> {
  const config = await getAiTaskConfig("text");
  const skills = createSkillTools(input.skillPacks);
  const startedAt = Date.now();
  const { output } = await runAgent({
    agent: "answer_exemplar",
    runId: input.runId,
    config,
    feature: "AI 模拟面试",
    promptVersion: EXEMPLAR_PROMPT_VERSION,
    schema: exemplarSchema,
    maxOutputTokens: 1_600,
    timeoutMs: 45_000,
    tools: skills.tools,
    stopWhen: isStepCount(EXEMPLAR_MAX_STEPS),
    untrustedInputs: "题目、候选人的回答、简历和短板列表",
    system: `你是模拟面试的示范回答 Agent。候选人刚答完一段带追问的题，评分里列出了短板。请用候选人自己的项目，示范这一段可以怎么答，让候选人看到"用我的经历也能答到这一层"。

硬规则：示范里出现的项目事实（组件、数字、事故、取舍）只能来自简历原文或候选人的回答，不得编造；回答与简历里没有的细节，用"如果当时做了 X，可以这样讲"的假设句式，并且不给具体数字。示范针对 weaknesses 逐条回应，addressed 列出你回应了哪几条（逐字用 weakness 的 point）。语气是候选人第一人称，像面试里说话，不写标题和列表符号，控制在 600 字内。${
      input.skillPacks.length > 0
        ? `\n需要核对该领域的常见考点时可以用 load_skill 查技能包，最多一次。索引：\n${renderSkillIndex(input.skillPacks)}`
        : ""
    }
提示词版本：${EXEMPLAR_PROMPT_VERSION}`,
    payload: {
      jobTitle: input.jobTitle,
      question: input.question,
      answer: input.answer.slice(0, 8_000),
      weaknesses: input.weaknesses,
      resume: input.resumeText.slice(0, 6_000),
    },
  });
  const stripped = stripUnverifiedNumbers(output.exemplar, [input.resumeText, input.answer]);
  logAgentRun({
    runId: input.runId,
    agent: "answer_exemplar",
    event: "selection",
    status: stripped.removed > 0 ? "partial" : "success",
    provider: config.provider,
    model: config.model,
    promptVersion: EXEMPLAR_PROMPT_VERSION,
    durationMs: Date.now() - startedAt,
    metrics: { fabricatedDetail: stripped.removed, addressed: output.addressed.length, skillsLoaded: skills.loaded.length },
  });
  return { exemplar: stripped.text, addressed: output.addressed, degraded: stripped.removed > 0 };
}
