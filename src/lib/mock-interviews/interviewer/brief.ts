import { z } from "zod";

import { normalizedText } from "@/lib/text/similarity";

import type { MockInterviewJobBlueprint } from "../types";

/**
 * 面试简报：面试官的"备课"产物，替代预生成的题目清单。
 *
 * 领域来自岗位蓝图，评分表按领域类型由代码给定（开场前冻结，是公平性的锚点），
 * 简历假设逐字引用简历原文（硬门），切入问题与深度阶梯由模型给出。
 */

export const INTERVIEW_DURATIONS = [15, 30, 45] as const;
export type InterviewDuration = (typeof INTERVIEW_DURATIONS)[number];
export const DEFAULT_INTERVIEW_DURATION: InterviewDuration = 30;

export function isInterviewDuration(value: number): value is InterviewDuration {
  return (INTERVIEW_DURATIONS as readonly number[]).includes(value);
}

export const AREA_KINDS = ["technical", "project", "behavioral"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

export type RubricItem = { name: string; description: string; weight: number };

/** 领域评分表：按类型固定，同一份 JD 生成同一套，评分只对照它。 */
export function rubricForAreaKind(kind: AreaKind): RubricItem[] {
  if (kind === "project") {
    return [
      { name: "事实与细节", description: "回答包含可核验的个人职责、技术决策和实施细节。", weight: 40 },
      { name: "岗位关联", description: "能将项目经验映射到目标岗位的实际职责。", weight: 35 },
      { name: "复盘与表达", description: "结构清晰，并能说明结果、取舍和改进。", weight: 25 },
    ];
  }
  if (kind === "technical") {
    return [
      { name: "技术正确性", description: "关键概念、机制和边界条件准确。", weight: 50 },
      { name: "分析与取舍", description: "能够解释方案选择、限制及替代方案。", weight: 30 },
      { name: "表达结构", description: "回答层次清楚，结论有依据。", weight: 20 },
    ];
  }
  return [
    { name: "证据充分性", description: "使用具体情境、行动和结果支持回答。", weight: 45 },
    { name: "判断与反思", description: "说明决策依据、协作方式和复盘改进。", weight: 30 },
    { name: "表达结构", description: "回答重点明确、逻辑连贯。", weight: 25 },
  ];
}

/** 发给模型的简报 schema：严格模式，全部字段 required。分钟数由代码按权重分配。 */
export const briefOutputSchema = z.object({
  areas: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().min(1).max(60),
        kind: z.enum(AREA_KINDS),
        description: z.string().min(1).max(300),
        competencyIds: z.array(z.string().min(1).max(40)).max(6),
        /** 1–3，越大分配的时间越多。 */
        weight: z.number().min(1).max(3),
        entryQuestion: z.string().min(1).max(500),
        /** 深度阶梯：入门 → 原理 → 场景排查 → 权衡，每级一句"往下追什么"。 */
        ladder: z.array(z.string().min(1).max(200)).min(2).max(4),
        expectedSignals: z.array(z.string().min(1).max(200)).min(1).max(5),
      }),
    )
    .min(1)
    .max(6),
  hypotheses: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        /** 要验证什么，例如"简历称 prompt 长度降低约 50%，验证度量方法与基线"。 */
        text: z.string().min(1).max(300),
        /** 简历原文逐字片段。 */
        evidence: z.string().min(1).max(300),
        areaId: z.string().min(1).max(40).nullable(),
      }),
    )
    .max(6),
});
export type BriefOutput = z.infer<typeof briefOutputSchema>;

export type InterviewArea = Omit<BriefOutput["areas"][number], "weight"> & {
  minutes: number;
  rubric: RubricItem[];
};
export type InterviewHypothesis = BriefOutput["hypotheses"][number];

export type InterviewBrief = {
  durationMinutes: number;
  round: string | null;
  askIntro: boolean;
  areas: InterviewArea[];
  hypotheses: InterviewHypothesis[];
  skillPacks: string[];
  /** 简报是模型产出还是代码兜底。 */
  source: "model" | "fallback";
};

/** 开场与收尾各留一点时间。 */
export const OPENING_MINUTES = 3;
const MIN_AREA_MINUTES = 5;
const MAX_AREAS = 5;

/** 时长决定领域数：每个领域至少 5 分钟，最多 5 个。 */
export function maxAreasForDuration(durationMinutes: number): number {
  return Math.max(1, Math.min(MAX_AREAS, Math.floor((durationMinutes - OPENING_MINUTES) / MIN_AREA_MINUTES)));
}

function isEvidence(haystack: string, excerpt: string): boolean {
  const needle = normalizedText(excerpt);
  return needle.length >= 4 && haystack.includes(needle);
}

/** 按权重把可用分钟分给各领域，每个领域不少于下限，总和等于可用分钟。 */
export function allocateMinutes(weights: number[], durationMinutes: number): number[] {
  const available = Math.max(MIN_AREA_MINUTES * weights.length, durationMinutes - OPENING_MINUTES);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || weights.length;
  const raw = weights.map((weight) => Math.max(MIN_AREA_MINUTES, Math.floor((available * (weight || 1)) / total)));
  let remainder = available - raw.reduce((sum, value) => sum + value, 0);
  for (let index = 0; remainder > 0 && weights.length > 0; index = (index + 1) % weights.length) {
    raw[index] += 1;
    remainder -= 1;
  }
  return raw;
}

