import { z } from "zod";

import type { ProfileDimension } from "@/lib/candidate-profile/types";
import { isVerbatimEvidence } from "@/lib/text/evidence";
import { normalizedText } from "@/lib/text/similarity";

import type { MockInterviewJobBlueprint } from "../types";

/**
 * 面试简报（v5）：面试官的"备课"产物，替代预生成的题目清单。
 *
 * 用户只选节奏（快/中/长）。节奏决定备课的规划规模（预计回合、每领域深度上限、领域数下限）
 * 和面试中的信息量目标（见 evidence.ts）。面试的长短由信息量决定，不由回合数决定。
 *
 * v5 起备课是**广度优先**：每个领域一次机会（面试中不回访），所以宁可多几个方向、每个浅一点。
 * 领域的来源有两种：JD（绑定蓝图能力，并带 JD 原文逐字片段 jdEvidence）和岗位基线（baseline：
 * 模型从加载的技能包里补的"这个岗位通常会考的方向"）。每个简历项目最多一个领域，技术领域不挂在项目上。
 * 评分表按领域类型与风格由代码给定（开场前冻结，是公平性的锚点），
 * 简历假设逐字引用简历原文（硬门），切入问题与深度阶梯由模型给出。
 */

export const BRIEF_VERSION = 5;

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

/** 节奏 → 规划规模：预计回合（一个回合 = 面试官问一次）、每领域深度上限、领域数下限。 */
export const PACE_PLAN: Record<InterviewPace, { turns: number; maxDepth: number; minAreas: number }> = {
  quick: { turns: 10, maxDepth: 2, minAreas: 3 },
  standard: { turns: 20, maxDepth: 3, minAreas: 4 },
  deep: { turns: 32, maxDepth: 3, minAreas: 5 },
};

