import { z } from "zod";

import { normalizedText } from "@/lib/text/similarity";

import type { MockInterviewJobBlueprint } from "../types";

/**
 * 面试简报：面试官的"备课"产物，替代预生成的题目清单。
 *
 * 用户只选节奏（快/中/长），节奏映射成回合区间；领域数量与每个领域的深度由
 * 备课模型在区间内自行分配（少而深、多而浅都行），代码只保证总量不超上限。
 * 评分表按领域类型由代码给定（开场前冻结，是公平性的锚点），
 * 简历假设逐字引用简历原文（硬门），切入问题与深度阶梯由模型给出。
 */

export const INTERVIEW_PACES = ["quick", "standard", "deep"] as const;
export type InterviewPace = (typeof INTERVIEW_PACES)[number];
export const DEFAULT_INTERVIEW_PACE: InterviewPace = "standard";
export const INTERVIEW_PACE_LABELS: Record<InterviewPace, string> = {
  quick: "快速",
  standard: "标准",
  deep: "深入",
};

export function isInterviewPace(value: string): value is InterviewPace {
  return (INTERVIEW_PACES as readonly string[]).includes(value);
}

export type TurnRange = { min: number; max: number };

/**
 * 节奏 → 回合区间（一个回合 = 面试官问一次）。下限之前不许收尾，上限到了强制收尾，
 * 区间内由面试官自己判断"考察够了"。
 */
export function turnRangeForPace(pace: InterviewPace): TurnRange {
  switch (pace) {
    case "quick":
      return { min: 6, max: 10 };
    case "deep":
      return { min: 22, max: 32 };
    default:
      return { min: 12, max: 20 };
  }
}

