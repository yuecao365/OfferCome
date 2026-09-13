import { z } from "zod";

import type { ProfileDimension } from "@/lib/candidate-profile/types";
import { isVerbatimEvidence } from "@/lib/text/evidence";
import { normalizedText } from "@/lib/text/similarity";

import type { SkillTopic } from "../skills/topics";
import type { MockInterviewJobBlueprint } from "../types";

/**
 * 面试简报（v6）：面试官的"备课"产物，按真实一面的阶段组织。
 *
 * 一场面试 = 开场 → 项目深挖 → 基础快问 → 场景题 → 收尾。预算按阶段分（回合数），
 * 不按题目分；阶段内的方法各不相同：项目顺着候选人的话追（最多 3 层），基础题一题一问
 * （最多追 1 层，答不上就下一题），场景题引导式（最多 3 层）。深度不预设，由回答决定。
 *
 * 简报里的每个"领域"就是一道题的材料：项目领域带想验证的线索，基础题带一个追问方向，
 * 场景题带引导阶梯。基础题的主题由代码从技能包抽样（skills/topics.ts），模型只写题。
 * 评分表按阶段固定，简历假设逐字引用简历原文（硬门）。
 */

export const BRIEF_VERSION = 6;

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

export const AREA_KINDS = ["project", "quick", "scenario"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];
export const AREA_KIND_LABELS: Record<AreaKind, string> = {
  project: "项目深挖",
  quick: "基础快问",
  scenario: "场景题",
};
/** 阶段顺序：自我介绍之后先进项目，再问基础，最后一道场景题。 */
export const PHASE_ORDER: readonly AreaKind[] = ["project", "quick", "scenario"];

export function isAreaKind(value: unknown): value is AreaKind {
  return typeof value === "string" && (AREA_KINDS as readonly string[]).includes(value);
}

/** 各阶段的提问回合预算；开场自我介绍另占 1 回合。 */
export type PhaseBudget = Record<AreaKind, number>;

/**
 * 节奏 → 阶段预算与场景题数。项目占三到四成、基础题占三成多，与公开面经里的一面结构一致。
 * 预算是软的：一个阶段提前结束，剩余回合顺延给下一阶段。
 */
export const PACE_PLAN: Record<InterviewPace, { budget: PhaseBudget; scenarios: number }> = {
  quick: { budget: { project: 5, quick: 4, scenario: 2 }, scenarios: 1 },
  standard: { budget: { project: 8, quick: 7, scenario: 3 }, scenarios: 1 },
  deep: { budget: { project: 13, quick: 10, scenario: 7 }, scenarios: 2 },
};

/** 每种线程最多追问几层：基础题一题一问，项目与场景题最多三层。 */
export const PROBE_LIMIT: Record<AreaKind, number> = { project: 3, quick: 1, scenario: 3 };
/** 总分按线程所属阶段加权：项目 3、场景 2、基础 1。 */
export const KIND_WEIGHT: Record<AreaKind, number> = { project: 3, quick: 1, scenario: 2 };

export const MAX_PROJECT_AREAS = 2;
export const MAX_HYPOTHESES = 6;
/** 题池比基础阶段的预算大一倍，永远不会没题；上限防止提示词过长。 */
const POOL_MIN = 8;
const POOL_MAX = 16;
const OPENING_TURNS = 1;

export function poolSizeFor(pace: InterviewPace): number {
  return Math.min(POOL_MAX, Math.max(POOL_MIN, PACE_PLAN[pace].budget.quick * 2));
}

/** 整场的预计提问回合：开场 + 各阶段预算；只用于安全上限与进度显示。 */
export function plannedTurns(brief: Pick<InterviewBrief, "plan" | "askIntro">): number {
  return (brief.askIntro ? OPENING_TURNS : 0) + PHASE_ORDER.reduce((sum, kind) => sum + brief.plan[kind], 0);
}