export function plannedTurnsForPace(pace: InterviewPace): number {
  return PACE_PLAN[pace].turns;
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
export const MAX_AREAS = 6;
/** 一个领域的预计回合：切入问题 + 追问；提示不占回合。 */
export function areaTurnCost(depth: number): number {
  return depth + 1;
}
/** 开场自我介绍占一个回合。 */
const OPENING_TURNS = 1;

export type RubricItem = { name: string; description: string; weight: number };

/**
 * 评分表维度 → 能力画像维度。评分表按名称固定（rubricForArea），画像从逐段评分推导观察时按此表归属；
 * "岗位关联"是项目与岗位的匹配度，不是候选人的稳定能力，不进画像。
 */
export const PROFILE_DIMENSION_BY_RUBRIC: Record<string, ProfileDimension | null> = {
  技术正确性: "knowledge_accuracy",
  准确性: "knowledge_accuracy",
  分析与取舍: "reasoning_depth",
  原理深度: "reasoning_depth",
  表达结构: "communication_clarity",
  复盘与表达: "communication_clarity",
  事实与细节: "experience_evidence",
  证据充分性: "experience_evidence",
  判断与反思: "reflection_growth",
  岗位关联: null,
};

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
        /** project 领域围绕哪个简历项目（projects[].id）；其他类型填 null。每个项目最多一个领域。 */
        projectId: z.string().min(1).max(60).nullable(),
        /** 绑定的蓝图能力（JD 来源）；基线领域可以为空。 */
        competencyIds: z.array(z.string().min(1).max(40)).max(6),
        /** JD 来源的领域从 JD 原文逐字截取的一句：这个领域考的是 JD 里的哪句话。基线领域填 null。 */
        jdEvidence: z.string().min(1).max(240).nullable(),
        /** 岗位基线来源：从哪个技能包的哪个主题补的；JD 来源的领域填 null。 */
        baseline: z
          .object({
            skill: z.string().min(1).max(64),
            topic: z.string().min(1).max(80),
          })
          .nullable(),
        /** 1–3，越大越重要；超预算时先砍权重低的，信息量也按它加权。 */
        weight: z.number().min(1).max(3),
        /** 打算追问几层（1–4）；超过节奏上限会被压回。 */
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
    .max(MAX_AREAS),
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
  /** 装箱时丢掉的领域名，报告页告诉用户"这场没问到"。 */
  droppedAreas: string[];
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

type PlannableArea = { name: string; weight: number; depth: number };

/**
 * 广度优先装箱：先把每个领域的深度压到节奏上限；装不下时先削最深的领域（保住领域数），
 * 领域都只剩 1 层还装不下才按权重丢掉权重最低的（同权丢模型排在后面的）。
 * 返回保留的领域（模型顺序）与丢掉的领域名。
 */
export function planAreas<T extends PlannableArea>(
  areas: T[],
  pace: InterviewPace,
  askIntro: boolean,
): { areas: T[]; dropped: string[] } {
  const plan = PACE_PLAN[pace];
  const kept = areas.slice(0, MAX_AREAS).map((area) => ({ ...area, depth: Math.max(1, Math.min(area.depth, plan.maxDepth)) }));
  const dropped = areas.slice(MAX_AREAS).map((area) => area.name);
  const over = () => plannedTurns(kept, askIntro) - plan.turns;

  while (over() > 0) {
    const deepest = kept.reduce<T | null>((top, area) => (area.depth > 1 && (!top || area.depth > top.depth) ? area : top), null);
    if (deepest) {
      deepest.depth -= 1;
      continue;
    }
    if (kept.length <= 1) break;
    let lowest = 0;
    for (let index = 1; index < kept.length; index += 1) {
      if (kept[index].weight <= kept[lowest].weight) lowest = index;
    }
    dropped.push(kept[lowest].name);
    kept.splice(lowest, 1);
  }
  return { areas: kept, dropped };
}

/** 风格只对 technical 有意义：technical 缺省为 scenario，其他类型一律 null。 */
function normalizeStyle(kind: AreaKind, style: AreaStyle | null | undefined): AreaStyle | null {
  if (kind !== "technical") return null;
  return style ?? "scenario";
}

const SECOND_PERSON_ANCHOR = /你(在|这个|做的|实习|简历|提到|写到|说到|把|们的|负责|参与|排查|重构)/;
const CJK_RUN = /[\p{Script=Han}]{4,}/gu;

/** 项目名与描述里的 4 字中文片段：切入问题里出现它们就是在拿简历项目当题。 */
function projectFingerprints(project: { name: string; description?: string }): string[] {
  const grams = new Set<string>();
  for (const run of `${project.name}\n${project.description ?? ""}`.match(CJK_RUN) ?? []) {
    for (let index = 0; index + 4 <= run.length; index += 1) grams.add(run.slice(index, index + 4));
  }
  return [...grams];
}

/**
 * 技术领域是否挂在简历项目上：直接点名项目，或者用第二人称（"你在 / 你把 / 你实习里…"）
 * 引出并且带着项目描述里的具体内容。纯场景题（"如果你在一个电商系统里…"）不算。
 */
function anchoredProject<T extends { id: string; name: string; description?: string }>(text: string, projects: T[]): T | null {
  const haystack = normalizedText(text);
  for (const project of projects) {
    const name = normalizedText(project.name);
    if (name.length >= 2 && haystack.includes(name)) return project;
  }
  if (!SECOND_PERSON_ANCHOR.test(text)) return null;
  return projects.find((project) => projectFingerprints(project).some((gram) => haystack.includes(normalizedText(gram)))) ?? null;
}

/**
 * 模型产出 → 冻结的简报。规则全部由代码把关：
 * - 每个简历项目最多一个 project 领域（projectId 去重，挂在不存在的项目上视为无项目）；
 * - technical 领域不挂在项目上：切入问题点名了简历项目、或用第二人称引出项目描述里的具体内容，就并入该项目的领域（没有时转成 project 领域），否则丢弃；
 * - JD 来源的领域必须带逐字的 jdEvidence，否则视为无来源；基线来源必须是本次加载过的技能包；
 * - 假设的简历证据必须逐字出现在简历里；
 * - 最后按节奏装箱，丢掉的领域名记进 droppedAreas。
 */
export function buildBriefFromOutput(input: {
  output: BriefOutput;
  blueprint: MockInterviewJobBlueprint;
  jobDescription: string;
  resumeText: string;
  projects: { id: string; name: string; description?: string }[];
  loadedSkills: string[];
  pace: InterviewPace;
  round: string | null;
  askIntro: boolean;
}): InterviewBrief {
  const competencyIds = new Set(input.blueprint.competencies.map((item) => item.id));
  const loadedSkills = new Set(input.loadedSkills);
  const resume = normalizedText(input.resumeText);
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const seenAreaIds = new Set<string>();
  const usedProjects = new Set<string>();
  const dropped: string[] = [];

  const candidates: InterviewArea[] = [];
  for (const raw of input.output.areas) {
    if (seenAreaIds.has(raw.id)) continue;
    seenAreaIds.add(raw.id);
    let kind: AreaKind = raw.kind;
    let projectId = raw.projectId && projectsById.has(raw.projectId) ? raw.projectId : null;
    if (kind !== "project") {
      const mentioned = anchoredProject(`${raw.name}\n${raw.entryQuestion}`, input.projects);
      if (mentioned) {
        // 技术领域点名了简历项目：它其实是项目题，按项目领域处理。
        kind = "project";
        projectId = mentioned.id;
      }
    }
    if (kind === "project") {
      if (!projectId || usedProjects.has(projectId)) {
        dropped.push(raw.name);
        continue;
      }
      usedProjects.add(projectId);
    }
    const style = normalizeStyle(kind, raw.style);
    const boundCompetencies = raw.competencyIds.filter((id) => competencyIds.has(id));
    const jdEvidence = raw.jdEvidence && isVerbatimEvidence(input.jobDescription, raw.jdEvidence) ? raw.jdEvidence : null;
    candidates.push({
      ...raw,
      kind,
      style,
      projectId: kind === "project" ? projectId : null,
      competencyIds: jdEvidence ? boundCompetencies : [],
      jdEvidence,
      baseline: raw.baseline && loadedSkills.has(raw.baseline.skill) ? raw.baseline : null,
      rubric: rubricForArea(kind, style),
    });
  }

  const planned = planAreas(candidates, input.pace, input.askIntro);
  const areas = planned.areas;
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
    droppedAreas: [...dropped, ...planned.dropped],
    hypotheses,
    skillPacks: input.loadedSkills,
    source: "model",
  };
}

