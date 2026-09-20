import "server-only";

import { z } from "zod";

import { assertAiConfigured, logAgentRun, runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { isVerbatimEvidence } from "@/lib/text/evidence";
import {
  MOCK_INTERVIEW_GENERATION_TIMEOUT_MS,
  MOCK_INTERVIEW_PROMPT_VERSION,
  mockInterviewJobBlueprintSchema,
  type MockInterviewJobBlueprint,
} from "./types";

const INFERRED_EVIDENCE_NOTE = "该岗位的通用要求，非用户提供";

/**
 * 证据校验不硬拒：说是 JD 原文（origin=jd）却对不上逐字的能力保留，按推断（inferred）处理——
 * 意译的证据仍可能对应真实职责，丢弃它只会让出题更偏。
 */
function cleanBlueprint(
  blueprint: MockInterviewJobBlueprint,
  jobDescription: string,
): MockInterviewJobBlueprint {
  const seenIds = new Set<string>();
  const competencies = blueprint.competencies.flatMap((competency) => {
    if (seenIds.has(competency.id)) return [];
    seenIds.add(competency.id);
    if (competency.origin !== "jd" || isVerbatimEvidence(jobDescription, competency.jdEvidence)) return [competency];
    return [{ ...competency, origin: "inferred" as const }];
  });
  return { ...blueprint, competencies };
}

/** 抢救残缺 JSON 用的宽松 schema：模型没按严格 schema 出、但文本里有能力清单时，按这个形状收。 */
const simplifiedBlueprintSchema = z.object({
  summary: z.string().max(2_000).nullable(),
  competencies: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2_000).nullable(),
        jdEvidence: z.string().max(2_000).nullable(),
      }),
    )
    .max(12),
});

/** 把任意形状的解析结果收敛为合法蓝图；抢救残缺 JSON 时同样使用。 */
function normalizeLooseBlueprint(
  value: unknown,
): MockInterviewJobBlueprint | null {
  const parsed = simplifiedBlueprintSchema.safeParse(value);
  if (!parsed.success || parsed.data.competencies.length === 0) return null;
  return {
    summary: parsed.data.summary?.trim().slice(0, 1_000) || "根据岗位描述整理的能力要点。",
    completeness: "partial",
    missingInformation: [],
    business: null,
    competencies: parsed.data.competencies.slice(0, 10).map((item, index) => ({
      id: `bp-${index + 1}`,
      name: item.name.trim().slice(0, 100),
      description: item.description?.trim().slice(0, 400) || item.name.trim().slice(0, 400),
      jdEvidence: item.jdEvidence?.trim().slice(0, 240) || INFERRED_EVIDENCE_NOTE,
      origin: "jd" as const,
      sourceUrl: null,
    })),
  };
}

const rescueBlueprint = salvageJson(mockInterviewJobBlueprintSchema, {
  accept: (blueprint) => blueprint.competencies.length > 0,
  fallback: normalizeLooseBlueprint,
});

/**
 * 兜底蓝图：模型没能产出结构化结果时，按岗位名生成通用能力，
 * 走 origin=inferred 的既有标注语义（出题时全部允许 general_role）。
 * 蓝图环节从此不再有失败路径——降级产出，但绝不把"请重试"丢给用户。
 */
function fallbackJobBlueprint(jobTitle: string): MockInterviewJobBlueprint {
  const title = jobTitle.trim() || "目标岗位";
  const competency = (id: string, name: string, description: string) => ({
    id,
    name,
    description,
    jdEvidence: INFERRED_EVIDENCE_NOTE,
    origin: "inferred" as const,
    sourceUrl: null,
  });
  return {
    summary: `岗位描述未能完成结构化分析，以下按「${title}」的常见岗位要求出题。`,
    completeness: "minimal",
    missingInformation: ["岗位描述未能完成结构化分析，已按岗位名称推断通用要求"],
    business: null,
    competencies: [
      competency("fallback-core", `${title}的核心职责`, `围绕${title}的核心日常职责与典型工作场景`),
      competency("fallback-skill", "岗位相关的专业基础", `胜任${title}通常需要的专业知识与技能基础`),
      competency("fallback-project", "项目经验与协作", "过往项目中的角色、决策过程与跨角色协作"),
    ],
  };
}

export async function analyzeMockInterviewJob(input: {
  generationId: string;
  jobTitle: string;
  jobDescription: string;
}): Promise<MockInterviewJobBlueprint> {
  const config = await getAiTaskConfig("text");
  assertAiConfigured(config, "AI 模拟面试");
  const payload = {
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription.slice(0, 30_000),
  };
  const startedAt = Date.now();

  // 走到第几级是可观察指标：兜底率升高说明上游在坏，而不是降级链在"正常工作"。
  const finish = (level: 1 | 2, blueprint: MockInterviewJobBlueprint) => {
    logAgentRun({
      runId: input.generationId,
      agent: "job_blueprint",
      event: "selection",
      status: level === 2 ? "partial" : "success",
      provider: config.provider,
      model: config.model,
      promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
      durationMs: Date.now() - startedAt,
      metrics: { level, competencyCount: blueprint.competencies.length },
    });
    return blueprint;
  };

  // 第一级：严格 schema，输出契约（收敛 / 修一次 / 抢救）在 runAgent 里。
  try {
    const { output } = await runAgent({
      agent: "job_blueprint",
      runId: input.generationId,
      config,
      feature: "AI 模拟面试",
      promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
      schema: mockInterviewJobBlueprintSchema,
      schemaName: "mock_interview_job_blueprint",
      schemaDescription: "只根据目标岗位 JD 提取的面试能力蓝图",
      maxOutputTokens: 3_000,
      timeoutMs: MOCK_INTERVIEW_GENERATION_TIMEOUT_MS,
      rescue: rescueBlueprint,
      untrustedInputs: "岗位名称和岗位描述",
      system: `你是岗位分析 Agent。只根据 JD 原文建立岗位能力蓝图，不得使用或猜测候选人的简历、历史面试和画像。每条能力的来源分两类：JD 明写的填 origin=jd，jdEvidence 从 JD 原文逐字截取那句；JD 没有明写、但从职责或团队业务推得出这个岗位显然要考的，填 origin=inferred，jdEvidence 写一句推断依据（从哪几处推出来的），不要伪造原文。sourceUrl=null。business：从团队介绍与职责里整理业务——product 是团队做什么产品、给谁用，systems 是核心系统或链路（最多 5 条，短语），constraints 是规模 / 合规 / 延迟这类约束；JD 没写的字段置 null、整段没写就 business=null，不要猜。若 JD 缺少任职要求或内容不完整，如实设置 completeness 和 missingInformation。提示词版本：${MOCK_INTERVIEW_PROMPT_VERSION}`,
      payload,
    });
    if (output.competencies.length > 0) {
      return finish(1, cleanBlueprint(output, input.jobDescription));
    }
  } catch {
    // 进入兜底蓝图。失败细节已由 runAgent 记录。曾有"换简化 schema 再调一次"的第二级：真实记账 29 次只救回 3 次，失败多是服务商不可用，已删。
  }

  return finish(2, fallbackJobBlueprint(input.jobTitle));
}
