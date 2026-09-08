import { z } from "zod";

import { normalizedText } from "@/lib/text/similarity";

import type { MockInterviewJobBlueprint } from "../types";

/**
 * 面试简报（v4）：面试官的"备课"产物，替代预生成的题目清单。
 *
 * 用户只选节奏（快/中/长）。节奏决定两件事：备课时的规划规模（预计回合，用来把
 * 领域装箱）和面试中的信息量目标（见 evidence.ts）。面试的长短由信息量决定，
 * 不由回合数决定；预计回合只用于规划和安全上限。
 *
 * 领域的来源有两种：JD（绑定蓝图能力 competencyIds）和岗位基线（baseline：
 * 模型从加载的技能包里补的"这个岗位通常会考的方向"）。基线只补空，不盖 JD。
 * 评分表按领域类型与风格由代码给定（开场前冻结，是公平性的锚点），
 * 简历假设逐字引用简历原文（硬门），切入问题与深度阶梯由模型给出。
 */

export const BRIEF_VERSION = 4;

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

/** 节奏 → 备课的规划规模（预计回合上限，一个回合 = 面试官问一次）。 */
export function plannedTurnsForPace(pace: InterviewPace): number {
  switch (pace) {
    case "quick":
      return 10;
    case "deep":
      return 32;
    default:
      return 20;
  }
}

/**
 * 节奏 → 信息量目标：快速是"最重要的领域摸清楚"，深入是"所有领域到目标深度
 * 且假设基本验证完"。数字是拍的，跑几场再调。
 */
export function evidenceTargetForPace(pace: InterviewPace): number {
  switch (pace) {
    case "quick":
      return 0.6;
    case "deep":
      return 0.9;
    default:
      return 0.75;
  }
}