/**
 * 模型产出 → 冻结的简报。领域引用的能力 ID 必须真实存在（不存在的丢掉，
 * 全丢则保留领域但不绑定）；假设的简历证据必须逐字出现在简历里（硬门）。
 */
export function buildBriefFromOutput(input: {
  output: BriefOutput;
  blueprint: MockInterviewJobBlueprint;
  resumeText: string;
  durationMinutes: number;
  round: string | null;
  askIntro: boolean;
  skillPacks: string[];
}): InterviewBrief {
  const competencyIds = new Set(input.blueprint.competencies.map((item) => item.id));
  const resume = normalizedText(input.resumeText);
  const seenAreaIds = new Set<string>();
  const areasRaw = input.output.areas
    .filter((area) => {
      if (seenAreaIds.has(area.id)) return false;
      seenAreaIds.add(area.id);
      return true;
    })
    // 超出时长能容纳的领域按权重舍弃（权重相同保留模型顺序），再恢复原顺序。
    .map((area, index) => ({ area, index }))
    .sort((a, b) => b.area.weight - a.area.weight || a.index - b.index)
    .slice(0, maxAreasForDuration(input.durationMinutes))
    .sort((a, b) => a.index - b.index)
    .map(({ area }) => area);
  const minutes = allocateMinutes(
    areasRaw.map((area) => area.weight),
    input.durationMinutes,
  );
  const areas: InterviewArea[] = areasRaw.map((area, index) => ({
    id: area.id,
    name: area.name,
    kind: area.kind,
    description: area.description,
    competencyIds: area.competencyIds.filter((id) => competencyIds.has(id)),
    entryQuestion: area.entryQuestion,
    ladder: area.ladder,
    expectedSignals: area.expectedSignals,
    minutes: minutes[index],
    rubric: rubricForAreaKind(area.kind),
  }));
  const areaIds = new Set(areas.map((area) => area.id));
  const hypotheses = input.output.hypotheses
    .filter((item) => isEvidence(resume, item.evidence))
    .map((item) => ({ ...item, areaId: item.areaId && areaIds.has(item.areaId) ? item.areaId : null }));

  return {
    durationMinutes: input.durationMinutes,
    round: input.round,
    askIntro: input.askIntro,
    areas,
    hypotheses,
    skillPacks: input.skillPacks,
    source: "model",
  };
}

/**
 * 兜底简报：模型两级都没产出时按蓝图直接搭。不可能失败，
 * 与蓝图的兜底同一哲学——降级产出，不把"请重试"丢给用户。
 */
export function fallbackBrief(input: {
  blueprint: MockInterviewJobBlueprint;
  projects: { id: string; name: string }[];
  durationMinutes: number;
  round: string | null;
  askIntro: boolean;
  skillPacks: string[];
}): InterviewBrief {
  const core = input.blueprint.competencies
    .filter((item) => item.priority === "core")
    .concat(input.blueprint.competencies.filter((item) => item.priority !== "core"))
    .slice(0, 3);
  const technical = core.map((competency, index) => ({
    id: `area-${index + 1}`,
    name: competency.name,
    kind: "technical" as const,
    description: competency.description,
    competencyIds: [competency.id],
    entryQuestion: `请结合你的经历谈谈${competency.name}：你在哪个场景里真正用到了它，遇到过什么具体问题？`,
    ladder: ["先说清楚做了什么", "追问背后的原理和为什么这样选", "追问一次真实的排查或失败", "追问如果条件变了会怎么取舍"],
    expectedSignals: ["具体场景", "机制与原理", "取舍"],
    weight: 2,
  }));
  const project = input.projects[0];
  const areasRaw = (project
    ? [
        {
          id: "area-project",
          name: `项目深挖：${project.name}`,
          kind: "project" as const,
          description: "围绕候选人简历上的项目追问职责、决策与结果",
          competencyIds: [] as string[],
          entryQuestion: `先介绍你在「${project.name}」里具体负责的部分，以及做过的最难的一个决策。`,
          ladder: ["职责边界", "为什么这样设计、还考虑过什么", "出过什么问题、怎么定位", "数字怎么来的、如果 X 变了怎么改"],
          expectedSignals: ["个人职责", "技术决策", "结果与复盘"],
          weight: 3,
        },
        ...technical,
      ]
    : technical
  ).slice(0, maxAreasForDuration(input.durationMinutes));
  const minutes = allocateMinutes(areasRaw.map((area) => area.weight), input.durationMinutes);
  return {
    durationMinutes: input.durationMinutes,
    round: input.round,
    askIntro: input.askIntro,
    areas: areasRaw.map(({ weight: _unused, ...area }, index) => {
      void _unused;
      return { ...area, minutes: minutes[index], rubric: rubricForAreaKind(area.kind) };
    }),
    hypotheses: [],
    skillPacks: input.skillPacks,
    source: "fallback",
  };
}

/** 读库里的简报；坏数据视为没有简报。 */
export function parseStoredBrief(json: string | null): InterviewBrief | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as InterviewBrief;
    return Array.isArray(value?.areas) && value.areas.length > 0 ? value : null;
  } catch {
    return null;
  }
}