/** 每个简历项目最多几个领域：只有一个项目时给两个（不同模块 / 决策），项目才占得到真实一面的三四成。 */
export function maxAreasPerProject(projectCount: number): number {
  return projectCount < 2 ? MAX_PROJECT_AREAS : 1;
}

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

export const HR_ROUND = "hr_interview";

/** 领域评分表：按阶段固定；HR 面的基础题与场景题考软素质，用行为评分表。 */
export function rubricForArea(kind: AreaKind, round: string | null): RubricItem[] {
  if (kind === "project") {
    return [
      { name: "事实与细节", description: "回答包含可核验的个人职责、技术决策和实施细节。", weight: 40 },
      { name: "岗位关联", description: "能将项目经验映射到目标岗位的实际职责。", weight: 35 },
      { name: "复盘与表达", description: "结构清晰，并能说明结果、取舍和改进。", weight: 25 },
    ];
  }
  if (round === HR_ROUND) {
    return [
      { name: "证据充分性", description: "使用具体情境、行动和结果支持回答。", weight: 45 },
      { name: "判断与反思", description: "说明决策依据、协作方式和复盘改进。", weight: 30 },
      { name: "表达结构", description: "回答重点明确、逻辑连贯。", weight: 25 },
    ];
  }
  if (kind === "quick") {
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

const signals = z.array(z.string().min(1).max(200)).min(1).max(5);

/** 发给模型的简报 schema：严格模式，全部字段 required，可空用 nullable。 */
export const briefOutputSchema = z.object({
  projects: z
    .array(
      z.object({
        /** projects[].id；同一个项目最多两个切入点（简历只有一个项目时）。 */
        projectId: z.string().min(1).max(60),
        /** 这个切入点叫什么，例如"Study Assistant：Harness 主循环"。 */
        name: z.string().min(1).max(60),
        entryQuestion: z.string().min(1).max(500),
        /** 想验证的点：追问时拿着它们顺着候选人的话去验。 */
        leads: z.array(z.string().min(1).max(200)).min(1).max(4),
        expectedSignals: signals,
      }),
    )
    .max(MAX_PROJECT_AREAS),
  quick: z
    .array(
      z.object({
        /** 逐字使用抽样主题名。 */
        topic: z.string().min(1).max(80),
        question: z.string().min(1).max(400),
        /** 答得实质时唯一的一层追问往哪问。 */
        followUp: z.string().min(1).max(200),
        expectedSignals: signals,
      }),
    )
    .max(POOL_MAX),
  scenarios: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        competencyIds: z.array(z.string().min(1).max(40)).max(4),
        /** 从 JD 原文逐字截取的一句：这道场景题落在 JD 的哪句话上；不来自 JD 时为 null。 */
        jdEvidence: z.string().min(1).max(240).nullable(),
        question: z.string().min(1).max(600),
        /** 引导阶梯：候选人卡住或答到一层时，下一步往哪引。 */
        guides: z.array(z.string().min(1).max(200)).min(1).max(3),
        expectedSignals: signals,
      }),
    )
    .max(2),
  hypotheses: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        /** 要验证什么，例如"简历称 prompt 长度降低约 50%，验证度量方法与基线"。 */
        text: z.string().min(1).max(300),
        /** 简历原文逐字片段。 */
        evidence: z.string().min(1).max(300),
        /** 属于哪个简历项目（projects[].id）；对不上时由代码按简历段落归属。 */
        projectId: z.string().min(1).max(60).nullable(),
      }),
    )
    .max(MAX_HYPOTHESES),
});
export type BriefOutput = z.infer<typeof briefOutputSchema>;

/** 一道题的材料：项目切入点、基础题或场景题。 */
export type InterviewArea = {
  id: string;
  kind: AreaKind;
  name: string;
  /** project 领域围绕哪个简历项目。 */
  projectId: string | null;
  /** 场景题绑定的岗位能力与 JD 原句；基础题与项目题为空。 */
  competencyIds: string[];
  jdEvidence: string | null;
  /** 基础题来自哪个技能包的哪个主题。 */
  topic: { skill: string; name: string } | null;
  entryQuestion: string;
  /** project：想验证的线索；quick：唯一一层追问的方向；scenario：引导阶梯。 */
  guides: string[];
  expectedSignals: string[];
  rubric: RubricItem[];
};

