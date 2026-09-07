import "server-only";

import { isStepCount } from "ai";

import { assertAiConfigured, logAgentRun, runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";
import { getAiTaskConfig } from "@/lib/settings/ai";

import type { MockInterviewContext } from "../context";
import { loadSkillPacks } from "../skills/loader";
import { selectSkillIndex } from "../skills/selector";
import { createSkillTools, renderSkillIndex } from "../skills/tools";
import type { MockInterviewJobBlueprint } from "../types";
import {
  briefOutputSchema,
  buildBriefFromOutput,
  fallbackBrief,
  MAX_AREA_DEPTH,
  turnRangeForPace,
  type InterviewBrief,
  type InterviewPace,
} from "./brief";
import { INTERVIEWER_PROMPT_VERSION } from "./prompt";

const BRIEF_TIMEOUT_MS = 90_000;
/** 最多加载几个技能包再产出简报：每次 load_skill 一步，最后一步出结构化结果。 */
const BRIEF_MAX_STEPS = 5;

const rescueBrief = salvageJson(briefOutputSchema, {
  accept: (output) => output.areas.length > 0,
});

/**
 * 备课：从蓝图、简历、技能包生成面试简报。
 * 技能包按渐进式披露交给模型：索引进提示词，全文由模型用 load_skill 自行加载。
 * 两级：严格 schema + 抢救 → 代码兜底简报。与蓝图一样没有失败路径。
 */
export async function generateInterviewBrief(input: {
  generationId: string;
  jobTitle: string;
  blueprint: MockInterviewJobBlueprint;
  context: MockInterviewContext;
  pace: InterviewPace;
  round: string | null;
}): Promise<InterviewBrief> {
  const config = await getAiTaskConfig("text");
  assertAiConfigured(config, "AI 模拟面试");
  const index = selectSkillIndex(
    {
      jobTitle: input.jobTitle,
      jobDescription: input.context.jobDescription,
      resumeText: input.context.resume.text,
    },
    await loadSkillPacks(),
  );
  const skills = createSkillTools(index);
  const askIntro = true;
  const range = turnRangeForPace(input.pace);
  const base = {
    blueprint: input.blueprint,
    pace: input.pace,
    round: input.round,
    askIntro,
    skillPacks: skills.loaded,
  };
  const startedAt = Date.now();
  const finish = (level: 1 | 3, brief: InterviewBrief) => {
    logAgentRun({
      runId: input.generationId,
      agent: "interview_brief",
      event: "selection",
      status: level === 3 ? "partial" : "success",
      provider: config.provider,
      model: config.model,
      promptVersion: INTERVIEWER_PROMPT_VERSION,
      durationMs: Date.now() - startedAt,
      metrics: {
        level,
        areaCount: brief.areas.length,
        hypothesisCount: brief.hypotheses.length,
        skillsLoaded: skills.loaded.length,
      },
    });
    return brief;
  };

  try {
    const { output } = await runAgent({
      agent: "interview_brief",
      runId: input.generationId,
      config,
      feature: "AI 模拟面试",
      promptVersion: INTERVIEWER_PROMPT_VERSION,
      schema: briefOutputSchema,
      schemaName: "interview_brief",
      schemaDescription: "面试官的备课简报：考察领域、切入问题、深度阶梯、简历假设",
      maxOutputTokens: 4_000,
      timeoutMs: BRIEF_TIMEOUT_MS,
      tools: skills.tools,
      stopWhen: isStepCount(BRIEF_MAX_STEPS),
      rescue: rescueBrief,
      untrustedInputs: "岗位描述、简历、项目和历史反馈",
      system: `你是资深技术面试官，正在为一场模拟面试备课。目标岗位：${input.jobTitle}。这场面试预计 ${range.min}–${range.max} 个回合（一个回合 = 你问一次），开场自我介绍占 1 个回合。

备课前先用 load_skill 加载最相关的 1–3 个技能包（下面是索引，按 description 判断；技能包是本系统提供的可信资料，里面的阶梯、好题、危险信号可以直接用）：
${renderSkillIndex(index)}

备课的产物不是题目清单，而是：
1. 考察领域：从岗位能力蓝图归并而来，每个领域写明 kind（technical / project / behavioral）、绑定的 competencyIds、权重（1–3，越重要越大）和 depth（打算追问几层，1–${MAX_AREA_DEPTH}）。领域数量和深度由你分配：一个领域花费 depth + 2 个回合，全部领域加起来控制在 ${range.max - 1} 回合以内，超出的会按权重被丢弃。少而深、多而浅都可以——最重要的领域深挖，次要的浅问一层或不问；但要把预算用满，总花费尽量接近上限，至少两个领域。候选人简历上有具体项目时，至少一个 project 领域围绕它深挖。
2. 每个领域一道切入问题：必须从具体场景切入，能让"背过但不懂"的人答错；禁止"谈谈你对 X 的理解"这类空洞问法。
3. 每个领域的深度阶梯（与 depth 同长）：入门问法 → 原理 → 场景排查 → 权衡取舍，每级一句"接下来往下追什么"。参考技能包里的阶梯与追问链。
4. 期望信号：好回答会出现的要点，用于面试后评价，不会给候选人看。
5. 简历假设（最多 6 条）：要在面试里验证的具体点——写了数字的成果、只写框架名的经历、时间线的空洞。每条 evidence 必须逐字复制简历原文片段，不得改写；没有依据的假设不要写。

已知的候选人弱项（来自历史面试反馈）可以转化为假设去验证。提示词版本：${INTERVIEWER_PROMPT_VERSION}`,
      payload: {
        jobTitle: input.jobTitle,
        round: input.round ?? "未指定",
        jobDescription: input.context.jobDescription,
        jobBlueprint: input.blueprint,
        resume: input.context.resume.text,
        projects: input.context.projects,
        knownWeaknesses: input.context.profile.insights
          .filter((item) => item.kind === "weakness" || item.kind === "training_focus")
          .slice(0, 6)
          .map((item) => ({ title: item.title, statement: item.statement })),
      },
    });
    return finish(
      1,
      buildBriefFromOutput({
        output,
        resumeText: input.context.resume.text,
        ...base,
      }),
    );
  } catch (error) {
    console.warn(
      "[interviewer] brief generation failed, using fallback brief:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  return finish(3, fallbackBrief({ ...base, projects: input.context.projects }));
}
