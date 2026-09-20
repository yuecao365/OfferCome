import { z } from "zod";

import type { ProfileDimension } from "@/lib/candidate-profile/types";
import { isVerbatimEvidence } from "@/lib/text/evidence";
import { denseText, normalizedText } from "@/lib/text/similarity";

import { QUOTA } from "@/lib/interview/progress";

import type { MockInterviewJobBlueprint } from "../types";

/**
 * 面试简报：面试官的"备课"产物（设计修订 v3 精简版）。
 *
 * 一场面试 = 开场 → 项目深挖 → 基础快问 → 场景题 → 收尾。材料只备三类，每类一道就是一份材料：
 * 每个项目一份（一句切入问法 + 最多 3 条要验证的线索；简历假设挂在项目上）、基础题按配额几道
 * （问什么由模型按这份 JD 与这份简历定，每道带依据：引用原文，或落差 / 模式这类推断）、场景题带三级引导阶梯。
 * 何时转题、追几句由面试中的状态与约束定，不在材料里。评分表按种类固定，简历假设逐字引用简历原文（硬门）。
 *
 * 旧简报（每个项目五个面）仍能读：area.angle 非空时按面的标签显示。
 */

export const BRIEF_VERSION = 8;

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
export function isAreaKind(value: unknown): value is AreaKind {
  return typeof value === "string" && (AREA_KINDS as readonly string[]).includes(value);
}

/**
 * 节奏 → 一场的总回合数（面试官说话的次数，含开场与收尾）与场景题数。
 * 总回合数是唯一的硬数字：用完就收尾；怎么分配由面试官的计划定。
 */
/** 每档备几道场景题（配额见 interview/progress.ts）。 */
export const SCENARIOS_PER_PACE: Record<InterviewPace, number> = {
  quick: 1,
  standard: 1,
  deep: 2,
};

/** 项目追问的角度（旧简报每个面一道材料；新简报只作线索与旧数据的标签）。 */
export const PROJECT_ANGLE_ORDER = ["overview", "module", "hardest", "outcome", "redo"] as const;
export type ProjectAngle = (typeof PROJECT_ANGLE_ORDER)[number];
export const PROJECT_ANGLES: Record<ProjectAngle, { label: string; question: (project: string) => string }> = {
  overview: { label: "背景与架构", question: (name) => `先整体讲讲「${name}」：它解决什么问题、架构是怎样的、你负责哪一块？` },
  module: { label: "模块深挖", question: (name) => `挑「${name}」里你负责的一个模块，讲讲它具体是怎么实现的？` },
  hardest: { label: "最难的问题", question: (name) => `做「${name}」的过程中最难、花时间最久的一个问题是什么，你是怎么定位和解决的？` },
  outcome: { label: "效果与预期", question: (name) => `「${name}」达到你的预期了吗？预期是什么、怎么量的？` },
  redo: { label: "取舍与重做", question: (name) => `如果重做「${name}」，你会改哪里？当时为什么没这么做？` },
};
/** 最多给几个项目备材料（先写与岗位最相关的）。 */
export const MAX_PROJECTS = 3;

export function isProjectAngle(value: unknown): value is ProjectAngle {
  return typeof value === "string" && (PROJECT_ANGLE_ORDER as readonly string[]).includes(value);
}

/** 总分按话题的种类加权：项目 3、场景 2、基础 1。 */
export const KIND_WEIGHT: Record<AreaKind, number> = { project: 3, quick: 1, scenario: 2 };

export const MAX_HYPOTHESES = 6;
/** 备几道基础题：配额里的基础题数；简历没有项目时项目配额让给基础题（与 progress.planQuota 同口径）。 */
export function quickTarget(pace: InterviewPace, projectCount: number): number {
  const quota = QUOTA[pace];
  return quota.quick + (projectCount === 0 ? quota.project : 0);
}
const MAX_QUICK = Math.max(...INTERVIEW_PACES.map((pace) => quickTarget(pace, 0)));

export const BASIS_KINDS = ["resume", "jd", "gap", "pattern"] as const;
export type BasisKind = (typeof BASIS_KINDS)[number];
export const BASIS_LABELS: Record<BasisKind, string> = {
  resume: "简历原话",
  jd: "JD 原话",
  gap: "岗位与简历的落差",
  pattern: "从几段经历里看出来的",
};