export type InterviewHypothesis = { id: string; text: string; evidence: string; areaId: string | null };

export type InterviewBrief = {
  version: typeof BRIEF_VERSION;
  pace: InterviewPace;
  /** 各阶段的提问回合预算。 */
  plan: PhaseBudget;
  round: string | null;
  askIntro: boolean;
  /** 项目切入点在前，然后是题池，最后是场景题。 */
  areas: InterviewArea[];
  hypotheses: InterviewHypothesis[];
  /** 备课用到的技能包；面试中可查。 */
  skillPacks: string[];
  /** 简报是模型产出还是代码兜底。 */
  source: "model" | "fallback";
};

function isEvidence(haystack: string, excerpt: string): boolean {
  const needle = normalizedText(excerpt);
  return needle.length >= 4 && haystack.includes(needle);
}

/** 可量化的成果：带单位的数字，或成果动词。日期里的数字不算。 */
const METRIC_PATTERN = /\d+(\.\d+)?\s*(%|％|倍|x|ms|毫秒|秒|万|亿|条|次|天|qps|tps|k\b)/i;
const OUTCOME_PATTERN = /提升|降低|下降|减少|优化|增长|提高|达到|支撑|覆盖|从零|独立|主导|压缩|缩短|节省/;
const DATE_PATTERN = /\d{4}\s*年|\d{4}[.\-/]\d{1,2}|至今|现在$/;
const MAX_EVIDENCE_CHARS = 120;
const CJK_RUN = /[\p{Script=Han}]{4,}/gu;

/** 项目名与描述里的 4 字中文片段：找不到项目名时用它们定位简历里属于这个项目的句子。 */
function projectFingerprints(project: { name: string; description?: string }): string[] {
  const grams = new Set<string>();
  for (const run of `${project.name}\n${project.description ?? ""}`.match(CJK_RUN) ?? []) {
    for (let index = 0; index + 4 <= run.length; index += 1) grams.add(run.slice(index, index + 4));
  }
  return [...grams];
}

/**
 * 简历里属于这个项目的段落：从项目名出现处到下一个项目名出现处；找不到项目名时退回
 * "提到项目描述里 4 字片段的句子"。
 */
function projectSentences(resumeText: string, project: { name: string; description?: string }, others: { name: string }[] = []): string[] {
  const start = resumeText.indexOf(project.name);
  let section = resumeText;
  if (start >= 0) {
    const ends = others
      .filter((other) => other.name !== project.name)
      .map((other) => resumeText.indexOf(other.name, start + project.name.length))
      .filter((index) => index > start);
    section = resumeText.slice(start, ends.length > 0 ? Math.min(...ends) : undefined);
  }
  const fingerprints = projectFingerprints(project);
  return section
    .split(/[\n。；;！!？?]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 6)
    .filter((sentence) => start >= 0 || fingerprints.some((gram) => normalizedText(sentence).includes(normalizedText(gram))));
}

/**
 * project 领域没有假设时的兜底：在简历里这个项目的段落中找带可量化成果或成果动词的一句，
 * 逐字作为 evidence，让每个项目线程都有东西可对质。只有标题行（带日期）或什么都找不到时不补。
 */
export function fallbackHypothesis(
  resumeText: string,
  area: { id: string },
  project: { name: string; description?: string },
  others: { name: string }[] = [],
): InterviewHypothesis | null {
  const claims = projectSentences(resumeText, project, others).filter((sentence) => !DATE_PATTERN.test(sentence));
  const evidence = (claims.find((sentence) => METRIC_PATTERN.test(sentence)) ?? claims.find((sentence) => OUTCOME_PATTERN.test(sentence)))?.slice(0, MAX_EVIDENCE_CHARS);
  if (!evidence) return null;
  return {
    id: `H-${area.id}`,
    text: `简历写「${evidence}」：问是怎么做的、怎么量的、基线是什么、哪部分是本人做的`,
    evidence,
    areaId: area.id,
  };
}

