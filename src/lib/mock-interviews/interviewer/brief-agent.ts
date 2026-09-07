import "server-only";

import { assertAiConfigured, logAgentRun, runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";
import { getAiTaskConfig } from "@/lib/settings/ai";

import type { MockInterviewContext } from "../context";
import { loadSkillPacks } from "../skills/loader";
import { recommendSkillPacks } from "../skills/selector";
import type { MockInterviewJobBlueprint } from "../types";
import {
  briefOutputSchema,
  buildBriefFromOutput,
  fallbackBrief,
  maxAreasForDuration,
  type InterviewBrief,
} from "./brief";
import { INTERVIEWER_PROMPT_VERSION } from "./prompt";

const BRIEF_TIMEOUT_MS = 60_000;

/** 技能包只取"追问链 / 深度阶梯 / 好题坏题"三段，够备课用，不把整包塞进上下文。 */
function skillExcerpt(body: string): string {
  const sections = body.split(/\n(?=## )/);
  const wanted = sections.filter((section) =>
    /追问|阶梯|好题|坏题|出题原则/.test(section.slice(0, 40)),
  );
  return (wanted.length > 0 ? wanted : sections.slice(0, 2)).join("\n").slice(0, 2_500);
}

const rescueBrief = salvageJson(briefOutputSchema, {
  accept: (output) => output.areas.length > 0,
});

/**
 * 备课：从蓝图、简历、技能包生成面试简报。
 * 两级：严格 schema + 抢救 → 代码兜底简报。与蓝图一样没有失败路径。
 */
export async function generateInterviewBrief(input: {
  generationId: string;
  jobTitle: string;
  blueprint: MockInterviewJobBlueprint;
  context: MockInterviewContext;
  durationMinutes: number;
  round: string | null;
}): Promise<InterviewBrief> {
  const config = await getAiTaskConfig("text");
  assertAiConfigured(config, "AI 模拟面试");
  const packs = await loadSkillPacks();
  const recommended = recommendSkillPacks(
    {
      jobTitle: input.jobTitle,
      jobDescription: input.context.jobDescription,
      resumeText: input.context.resume.text,
    },
    packs,
  );
  const packsByName = new Map(packs.map((pack) => [pack.name, pack]));
  const askIntro = true;
  const maxAreas = maxAreasForDuration(input.durationMinutes);
  const base = {
    blueprint: input.blueprint,
    durationMinutes: input.durationMinutes,
    round: input.round,
    askIntro,
    skillPacks: recommended,
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
      rescue: rescueBrief,
      untrustedInputs: "岗位描述、简历、项目和历史反馈",
      system: `你是资深技术面试官，正在为一场 ${input.durationMinutes} 分钟的模拟面试备课。目标岗位：${input.jobTitle}。

备课的产物不是题目清单，而是：
1. 考察领域（${Math.min(3, maxAreas)}–${maxAreas} 个，时长只够这么多，多出的会被丢弃）：从岗位能力蓝图归并而来，每个领域写明 kind（technical / project / behavioral）、绑定的 competencyIds、权重（1–3，越重要越大）。候选人简历上有具体项目时，至少一个 project 领域围绕它深挖。
2. 每个领域一道切入问题：必须从具体场景切入，能让"背过但不懂"的人答错；禁止"谈谈你对 X 的理解"这类空洞问法。
3. 每个领域的深度阶梯（2–4 级）：入门问法 → 原理 → 场景排查 → 权衡取舍，每级一句"接下来往下追什么"。参考技能包里的阶梯与追问链。
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
        skillPacks: recommended.flatMap((name) => {
          const pack = packsByName.get(name);
          return pack ? [{ name: pack.name, excerpt: skillExcerpt(pack.body) }] : [];
        }),
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