/**
 * 一道基础题的依据：这题为什么落在这个人、这个岗位上。
 * resume / jd 引得出原文；gap（岗位要的他没有）与 pattern（几段经历里看出来的模式或缺失）引不出——
 * 最值得问的题常常是推出来的，不该被"必须逐字引用"挡掉（2026-09-18 用户指出）。
 */
export type QuestionBasis = { kind: BasisKind; quote: string | null; note: string };

/** 依据成不成立：写了 quote 就必须能在原文里找到（忽略空格换行）；推断类可以不给 quote。 */
export function basisAccepted(basis: QuestionBasis, sources: { resumeText: string; jobDescription: string }): boolean {
  const quote = basis.quote?.trim() ?? "";
  if (!quote) return basis.kind === "gap" || basis.kind === "pattern";
  return isVerbatimEvidence(basis.kind === "resume" ? sources.resumeText : sources.jobDescription, quote);
}

export type RubricItem = { name: string; description: string; weight: number };

/**
 * 评分表维度 → 能力画像维度。评分表按名称固定（rubricForArea），是跨场可比的测量口径；画像从逐段评分推导观察时按此表归属。
 * 每个现行维度名都有归属；旧简报里的名字（岗位关联、复盘与表达、HR 面的两项）不再认，那些段的观察在重算画像时不计。
 */
export const PROFILE_DIMENSION_BY_RUBRIC: Record<string, ProfileDimension> = {
  技术正确性: "knowledge_accuracy",
  准确性: "knowledge_accuracy",
  分析与取舍: "reasoning_depth",
  原理深度: "reasoning_depth",
  取舍与复盘: "reflection_growth",
  事实与细节: "experience_evidence",
  表达结构: "communication_clarity",
};