export const AREA_KINDS = ["technical", "project", "behavioral"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

export const MAX_AREA_DEPTH = 4;
/** 一个领域的回合花费：切入问题 + 追问 + 一次提示余量。 */
export function areaTurnCost(depth: number): number {
  return depth + 2;
}
/** 开场自我介绍占一个回合。 */
const OPENING_TURNS = 1;

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

/** 发给模型的简报 schema：严格模式，全部字段 required。 */
export const briefOutputSchema = z.object({
  areas: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().min(1).max(60),
        kind: z.enum(AREA_KINDS),
        description: z.string().min(1).max(300),
        competencyIds: z.array(z.string().min(1).max(40)).max(6),
        /** 1–3，越大越重要；超预算时先砍权重低的。 */
        weight: z.number().min(1).max(3),
        /** 打算追问几层（1–4）：重要的领域深挖，次要的浅问一层。 */
        depth: z.number().int().min(1).max(MAX_AREA_DEPTH),
        entryQuestion: z.string().min(1).max(500),
        /** 深度阶梯：入门 → 原理 → 场景排查 → 权衡，每级一句"往下追什么"。 */
        ladder: z.array(z.string().min(1).max(200)).min(1).max(MAX_AREA_DEPTH),
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
  rubric: RubricItem[];
};
export type InterviewHypothesis = BriefOutput["hypotheses"][number];

export type InterviewBrief = {
  pace: InterviewPace;
  turnRange: TurnRange;
  round: string | null;
  askIntro: boolean;
  areas: InterviewArea[];
  hypotheses: InterviewHypothesis[];
  skillPacks: string[];
  /** 简报是模型产出还是代码兜底。 */
  source: "model" | "fallback";
};

/** 整份计划的回合花费：开场 + 各领域。 */
export function plannedTurns(areas: { depth: number }[], askIntro: boolean): number {
  return (askIntro ? OPENING_TURNS : 0) + areas.reduce((sum, area) => sum + areaTurnCost(area.depth), 0);
}

function isEvidence(haystack: string, excerpt: string): boolean {
  const needle = normalizedText(excerpt);
  return needle.length >= 4 && haystack.includes(needle);
}

/**
 * 把领域装进回合上限：按权重从高到低收，装不下的丢掉（同权保留模型顺序），
 * 至少保留一个；最后恢复模型给的顺序。
 */
function fitAreas<T extends { weight: number; depth: number }>(
  areas: T[],
  range: TurnRange,
  askIntro: boolean,
): T[] {
  const ranked = areas
    .map((area, index) => ({ area, index }))
    .sort((a, b) => b.area.weight - a.area.weight || a.index - b.index);
  const kept: { area: T; index: number }[] = [];
  let used = plannedTurns([], askIntro);
  for (const entry of ranked) {
    const cost = areaTurnCost(entry.area.depth);
    if (kept.length > 0 && used + cost > range.max) continue;
    kept.push(entry);
    used += cost;
  }
  return kept.sort((a, b) => a.index - b.index).map(({ area }) => area);
}

/**
 * 模型产出 → 冻结的简报。领域引用的能力 ID 必须真实存在（不存在的丢掉，
 * 全丢则保留领域但不绑定）；假设的简历证据必须逐字出现在简历里（硬门）。
 */
export function buildBriefFromOutput(input: {
  output: BriefOutput;
  blueprint: MockInterviewJobBlueprint;
  resumeText: string;
  pace: InterviewPace;
  round: string | null;
  askIntro: boolean;
  skillPacks: string[];
}): InterviewBrief {
  const competencyIds = new Set(input.blueprint.competencies.map((item) => item.id));
  const resume = normalizedText(input.resumeText);
  const range = turnRangeForPace(input.pace);
  const seenAreaIds = new Set<string>();
  const unique = input.output.areas.filter((area) => {
    if (seenAreaIds.has(area.id)) return false;
    seenAreaIds.add(area.id);
    return true;
  });
  const areas: InterviewArea[] = fitAreas(unique, range, input.askIntro).map(
    ({ weight: _unused, ...area }) => {
      void _unused;
      return {
        ...area,
        competencyIds: area.competencyIds.filter((id) => competencyIds.has(id)),
        rubric: rubricForAreaKind(area.kind),
      };
    },
  );
  const areaIds = new Set(areas.map((area) => area.id));
  const hypotheses = input.output.hypotheses
    .filter((item) => isEvidence(resume, item.evidence))
    .map((item) => ({ ...item, areaId: item.areaId && areaIds.has(item.areaId) ? item.areaId : null }));

  return {
    pace: input.pace,
    turnRange: range,
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
  pace: InterviewPace;
  round: string | null;
  askIntro: boolean;
  skillPacks: string[];
}): InterviewBrief {
  const range = turnRangeForPace(input.pace);
  const core = input.blueprint.competencies
    .filter((item) => item.priority === "core")
    .concat(input.blueprint.competencies.filter((item) => item.priority !== "core"))
    .slice(0, 4);
  const technical = core.map((competency, index) => ({
    id: `area-${index + 1}`,
    name: competency.name,
    kind: "technical" as const,
    description: competency.description,
    competencyIds: [competency.id],
    weight: 2,
    depth: 2,
    entryQuestion: `请结合你的经历谈谈${competency.name}：你在哪个场景里真正用到了它，遇到过什么具体问题？`,
    ladder: ["先说清楚做了什么", "追问背后的原理和为什么这样选", "追问一次真实的排查或失败", "追问如果条件变了会怎么取舍"],
    expectedSignals: ["具体场景", "机制与原理", "取舍"],
  }));
  const project = input.projects[0];
  const areasRaw = project
    ? [
        {
          id: "area-project",
          name: `项目深挖：${project.name}`,
          kind: "project" as const,
          description: "围绕候选人简历上的项目追问职责、决策与结果",
          competencyIds: [] as string[],
          weight: 3,
          depth: 3,
          entryQuestion: `先介绍你在「${project.name}」里具体负责的部分，以及做过的最难的一个决策。`,
          ladder: ["职责边界", "为什么这样设计、还考虑过什么", "出过什么问题、怎么定位", "数字怎么来的、如果 X 变了怎么改"],
          expectedSignals: ["个人职责", "技术决策", "结果与复盘"],
        },
        ...technical,
      ]
    : technical;
  return {
    pace: input.pace,
    turnRange: range,
    round: input.round,
    askIntro: input.askIntro,
    areas: fitAreas(areasRaw, range, input.askIntro).map(({ weight: _unused, ...area }) => {
      void _unused;
      return { ...area, rubric: rubricForAreaKind(area.kind) };
    }),
    hypotheses: [],
    skillPacks: input.skillPacks,
    source: "fallback",
  };
}

/** 读库里的简报；坏数据或按分钟预算的旧简报视为没有简报。 */
export function parseStoredBrief(json: string | null): InterviewBrief | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<InterviewBrief>;
    const usable =
      Array.isArray(value?.areas) &&
      value.areas.length > 0 &&
      value.areas.every((area) => typeof area.depth === "number") &&
      typeof value.turnRange?.min === "number" &&
      typeof value.turnRange?.max === "number";
    return usable ? (value as InterviewBrief) : null;
  } catch {
    return null;
  }
}
