import "server-only";

import { z } from "zod";

import { assertAiConfigured, logAgentRun, runAgent } from "@/lib/ai/run-agent";
import { salvageJson } from "@/lib/ai/salvage-json";
import { getAiTaskConfig } from "@/lib/settings/ai";

import { isJobDescriptionEvidence } from "./relevance";
import {
  MOCK_INTERVIEW_GENERATION_TIMEOUT_MS,
  MOCK_INTERVIEW_PROMPT_VERSION,
  mockInterviewJobBlueprintSchema,
  type MockInterviewJobBlueprint,
} from "./types";

const INFERRED_EVIDENCE_NOTE = "该岗位的通用要求，非用户提供";

/**
 * 证据校验从"硬拒"改为"降级"：jdEvidence 不是 JD 原文逐字子串的能力保留，
 * 但降为 secondary——意译的证据仍可能对应真实职责，丢弃它只会让出题更偏。
 */
function cleanBlueprint(
  blueprint: MockInterviewJobBlueprint,
  jobDescription: string,
): MockInterviewJobBlueprint {
  const seenIds = new Set<string>();
  const competencies = blueprint.competencies.flatMap((competency) => {
    if (seenIds.has(competency.id)) return [];
    seenIds.add(competency.id);
    if (
      competency.origin !== "jd" ||
      isJobDescriptionEvidence(jobDescription, competency.jdEvidence)
    ) {
      return [competency];
    }
    return [{ ...competency, priority: "secondary" as const }];
  });
  return { ...blueprint, competencies };
}

/**
 * 简化重试用的宽松 schema：结构越简单，小模型的结构化成功率越高。
 * 字段全部 required 但可空——严格模式不接受 optional/nullish。
 */
const simplifiedBlueprintSchema = z.object({
  summary: z.string().max(2_000).nullable(),
  competencies: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2_000).nullable(),
        priority: z.string().nullable(),
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
    competencies: parsed.data.competencies.slice(0, 10).map((item, index) => ({
      id: `bp-${index + 1}`,
      name: item.name.trim().slice(0, 100),
      description: item.description?.trim().slice(0, 400) || item.name.trim().slice(0, 400),
      priority: item.priority === "secondary" ? ("secondary" as const) : ("core" as const),
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
 * 兜底蓝图：模型两轮都没能产出结构化结果时，按岗位名生成通用能力，
 * 走 origin=inferred 的既有标注语义（出题时全部允许 general_role）。
 * 蓝图环节从此不再有失败路径——降级产出，但绝不把"请重试"丢给用户。
 */
function fallbackJobBlueprint(jobTitle: string): MockInterviewJobBlueprint {
  const title = jobTitle.trim() || "目标岗位";
  const competency = (id: string, name: string, description: string) => ({
    id,
    name,
    description,
    priority: "core" as const,
    jdEvidence: INFERRED_EVIDENCE_NOTE,
    origin: "inferred" as const,
    sourceUrl: null,
  });
  return {
    summary: `岗位描述未能完成结构化分析，以下按「${title}」的常见岗位要求出题。`,
    completeness: "minimal",
    missingInformation: ["岗位描述未能完成结构化分析，已按岗位名称推断通用要求"],
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
  const finish = (level: 1 | 2 | 3, blueprint: MockInterviewJobBlueprint) => {
    logAgentRun({
      runId: input.generationId,
      agent: "job_blueprint",
      event: "selection",
      status: level === 3 ? "partial" : "success",
      provider: config.provider,
      model: config.model,
      promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
      durationMs: Date.now() - startedAt,
      metrics: { level, competencyCount: blueprint.competencies.length },
    });
    return blueprint;
  };

  // 第一级：严格 schema + 残缺 JSON 抢救。
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
      system: `你是岗位分析 Agent。只根据 JD 原文建立岗位能力蓝图，不得使用或猜测候选人的简历、历史面试和画像。区分核心能力与邻近能力；团队介绍中提到、但岗位职责没有明确要求的技术通常标记为 secondary。jdEvidence 尽量从 JD 原文逐字截取。所有能力都填写 origin=jd、sourceUrl=null。若 JD 缺少任职要求或内容不完整，如实设置 completeness 和 missingInformation。提示词版本：${MOCK_INTERVIEW_PROMPT_VERSION}`,
      payload,
    });
    if (output.competencies.length > 0) {
      return finish(1, cleanBlueprint(output, input.jobDescription));
    }
  } catch {
    // 进入简化重试。失败细节已由 runAgent 记录。
  }

  // 第二级：扁平宽松 schema 重试一次。
  try {
    const { output } = await runAgent({
      agent: "job_blueprint_simplified",
      runId: input.generationId,
      config,
      feature: "AI 模拟面试",
      promptVersion: MOCK_INTERVIEW_PROMPT_VERSION,
      schema: simplifiedBlueprintSchema,
      maxOutputTokens: 2_000,
      timeoutMs: MOCK_INTERVIEW_GENERATION_TIMEOUT_MS,
      untrustedInputs: "岗位名称和岗位描述",
      system: `你是岗位分析 Agent。从 JD 中列出这个岗位考察的能力（最多 8 条），每条给名称和一句描述。提示词版本：${MOCK_INTERVIEW_PROMPT_VERSION}`,
      payload,
    });
    const normalized = normalizeLooseBlueprint(output);
    if (normalized) return finish(2, cleanBlueprint(normalized, input.jobDescription));
  } catch {
    // 进入兜底蓝图。
  }

  return finish(3, fallbackJobBlueprint(input.jobTitle));
}