type Project = { id: string; name: string; description?: string };

const PROJECT_LEADS = ["你负责的是哪一部分，边界在哪", "为什么这么设计、还考虑过什么方案", "出过什么问题、怎么定位的", "简历上的数字怎么来的"];
const PROJECT_SIGNALS = ["个人职责", "技术决策与取舍", "结果与复盘"];
/** 同一个项目的两个兜底切入点：先问职责与决策，再问事故与复盘。 */
const PROJECT_ANGLES = [
  { suffix: "职责与决策", question: (name: string) => `先说说你在「${name}」里具体负责的部分，以及做过的最难的一个决策。` },
  { suffix: "问题与复盘", question: (name: string) => `「${name}」上线或自测时出过什么问题，你是怎么定位和修的？` },
];

function fallbackProjectArea(project: Project, id: string, round: string | null, angle = 0): InterviewArea {
  const { suffix, question } = PROJECT_ANGLES[Math.min(angle, PROJECT_ANGLES.length - 1)];
  return {
    id,
    kind: "project",
    name: angle > 0 ? `${project.name}：${suffix}` : project.name,
    projectId: project.id,
    competencyIds: [],
    jdEvidence: null,
    topic: null,
    entryQuestion: question(project.name),
    guides: PROJECT_LEADS,
    expectedSignals: PROJECT_SIGNALS,
    rubric: rubricForArea("project", round),
  };
}

/**
 * 项目切入点不够时补齐：项目阶段的预算按两个切入点算，模型只给一个就问不满；
 * 按项目顺序、每个项目最多 maxAreasPerProject 个，用兜底的切入点补到上限。
 */
function padProjectAreas(areas: InterviewArea[], projects: Project[], round: string | null): InterviewArea[] {
  const perProject = maxAreasPerProject(projects.length);
  const padded = [...areas];
  for (const project of projects) {
    while (padded.length < MAX_PROJECT_AREAS) {
      const angle = padded.filter((area) => area.projectId === project.id).length;
      if (angle >= perProject) break;
      padded.push(fallbackProjectArea(project, `p${padded.length + 1}`, round, angle));
    }
  }
  return padded;
}

/** 好题第一句作兜底题目：包里的好题常带两三个问号，基础题只取第一个。 */
function firstQuestion(example: string): string {
  const match = example.match(/^[^？?]+[？?]/);
  return (match ? match[0] : example).trim();
}

function quickArea(topic: SkillTopic, id: string, round: string | null, written: { question: string; followUp: string; expectedSignals: string[] } | null): InterviewArea {
  return {
    id,
    kind: "quick",
    name: topic.name,
    projectId: null,
    competencyIds: [],
    jdEvidence: null,
    topic: { skill: topic.skill, name: topic.name },
    entryQuestion: written?.question ?? firstQuestion(topic.example),
    guides: [written?.followUp ?? topic.ladder.split("→")[1]?.trim() ?? "追问它的原理与边界"],
    expectedSignals: written?.expectedSignals ?? [topic.signals],
    rubric: rubricForArea("quick", round),
  };
}