export const AREA_KINDS = ["technical", "project", "behavioral"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

/** technical 领域的风格：从场景切入，或直接考课纲式的原理与知识点。 */
export const AREA_STYLES = ["scenario", "fundamentals"] as const;
export type AreaStyle = (typeof AREA_STYLES)[number];
export const AREA_STYLE_LABELS: Record<AreaStyle, string> = {
  scenario: "场景题",
  fundamentals: "基础题",
};

/** 阶梯每一级的风格：模型备课时标注，面试中作为追问风格的参考。 */
export const LADDER_STYLES = ["fact", "principle", "scenario", "tradeoff"] as const;
export type LadderStyle = (typeof LADDER_STYLES)[number];

export const MAX_AREA_DEPTH = 4;
/** 一个领域的预计回合：切入问题 + 追问 + 一次提示余量。 */
export function areaTurnCost(depth: number): number {
  return depth + 2;
}
/** 开场自我介绍占一个回合。 */
const OPENING_TURNS = 1;

export type RubricItem = { name: string; description: string; weight: number };

/** 领域评分表：按类型与风格固定，同一份 JD 生成同一套，评分只对照它。 */
export function rubricForArea(kind: AreaKind, style: AreaStyle | null): RubricItem[] {
  if (kind === "project") {
    return [
      { name: "事实与细节", description: "回答包含可核验的个人职责、技术决策和实施细节。", weight: 40 },
      { name: "岗位关联", description: "能将项目经验映射到目标岗位的实际职责。", weight: 35 },
      { name: "复盘与表达", description: "结构清晰，并能说明结果、取舍和改进。", weight: 25 },
    ];
  }
  if (kind === "technical") {
    if (style === "fundamentals") {
      return [
        { name: "准确性", description: "概念、机制与边界条件说得准确，没有似是而非。", weight: 60 },
        { name: "原理深度", description: "能讲清为什么，而不只是是什么。", weight: 25 },
        { name: "表达结构", description: "回答层次清楚，结论有依据。", weight: 15 },
      ];
    }
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

/** 发给模型的简报 schema：严格模式，全部字段 required，可空用 nullable。 */
export const briefOutputSchema = z.object({
  areas: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().min(1).max(60),
        kind: z.enum(AREA_KINDS),
        /** 只有 technical 领域有意义；其他类型填 null。 */
        style: z.enum(AREA_STYLES).nullable(),
        description: z.string().min(1).max(300),
        /** 绑定的蓝图能力（JD 来源）；基线领域可以为空。 */
        competencyIds: z.array(z.string().min(1).max(40)).max(6),
        /** 岗位基线来源：从哪个技能包的哪个主题补的；JD 来源的领域填 null。 */
        baseline: z
          .object({
            skill: z.string().min(1).max(64),
            topic: z.string().min(1).max(80),
          })
          .nullable(),
        /** 1–3，越大越重要；超预算时先砍权重低的，信息量也按它加权。 */
        weight: z.number().min(1).max(3),
        /** 打算追问几层（1–4）：重要的领域深挖，次要的浅问一层。 */
        depth: z.number().int().min(1).max(MAX_AREA_DEPTH),
        entryQuestion: z.string().min(1).max(500),
        /** 深度阶梯：每级一句"往下追什么"，并标出这一级的风格。 */
        ladder: z
          .array(
            z.object({
              text: z.string().min(1).max(200),
              style: z.enum(LADDER_STYLES),
            }),
          )
          .min(1)
          .max(MAX_AREA_DEPTH),
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

export type LadderRung = { text: string; style: LadderStyle | null };

export type InterviewArea = Omit<BriefOutput["areas"][number], "ladder"> & {
  ladder: LadderRung[];
  rubric: RubricItem[];
};
export type InterviewHypothesis = BriefOutput["hypotheses"][number];

export type InterviewBrief = {
  version: typeof BRIEF_VERSION;
  pace: InterviewPace;
  /** 备课的预计回合（开场 + 各领域），只用于安全上限，不是面试的边界。 */
  plannedTurns: number;
  round: string | null;
  askIntro: boolean;
  areas: InterviewArea[];
  hypotheses: InterviewHypothesis[];
  /** 备课时模型实际加载的技能包。 */
  skillPacks: string[];
  /** 简报是模型产出还是代码兜底。 */
  source: "model" | "fallback";
};

/** 整份计划的预计回合：开场 + 各领域。 */
export function plannedTurns(areas: { depth: number }[], askIntro: boolean): number {
  return (askIntro ? OPENING_TURNS : 0) + areas.reduce((sum, area) => sum + areaTurnCost(area.depth), 0);
}

function isEvidence(haystack: string, excerpt: string): boolean {
  const needle = normalizedText(excerpt);
  return needle.length >= 4 && haystack.includes(needle);
}

/**
 * 把领域装进规划规模：按权重从高到低收，装不下的丢掉（同权保留模型顺序），
 * 至少保留一个；最后恢复模型给的顺序。
 */
function fitAreas<T extends { weight: number; depth: number }>(areas: T[], maxTurns: number, askIntro: boolean): T[] {
  const ranked = areas
    .map((area, index) => ({ area, index }))
    .sort((a, b) => b.area.weight - a.area.weight || a.index - b.index);
  const kept: { area: T; index: number }[] = [];
  let used = plannedTurns([], askIntro);
  for (const entry of ranked) {
    const cost = areaTurnCost(entry.area.depth);
    if (kept.length > 0 && used + cost > maxTurns) continue;
    kept.push(entry);
    used += cost;
  }
  return kept.sort((a, b) => a.index - b.index).map(({ area }) => area);
}

/** 风格只对 technical 有意义：technical 缺省为 scenario，其他类型一律 null。 */
function normalizeStyle(kind: AreaKind, style: AreaStyle | null | undefined): AreaStyle | null {
  if (kind !== "technical") return null;
  return style ?? "scenario";
}

/**
 * 模型产出 → 冻结的简报。领域引用的能力 ID 必须真实存在（不存在的丢掉）；
 * 基线来源必须是本次加载过的技能包（否则视为无来源）；
 * 假设的简历证据必须逐字出现在简历里（硬门）。
 */
export function buildBriefFromOutput(input: {
  output: BriefOutput;
  blueprint: MockInterviewJobBlueprint;
  resumeText: string;
  loadedSkills: string[];
  pace: InterviewPace;
  round: string | null;
  askIntro: boolean;
}): InterviewBrief {
  const competencyIds = new Set(input.blueprint.competencies.map((item) => item.id));
  const loadedSkills = new Set(input.loadedSkills);
  const resume = normalizedText(input.resumeText);
  const seenAreaIds = new Set<string>();
  const unique = input.output.areas.filter((area) => {
    if (seenAreaIds.has(area.id)) return false;
    seenAreaIds.add(area.id);
    return true;
  });
  const areas: InterviewArea[] = fitAreas(unique, plannedTurnsForPace(input.pace), input.askIntro).map((area) => {
    const style = normalizeStyle(area.kind, area.style);
    return {
      ...area,
      style,
      competencyIds: area.competencyIds.filter((id) => competencyIds.has(id)),
      baseline: area.baseline && loadedSkills.has(area.baseline.skill) ? area.baseline : null,
      rubric: rubricForArea(area.kind, style),
    };
  });
  const areaIds = new Set(areas.map((area) => area.id));
  const hypotheses = input.output.hypotheses
    .filter((item) => isEvidence(resume, item.evidence))
    .map((item) => ({ ...item, areaId: item.areaId && areaIds.has(item.areaId) ? item.areaId : null }));

  return {
    version: BRIEF_VERSION,
    pace: input.pace,
    plannedTurns: plannedTurns(areas, input.askIntro),
    round: input.round,
    askIntro: input.askIntro,
    areas,
    hypotheses,
    skillPacks: input.loadedSkills,
    source: "model",
  };
}

/**
 * 模型只给了一个领域时补一个兜底领域（不同 kind 优先），深度按剩余预算缩到装得下，必要时先压缩第一个领域。
 * 一个领域的面试只要一条线程失守就会结束，两个领域是底线。
 */
export function ensureTwoAreas(brief: InterviewBrief, fallback: InterviewBrief): InterviewBrief {
  if (brief.areas.length !== 1) return brief;
  const first = brief.areas[0];
  const extra =
    fallback.areas.find((area) => area.kind !== first.kind && area.id !== first.id) ??
    fallback.areas.find((area) => area.id !== first.id);
  if (!extra) return brief;
  const maxTurns = plannedTurnsForPace(brief.pace);
  const minimumCost = areaTurnCost(1);
  let primary = first;
  if (maxTurns - brief.plannedTurns < minimumCost) {
    primary = { ...first, depth: Math.max(1, first.depth - (minimumCost - (maxTurns - brief.plannedTurns))) };
  }
  const room = maxTurns - plannedTurns([primary], brief.askIntro);
  const areas = [primary, { ...extra, depth: Math.max(1, Math.min(extra.depth, room - 2)) }];
  return { ...brief, areas, plannedTurns: plannedTurns(areas, brief.askIntro) };
}

const FALLBACK_LADDER: LadderRung[] = [
  { text: "先说清楚做了什么", style: "fact" },
  { text: "追问背后的原理和为什么这样选", style: "principle" },
  { text: "追问一次真实的排查或失败", style: "scenario" },
  { text: "追问如果条件变了会怎么取舍", style: "tradeoff" },
];

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
}): InterviewBrief {
  const core = input.blueprint.competencies
    .filter((item) => item.priority === "core")
    .concat(input.blueprint.competencies.filter((item) => item.priority !== "core"))
    .slice(0, 4);
  const technical = core.map((competency, index) => ({
    id: `area-${index + 1}`,
    name: competency.name,
    kind: "technical" as const,
    style: "scenario" as const,
    description: competency.description,
    competencyIds: [competency.id],
    baseline: null,
    weight: 2,
    depth: 2,
    entryQuestion: `请结合你的经历谈谈${competency.name}：你在哪个场景里真正用到了它，遇到过什么具体问题？`,
    ladder: FALLBACK_LADDER,
    expectedSignals: ["具体场景", "机制与原理", "取舍"],
  }));
  const project = input.projects[0];
  const areasRaw = project
    ? [
        {
          id: "area-project",
          name: `项目深挖：${project.name}`,
          kind: "project" as const,
          style: null,
          description: "围绕候选人简历上的项目追问职责、决策与结果",
          competencyIds: [] as string[],
          baseline: null,
          weight: 3,
          depth: 3,
          entryQuestion: `先介绍你在「${project.name}」里具体负责的部分，以及做过的最难的一个决策。`,
          ladder: [
            { text: "职责边界", style: "fact" as const },
            { text: "为什么这样设计、还考虑过什么", style: "principle" as const },
            { text: "出过什么问题、怎么定位", style: "scenario" as const },
            { text: "数字怎么来的、如果 X 变了怎么改", style: "tradeoff" as const },
          ],
          expectedSignals: ["个人职责", "技术决策", "结果与复盘"],
        },
        ...technical,
      ]
    : technical;
  const areas = fitAreas(areasRaw, plannedTurnsForPace(input.pace), input.askIntro).map((area) => ({
    ...area,
    rubric: rubricForArea(area.kind, area.style),
  }));
  return {
    version: BRIEF_VERSION,
    pace: input.pace,
    plannedTurns: plannedTurns(areas, input.askIntro),
    round: input.round,
    askIntro: input.askIntro,
    areas,
    hypotheses: [],
    skillPacks: [],
    source: "fallback",
  };
}

/**
 * 读库里的简报。v3（turnRange、领域无 weight）与 v2（无 version、阶梯是字符串数组）
 * 只读兼容，归一化成 v4 的形状；更早的按分钟预算的简报视为没有简报。
 */
export function parseStoredBrief(json: string | null): InterviewBrief | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<InterviewBrief> & {
      turnRange?: { min?: unknown; max?: unknown };
      areas?: Array<Partial<InterviewArea> & { ladder?: unknown }>;
    };
    const legacyMax = typeof value.turnRange?.max === "number" ? value.turnRange.max : null;
    const usable =
      Array.isArray(value?.areas) &&
      value.areas.length > 0 &&
      value.areas.every((area) => typeof area.depth === "number") &&
      (typeof value.plannedTurns === "number" || legacyMax !== null);
    if (!usable) return null;
    const areas: InterviewArea[] = value.areas!.map((area) => {
      const kind = area.kind ?? "technical";
      const style = normalizeStyle(kind, area.style ?? null);
      const ladder: LadderRung[] = Array.isArray(area.ladder)
        ? area.ladder.map((rung) =>
            typeof rung === "string"
              ? { text: rung, style: null }
              : { text: String((rung as LadderRung).text ?? ""), style: (rung as LadderRung).style ?? null },
          )
        : [];
      return {
        ...(area as InterviewArea),
        kind,
        style,
        weight: typeof area.weight === "number" ? area.weight : 2,
        baseline: area.baseline ?? null,
        ladder,
        rubric: area.rubric ?? rubricForArea(kind, style),
      };
    });
    return {
      ...(value as InterviewBrief),
      version: BRIEF_VERSION,
      plannedTurns: typeof value.plannedTurns === "number" ? value.plannedTurns : legacyMax!,
      areas,
    };
  } catch {
    return null;
  }
}