/** 评分表：按材料种类固定。每道题的特异性在模型写的 expectedSignals / guides 里，不在这里。 */
export function rubricForArea(kind: AreaKind): RubricItem[] {
  if (kind === "project") {
    return [
      { name: "事实与细节", description: "回答包含可核验的个人职责、技术决策和实施细节。", weight: 40 },
      { name: "取舍与复盘", description: "说得出为什么这么做、放弃了什么、效果怎么量、重做会改哪里。", weight: 35 },
      { name: "表达结构", description: "回答层次清楚，结论有依据。", weight: 25 },
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
  /** 项目 × 角度；先出现的项目是最相关的。 */
  projects: z
    .array(
      z.object({
        /** projects[].id。 */
        projectId: z.string().min(1).max(60),
        /** 一句切入问法：一个问题，给一个抓手。 */
        question: z.string().min(1).max(500),
        /** 面试里要验证的点（最多 3 条）：追问时拿着它们顺着候选人的话去验。 */
        leads: z.array(z.string().min(1).max(200)).max(3),
        expectedSignals: signals,
      }),
    )
    .max(MAX_PROJECTS),
  quick: z
    .array(
      z.object({
        /** 题的主题名（不带简历项目名）。 */
        name: z.string().min(1).max(80),
        question: z.string().min(1).max(400),
        /** 这题为什么落在这个人 / 这个岗位上：引用类给 quote（逐字），推断类给 note。 */
        basis: z.object({
          kind: z.enum(BASIS_KINDS),
          quote: z.string().min(1).max(240).nullable(),
          note: z.string().min(4).max(200),
        }),
        /** 答得实质时唯一的一层追问往哪问。 */
        followUp: z.string().min(1).max(200),
        expectedSignals: signals,
      }),
    )
    .max(MAX_QUICK),
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

/** 一道题的材料：项目角度、基础题或场景题。 */
export type InterviewArea = {
  id: string;
  kind: AreaKind;
  name: string;
  /** project 领域围绕哪个简历项目、哪个角度。 */
  projectId: string | null;
  angle: ProjectAngle | null;
  /** 场景题绑定的岗位能力与 JD 原句；基础题与项目题为空。 */
  competencyIds: string[];
  jdEvidence: string | null;
  /** 基础题的依据（引用或推断）；不成立为 null。项目与场景题为 null（场景题看 jdEvidence）。 */
  basis: QuestionBasis | null;
  entryQuestion: string;
  /** project：想验证的线索；quick：唯一一层追问的方向；scenario：引导阶梯。 */
  guides: string[];
  expectedSignals: string[];
  rubric: RubricItem[];
};

/** 简历假设挂在项目上：该项目的任何角度里都可以验。 */
export type InterviewHypothesis = { id: string; text: string; evidence: string; projectId: string | null };

export type InterviewBrief = {
  version: typeof BRIEF_VERSION;
  pace: InterviewPace;
  /** 这个团队做什么（蓝图的业务；JD 没写为 null）：面试官人设里带一句。 */
  product: string | null;
  askIntro: boolean;
  /** 项目的各个面在前，然后是题池，最后是场景题。 */
  areas: InterviewArea[];
  hypotheses: InterviewHypothesis[];
  /** 备课用到的技能包；面试中可查。 */
  skillPacks: string[];
  /** 简报是模型产出还是代码兜底。 */
  source: "model" | "fallback";
};

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
 * 项目没有假设时的兜底：在简历里这个项目的段落中找带可量化成果或成果动词的一句，
 * 逐字作为 evidence，让每个项目都有东西可对质。只有标题行（带日期）或什么都找不到时不补。
 */
export function fallbackHypothesis(
  resumeText: string,
  project: { id: string; name: string; description?: string },
  others: { name: string }[] = [],
): InterviewHypothesis | null {
  const claims = projectSentences(resumeText, project, others).filter((sentence) => !DATE_PATTERN.test(sentence));
  const evidence = (claims.find((sentence) => METRIC_PATTERN.test(sentence)) ?? claims.find((sentence) => OUTCOME_PATTERN.test(sentence)))?.slice(0, MAX_EVIDENCE_CHARS);
  if (!evidence) return null;
  return {
    id: `H-${project.id}`,
    text: `简历写「${evidence}」：问是怎么做的、怎么量的、基线是什么、哪部分是本人做的`,
    evidence,
    projectId: project.id,
  };
}

type Project = { id: string; name: string; description?: string };

/** 追问角度的通用线索：模型没写 leads 时用。 */
const PROJECT_LEADS = ["最难的问题：现象、根因、排查顺序", "效果与预期：指标、基线、数字怎么量的", "取舍与重做：会改哪个决策、为什么"];

type ProjectAreaInput = { question: string; leads: string[]; expectedSignals: string[] } | null;

function projectArea(project: Project, rank: number, written: ProjectAreaInput): InterviewArea {
  return {
    id: `p${rank + 1}`,
    kind: "project",
    name: project.name,
    projectId: project.id,
    angle: null,
    competencyIds: [],
    jdEvidence: null,
    basis: null,
    entryQuestion: written?.question ?? PROJECT_ANGLES.overview.question(project.name),
    guides: written && written.leads.length > 0 ? written.leads : PROJECT_LEADS,
    expectedSignals: written?.expectedSignals ?? ["能讲清自己负责的部分与关键决策"],
    rubric: rubricForArea("project"),
  };
}

/** 项目材料：每个项目（最多 MAX_PROJECTS 个）一份；模型写了的用模型的问法与线索，没写的用兜底。 */
/** 只建这场要聊的那几份项目材料（按节奏配额）：多建的永远问不到，却会跟着议程每回合回放给模型。 */
function projectAreas(ranked: Project[], limit: number, written: (project: Project) => ProjectAreaInput): InterviewArea[] {
  return ranked.slice(0, limit).map((project, rank) => projectArea(project, rank, written(project)));
}

type QuickInput = { name: string; question: string; basis: QuestionBasis | null; followUp: string; expectedSignals: string[] };

function quickArea(written: QuickInput, id: string): InterviewArea {
  return {
    id,
    kind: "quick",
    name: written.name,
    projectId: null,
    angle: null,
    competencyIds: [],
    jdEvidence: null,
    basis: written.basis,
    entryQuestion: written.question,
    guides: [written.followUp],
    expectedSignals: written.expectedSignals,
    rubric: rubricForArea("quick"),
  };
}

/** 模型没写够基础题时的兜底：从领域包的常考主题清单里按顺序补，没有依据（面试官会先问他碰过没有）。 */
function fallbackQuick(name: string): QuickInput {
  return { name, question: `聊聊${name}：它解决什么问题、最关键的一个机制是什么？`, basis: null, followUp: "追问它的边界与出问题时怎么查", expectedSignals: ["机制准确", "说得出边界"] };
}

function quickAreas(written: QuickInput[], topicNames: string[], target: number): InterviewArea[] {
  const picked = written.slice(0, target);
  for (const name of topicNames) {
    if (picked.length >= target) break;
    if (!picked.some((item) => normalizedText(item.name) === normalizedText(name))) picked.push(fallbackQuick(name));
  }
  return picked.map((item, index) => quickArea(item, `q${index + 1}`));
}

function fallbackScenarioArea(blueprint: MockInterviewJobBlueprint, id: string): InterviewArea {
  const competency = blueprint.competencies[0] ?? null;
  return {
    id,
    kind: "scenario",
    name: competency ? `场景：${competency.name}` : "场景题",
    projectId: null,
    angle: null,
    competencyIds: competency ? [competency.id] : [],
    jdEvidence: competency?.origin === "jd" ? competency.jdEvidence : null,
    basis: null,
    entryQuestion: competency
      ? `如果你加入后第一个任务是${competency.description || competency.name}，先要弄清楚哪几件事，你会怎么排优先级？`
      : "如果你接手一个刚上线就频繁出问题的系统，你会从哪里开始排查，怎么决定先修什么？",
    guides: ["追问它为什么先做这件事", "追问如果条件变了（规模、时间、人手）怎么取舍", "追问怎么验证做对了"],
    expectedSignals: ["有明确的排查或推进顺序", "说得出取舍依据", "有验证方式"],
    rubric: rubricForArea("scenario"),
  };
}

/**
 * 模型没挂项目的假设：证据句落在简历里哪个项目的段落（最近一个在它前面出现的项目名），就挂到那个项目上。
 * 两边都按去空白的文本找位置——排版空格不该影响归属，去空白后相对顺序不变。
 */
function attachHypothesis(resume: string, evidence: string, projects: Project[]): string | null {
  const at = resume.indexOf(denseText(evidence));
  let owner: { projectId: string; start: number } | null = null;
  for (const project of projects) {
    const name = denseText(project.name);
    const start = name.length >= 2 ? resume.lastIndexOf(name, at) : -1;
    if (start >= 0 && start < at && (!owner || start > owner.start)) owner = { projectId: project.id, start };
  }
  return owner?.projectId ?? null;
}

/** 校招还是社招的兜底判断（模型没产出时）：JD 或简历提到届别 / 应届 / 实习 / 在读就按校招。 */
/**
 * 模型产出 → 冻结的简报。规则全部由代码把关：
 * - 项目：projectId 必须存在；先出现的项目排前面，最多 MAX_PROJECTS 个，每个项目一份材料，模型没写的用兜底问法；
 * - 基础题：模型按 JD 与简历定，取配额那么多道；依据写了 quote 就必须逐字出自来源（不合格标为无依据）；skill 必须是备课用的包名；不够的从领域包主题清单补；
 * - 场景题数按节奏，JD 原句必须逐字，能力 id 必须在蓝图里；不够时代码兜底；
 * - 假设的简历证据必须逐字出现在简历里，挂到项目上；每个被问的项目至少一条，没有就从简历里兜底。
 */
export function buildBriefFromOutput(input: {
  output: BriefOutput;
  blueprint: MockInterviewJobBlueprint;
  jobDescription: string;
  resumeText: string;
  projects: Project[];
  /** 领域包常考主题清单的主题名：模型没写够基础题时补。 */
  topicNames: string[];
  skillPacks: string[];
  pace: InterviewPace;
  askIntro: boolean;
}): InterviewBrief {
  const { output } = input;
  const scenarioCount = SCENARIOS_PER_PACE[input.pace];
  const competencyIds = new Set(input.blueprint.competencies.map((item) => item.id));
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const resume = denseText(input.resumeText);

  // 项目顺序：模型先写到的排前面；没写到的按简历顺序排在后面。
  const ranked: Project[] = [];
  for (const raw of output.projects) {
    const project = projectsById.get(raw.projectId);
    if (project && !ranked.includes(project)) ranked.push(project);
  }
  for (const project of input.projects) if (!ranked.includes(project)) ranked.push(project);
  const projects = projectAreas(ranked, QUOTA[input.pace].project, (project) => {
    const raw = output.projects.find((item) => item.projectId === project.id);
    return raw ? { question: raw.question, leads: raw.leads, expectedSignals: raw.expectedSignals } : null;
  });

  const sources = { resumeText: input.resumeText, jobDescription: input.jobDescription };
  const quick = quickAreas(
    output.quick.map((item) => ({ ...item, basis: basisAccepted(item.basis, sources) ? item.basis : null })),
    input.topicNames,
    quickTarget(input.pace, projects.length),
  );

  const scenarios: InterviewArea[] = output.scenarios.slice(0, scenarioCount).map((raw, index) => {
    const jdEvidence = raw.jdEvidence && isVerbatimEvidence(input.jobDescription, raw.jdEvidence) ? raw.jdEvidence : null;
    return {
      id: `s${index + 1}`,
      kind: "scenario",
      name: raw.name,
      projectId: null,
      angle: null,
      competencyIds: raw.competencyIds.filter((id) => competencyIds.has(id)),
      jdEvidence,
      basis: null,
      entryQuestion: raw.question,
      guides: raw.guides,
      expectedSignals: raw.expectedSignals,
      rubric: rubricForArea("scenario"),
    };
  });
  while (scenarios.length < scenarioCount) scenarios.push(fallbackScenarioArea(input.blueprint, `s${scenarios.length + 1}`));

  // 假设挂到项目上：该项目的任何角度里都能验。
  const hypotheses: InterviewHypothesis[] = output.hypotheses
    .filter((item) => isVerbatimEvidence(input.resumeText, item.evidence))
    .map((item) => ({
      id: item.id,
      text: item.text,
      evidence: item.evidence,
      projectId: (item.projectId && projectsById.has(item.projectId) ? item.projectId : null) ?? attachHypothesis(resume, item.evidence, input.projects),
    }));
  for (const project of ranked.slice(0, MAX_PROJECTS)) {
    if (hypotheses.some((item) => item.projectId === project.id)) continue;
    const fallback = fallbackHypothesis(input.resumeText, project, input.projects);
    if (fallback && hypotheses.length < MAX_HYPOTHESES && !hypotheses.some((item) => item.evidence === fallback.evidence)) hypotheses.push(fallback);
  }

  return {
    version: BRIEF_VERSION,
    pace: input.pace,
    product: input.blueprint.business?.product ?? null,
    askIntro: input.askIntro,
    areas: [...projects, ...quick, ...scenarios],
    hypotheses: hypotheses.slice(0, MAX_HYPOTHESES),
    skillPacks: input.skillPacks,
    source: "model",
  };
}

/**
 * 兜底简报：模型没产出时按蓝图、简历项目与领域包的主题清单直接搭。不可能失败，
 * 与蓝图的兜底同一哲学——降级产出，不把"请重试"丢给用户。
 */
export function fallbackBrief(input: {
  blueprint: MockInterviewJobBlueprint;
  jobDescription: string;
  resumeText: string;
  projects: Project[];
  topicNames: string[];
  skillPacks: string[];
  pace: InterviewPace;
  askIntro: boolean;
}): InterviewBrief {
  const scenarioCount = SCENARIOS_PER_PACE[input.pace];
  const projects = projectAreas(input.projects, QUOTA[input.pace].project, () => null);
  const quick = quickAreas([], input.topicNames, quickTarget(input.pace, projects.length));
  const scenarios = Array.from({ length: scenarioCount }, (_, index) => fallbackScenarioArea(input.blueprint, `s${index + 1}`));
  return {
    version: BRIEF_VERSION,
    pace: input.pace,
    product: input.blueprint.business?.product ?? null,
    askIntro: input.askIntro,
    areas: [...projects, ...quick, ...scenarios],
    hypotheses: [],
    skillPacks: input.skillPacks,
    source: "fallback",
  };
}

/**
 * 备课备好了没（设计修订 v3 §1.3）：蓝图是占位（模型服务不可用时的兜底）或简报走了兜底，就是没备好。
 * 没备好先自动再备一次；仍没备好就不开房，让用户看到原因后决定重新备课还是就这样开始。
 */
export function briefReady(blueprint: { competencies: { id: string }[] }, brief: Pick<InterviewBrief, "source">): boolean {
  const placeholderBlueprint = blueprint.competencies.length === 0 || blueprint.competencies.every((item) => item.id.startsWith("fallback-"));
  return !placeholderBlueprint && brief.source === "model";
}

/** 读库里的简报。只认 v8：更早的简报（领域清单、切入点、阶段预算）视为没有简报（那些会话只剩题目与评分可看）。 */
export function parseStoredBrief(json: string | null): InterviewBrief | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<InterviewBrief>;
    const usable =
      value.version === BRIEF_VERSION &&
      isInterviewPace(value.pace ?? "") &&
      Array.isArray(value.areas) &&
      value.areas.every((area) => isAreaKind(area.kind));
    return usable ? (value as InterviewBrief) : null;
  } catch {
    return null;
  }
}