function fallbackScenarioArea(blueprint: MockInterviewJobBlueprint, id: string, round: string | null): InterviewArea {
  const competency = blueprint.competencies.find((item) => item.priority === "core") ?? blueprint.competencies[0] ?? null;
  return {
    id,
    kind: "scenario",
    name: competency ? `场景：${competency.name}` : "场景题",
    projectId: null,
    competencyIds: competency ? [competency.id] : [],
    jdEvidence: competency?.origin === "jd" ? competency.jdEvidence : null,
    topic: null,
    entryQuestion: competency
      ? `如果你加入后第一个任务是${competency.description || competency.name}，先要弄清楚哪几件事，你会怎么排优先级？`
      : "如果你接手一个刚上线就频繁出问题的系统，你会从哪里开始排查，怎么决定先修什么？",
    guides: ["追问它为什么先做这件事", "追问如果条件变了（规模、时间、人手）怎么取舍", "追问怎么验证做对了"],
    expectedSignals: ["有明确的排查或推进顺序", "说得出取舍依据", "有验证方式"],
    rubric: rubricForArea("scenario", round),
  };
}

/** 模型没挂项目的假设：证据句落在简历里哪个项目的段落（最近一个在它前面出现的项目名），就挂到那个项目上。 */
function attachHypothesis(resume: string, evidence: string, areasByProject: Map<string, string>, projectsById: Map<string, Project>): string | null {
  const at = resume.indexOf(normalizedText(evidence));
  let owner: { areaId: string; start: number } | null = null;
  for (const [projectId, areaId] of areasByProject) {
    const name = normalizedText(projectsById.get(projectId)?.name ?? "");
    const start = name.length >= 2 ? resume.lastIndexOf(name, at) : -1;
    if (start >= 0 && start < at && (!owner || start > owner.start)) owner = { areaId, start };
  }
  return owner?.areaId ?? null;
}

/**
 * 模型产出 → 冻结的简报。规则全部由代码把关：
 * - 项目切入点最多两个，projectId 必须存在，每个项目最多 maxAreasPerProject 个；不够两个时用兜底切入点补齐（项目阶段的预算按两个算）；
 * - 基础题池 = 抽样的主题，一个主题一道：模型没写的用包里的好题；模型写了不在抽样里的主题丢弃；
 * - 场景题数按节奏，JD 原句必须逐字，能力 id 必须在蓝图里；不够时代码兜底；
 * - 假设的简历证据必须逐字出现在简历里；每个项目切入点至少一条，没有就从简历里兜底。
 */