/**
 * 领域数不够节奏的下限时，用兜底简报里的领域补齐（不重复的能力、不重复的项目），再装一次箱。
 * 广度是底线：每个领域一次机会，方向太少一场就问不出东西。
 */
export function padAreas(brief: InterviewBrief, fallback: InterviewBrief): InterviewBrief {
  const minAreas = PACE_PLAN[brief.pace].minAreas;
  if (brief.areas.length >= minAreas) return brief;
  const used = new Set(brief.areas.flatMap((area) => area.competencyIds));
  const usedProjects = new Set(brief.areas.flatMap((area) => (area.projectId ? [area.projectId] : [])));
  const extras = fallback.areas.filter((area) => {
    if (brief.areas.some((item) => item.id === area.id)) return false;
    if (area.projectId) return !usedProjects.has(area.projectId);
    return !area.competencyIds.some((id) => used.has(id));
  });
  const planned = planAreas([...brief.areas, ...extras.slice(0, minAreas - brief.areas.length)], brief.pace, brief.askIntro);
  return {
    ...brief,
    areas: planned.areas,
    droppedAreas: [...brief.droppedAreas, ...planned.dropped],
    plannedTurns: plannedTurns(planned.areas, brief.askIntro),
  };
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
    .slice(0, MAX_AREAS - 1);
  const technical = core.map((competency, index) => ({
    id: `area-${index + 1}`,
    name: competency.name,
    kind: "technical" as const,
    style: "scenario" as const,
    description: competency.description,
    projectId: null,
    competencyIds: [competency.id],
    jdEvidence: competency.origin === "jd" ? competency.jdEvidence : null,
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
          projectId: project.id,
          competencyIds: [] as string[],
          jdEvidence: null,
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
  const planned = planAreas(areasRaw, input.pace, input.askIntro);
  const areas = planned.areas.map((area) => ({ ...area, rubric: rubricForArea(area.kind, area.style) }));
  return {
    version: BRIEF_VERSION,
    pace: input.pace,
    plannedTurns: plannedTurns(areas, input.askIntro),
    round: input.round,
    askIntro: input.askIntro,
    areas,
    droppedAreas: planned.dropped,
    hypotheses: [],
    skillPacks: [],
    source: "fallback",
  };
}

/**
 * 读库里的简报。v4（无 projectId / jdEvidence / droppedAreas）、v3（turnRange、领域无 weight）与
 * v2（无 version、阶梯是字符串数组）只读兼容，归一化成 v5 的形状；更早的按分钟预算的简报视为没有简报。
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
        projectId: area.projectId ?? null,
        competencyIds: area.competencyIds ?? [],
        jdEvidence: area.jdEvidence ?? null,
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
      droppedAreas: Array.isArray(value.droppedAreas) ? value.droppedAreas : [],
    };
  } catch {
    return null;
  }
}