export function buildBriefFromOutput(input: {
  output: BriefOutput;
  blueprint: MockInterviewJobBlueprint;
  jobDescription: string;
  resumeText: string;
  projects: Project[];
  topics: SkillTopic[];
  skillPacks: string[];
  pace: InterviewPace;
  round: string | null;
  askIntro: boolean;
}): InterviewBrief {
  const { output, round } = input;
  const plan = PACE_PLAN[input.pace];
  const competencyIds = new Set(input.blueprint.competencies.map((item) => item.id));
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const resume = normalizedText(input.resumeText);
  const perProject = maxAreasPerProject(input.projects.length);

  const projects: InterviewArea[] = [];
  const perProjectCount = new Map<string, number>();
  for (const raw of output.projects) {
    const count = perProjectCount.get(raw.projectId) ?? 0;
    if (!projectsById.has(raw.projectId) || count >= perProject || projects.length >= MAX_PROJECT_AREAS) continue;
    perProjectCount.set(raw.projectId, count + 1);
    projects.push({
      id: `p${projects.length + 1}`,
      kind: "project",
      name: raw.name,
      projectId: raw.projectId,
      competencyIds: [],
      jdEvidence: null,
      topic: null,
      entryQuestion: raw.entryQuestion,
      guides: raw.leads,
      expectedSignals: raw.expectedSignals,
      rubric: rubricForArea("project", round),
    });
  }
  const projectAreas = padProjectAreas(projects, input.projects, round);

  const written = new Map(output.quick.map((item) => [normalizedText(item.topic), item]));
  const quick = input.topics.map((topic, index) => quickArea(topic, `q${index + 1}`, round, written.get(normalizedText(topic.name)) ?? null));

  const scenarios: InterviewArea[] = output.scenarios.slice(0, plan.scenarios).map((raw, index) => {
    const jdEvidence = raw.jdEvidence && isVerbatimEvidence(input.jobDescription, raw.jdEvidence) ? raw.jdEvidence : null;
    return {
      id: `s${index + 1}`,
      kind: "scenario",
      name: raw.name,
      projectId: null,
      competencyIds: raw.competencyIds.filter((id) => competencyIds.has(id)),
      jdEvidence,
      topic: null,
      entryQuestion: raw.question,
      guides: raw.guides,
      expectedSignals: raw.expectedSignals,
      rubric: rubricForArea("scenario", round),
    };
  });
  while (scenarios.length < plan.scenarios) scenarios.push(fallbackScenarioArea(input.blueprint, `s${scenarios.length + 1}`, round));

  // 假设挂到项目切入点上（同一项目的两个切入点挂第一个）。
  const areaByProject = new Map<string, string>();
  for (const area of projectAreas) if (area.projectId && !areaByProject.has(area.projectId)) areaByProject.set(area.projectId, area.id);
  const hypotheses: InterviewHypothesis[] = output.hypotheses
    .filter((item) => isEvidence(resume, item.evidence))
    .map((item) => ({
      id: item.id,
      text: item.text,
      evidence: item.evidence,
      areaId: (item.projectId && areaByProject.get(item.projectId)) || attachHypothesis(resume, item.evidence, areaByProject, projectsById),
    }));
  for (const area of projectAreas) {
    if (!area.projectId || hypotheses.some((item) => item.areaId === area.id)) continue;
    const fallback = fallbackHypothesis(input.resumeText, area, projectsById.get(area.projectId)!, input.projects);
    if (fallback && hypotheses.length < MAX_HYPOTHESES && !hypotheses.some((item) => item.evidence === fallback.evidence)) hypotheses.push(fallback);
  }

  return {
    version: BRIEF_VERSION,
    pace: input.pace,
    plan: plan.budget,
    round,
    askIntro: input.askIntro,
    areas: [...projectAreas, ...quick, ...scenarios],
    hypotheses: hypotheses.slice(0, MAX_HYPOTHESES),
    skillPacks: input.skillPacks,
    source: "model",
  };
}

/**
 * 兜底简报：模型没产出时按蓝图、简历项目与抽样主题直接搭。不可能失败，
 * 与蓝图的兜底同一哲学——降级产出，不把"请重试"丢给用户。
 */
export function fallbackBrief(input: {
  blueprint: MockInterviewJobBlueprint;
  projects: Project[];
  topics: SkillTopic[];
  skillPacks: string[];
  pace: InterviewPace;
  round: string | null;
  askIntro: boolean;
}): InterviewBrief {
  const plan = PACE_PLAN[input.pace];
  const projects = padProjectAreas([], input.projects, input.round);
  const quick = input.topics.map((topic, index) => quickArea(topic, `q${index + 1}`, input.round, null));
  const scenarios = Array.from({ length: plan.scenarios }, (_, index) => fallbackScenarioArea(input.blueprint, `s${index + 1}`, input.round));
  return {
    version: BRIEF_VERSION,
    pace: input.pace,
    plan: plan.budget,
    round: input.round,
    askIntro: input.askIntro,
    areas: [...projects, ...quick, ...scenarios],
    hypotheses: [],
    skillPacks: input.skillPacks,
    source: "fallback",
  };
}

/** 读库里的简报。只认 v6：更早的按领域清单组织的简报视为没有简报（那些会话只剩题目与评分可看）。 */
export function parseStoredBrief(json: string | null): InterviewBrief | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<InterviewBrief>;
    const usable =
      value.version === BRIEF_VERSION &&
      isInterviewPace(value.pace ?? "") &&
      value.plan !== undefined &&
      PHASE_ORDER.every((kind) => typeof value.plan?.[kind] === "number") &&
      Array.isArray(value.areas) &&
      value.areas.every((area) => isAreaKind(area.kind));
    return usable ? (value as InterviewBrief) : null;
  } catch {
    return null;
  }
}
