import { z } from "zod";

import type { ProfileDimension } from "@/lib/candidate-profile/types";
import { isVerbatimEvidence } from "@/lib/text/evidence";
import { denseText, normalizedText } from "@/lib/text/similarity";

import { REFERENCE_COUNT } from "@/lib/interview/progress";

import type { MockInterviewJobBlueprint } from "../types";
import { localizedLabels, type ContentLanguage } from "@/lib/i18n/locale";

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

/** 界面按语言取：`INTERVIEW_PACE_LABELS_I18N[locale][key]`（docs/i18n-plan.md）。 */
export const INTERVIEW_PACE_LABELS_I18N = localizedLabels(INTERVIEW_PACE_LABELS, { quick: "Quick", standard: "Standard", deep: "Deep" });

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

/** 界面按语言取：`AREA_KIND_LABELS_I18N[locale][key]`（docs/i18n-plan.md）。 */
export const AREA_KIND_LABELS_I18N = localizedLabels(AREA_KIND_LABELS, { project: "Project deep-dive", quick: "Quick fundamentals", scenario: "Scenario" });
export function isAreaKind(value: unknown): value is AreaKind {
  return typeof value === "string" && (AREA_KINDS as readonly string[]).includes(value);
}


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
/** 最多给几个项目备材料（schema 上限；聊几个由模型按岗位相关度定，参考值见 interview/progress.ts）。 */
export const MAX_PROJECTS = 4;
export const MAX_SCENARIOS = 2;

export function isProjectAngle(value: unknown): value is ProjectAngle {
  return typeof value === "string" && (PROJECT_ANGLE_ORDER as readonly string[]).includes(value);
}

/** 总分按话题的种类加权：项目 3、场景 2、基础 1。 */
export const KIND_WEIGHT: Record<AreaKind, number> = { project: 3, quick: 1, scenario: 2 };

export const MAX_HYPOTHESES = 8;
/** 基础题的 schema 上限；备几道由模型定，参考值见 interview/progress.ts。 */
export const MAX_QUICK = 6;

export const BASIS_KINDS = ["resume", "jd", "gap", "pattern"] as const;
export type BasisKind = (typeof BASIS_KINDS)[number];
export const BASIS_LABELS: Record<BasisKind, string> = {
  resume: "简历原话",
  jd: "JD 原话",
  gap: "岗位与简历的落差",
  pattern: "从几段经历里看出来的",
};

/** 界面按语言取：`BASIS_LABELS_I18N[locale][key]`（docs/i18n-plan.md）。 */
export const BASIS_LABELS_I18N = localizedLabels(BASIS_LABELS, { resume: "From the resume", jd: "From the JD", gap: "Gap between role and resume", pattern: "Pattern across experiences" });

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
  // 英文场次的同一套维度（rubricForArea(kind, "en")）：名字不同，口径与画像归属相同。
  "Technical correctness": "knowledge_accuracy",
  Accuracy: "knowledge_accuracy",
  "Analysis and trade-offs": "reasoning_depth",
  "Depth of reasoning": "reasoning_depth",
  "Trade-offs and reflection": "reflection_growth",
  "Facts and specifics": "experience_evidence",
  "Structure and clarity": "communication_clarity",
};

/** 评分表的中英两版：维度一一对应、权重相同；名字是评分 agent 打分的键，也是画像归属的键（见上表）。 */
const RUBRICS: Record<ContentLanguage, Record<AreaKind, RubricItem[]>> = {
  zh: {
    project: [
      { name: "事实与细节", description: "回答包含可核验的个人职责、技术决策和实施细节。", weight: 40 },
      { name: "取舍与复盘", description: "说得出为什么这么做、放弃了什么、效果怎么量、重做会改哪里。", weight: 35 },
      { name: "表达结构", description: "回答层次清楚，结论有依据。", weight: 25 },
    ],
    quick: [
      { name: "准确性", description: "概念、机制与边界条件说得准确，没有似是而非。", weight: 60 },
      { name: "原理深度", description: "能讲清为什么，而不只是是什么。", weight: 25 },
      { name: "表达结构", description: "回答层次清楚，结论有依据。", weight: 15 },
    ],
    scenario: [
      { name: "技术正确性", description: "关键概念、机制和边界条件准确。", weight: 50 },
      { name: "分析与取舍", description: "能够解释方案选择、限制及替代方案。", weight: 30 },
      { name: "表达结构", description: "回答层次清楚，结论有依据。", weight: 20 },
    ],
  },
  en: {
    project: [
      { name: "Facts and specifics", description: "The answer contains verifiable personal ownership, technical decisions and implementation detail.", weight: 40 },
      { name: "Trade-offs and reflection", description: "Can explain why it was done this way, what was given up, how impact was measured, and what they'd change if redoing it.", weight: 35 },
      { name: "Structure and clarity", description: "The answer is well organised and conclusions are backed by evidence.", weight: 25 },
    ],
    quick: [
      { name: "Accuracy", description: "Concepts, mechanisms and edge cases are stated precisely, with nothing that only sounds right.", weight: 60 },
      { name: "Depth of reasoning", description: "Explains why, not just what.", weight: 25 },
      { name: "Structure and clarity", description: "The answer is well organised and conclusions are backed by evidence.", weight: 15 },
    ],
    scenario: [
      { name: "Technical correctness", description: "Key concepts, mechanisms and edge cases are correct.", weight: 50 },
      { name: "Analysis and trade-offs", description: "Can justify the chosen approach, its limits and the alternatives.", weight: 30 },
      { name: "Structure and clarity", description: "The answer is well organised and conclusions are backed by evidence.", weight: 20 },
    ],
  },
};

/** 评分表：按材料种类固定，按面试语言取名字与说明。每道题的特异性在模型写的 expectedSignals / guides 里，不在这里。 */
export function rubricForArea(kind: AreaKind, language: ContentLanguage = "zh"): RubricItem[] {
  return RUBRICS[language][kind].map((item) => ({ ...item }));
}

const signals = z.array(z.string().min(1).max(200)).min(1).max(5);

/** 发给模型的简报 schema：严格模式，全部字段 required，可空用 nullable。 */
/** 假设的来源：简历上的说法，或岗位要求（JD 是岗位特异性的唯一来源，至少要验一条）。 */
export const HYPOTHESIS_SOURCES = ["resume", "jd"] as const;
export type HypothesisSource = (typeof HYPOTHESIS_SOURCES)[number];

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
        leads: z.array(z.string().min(1).max(200)).max(5),
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
    .max(MAX_SCENARIOS),
  hypotheses: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        /** resume：简历上的说法要验；jd：岗位要求要验（候选人碰过没有、到什么程度）。 */
        source: z.enum(HYPOTHESIS_SOURCES),
        /** 要验证什么，例如"简历称 prompt 长度降低约 50%，验证度量方法与基线"或"岗位要求工具调用异常恢复，简历没提，验证是否有实践"。 */
        text: z.string().min(1).max(300),
        /** 逐字片段：source=resume 引简历原文，source=jd 引 JD 原文。 */
        evidence: z.string().min(1).max(300),
        /** 属于哪个简历项目（projects[].id）；resume 类对不上时由代码按简历段落归属；jd 类可为 null，也可指向最适合验它的项目。 */
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

/** 要在面试里验证的一条说法：简历假设挂在项目上，该项目的任何角度里都可以验；岗位假设载体不限（项目追问、基础题或场景题都行）。 */
export type InterviewHypothesis = { id: string; source: HypothesisSource; text: string; evidence: string; projectId: string | null };

export type InterviewBrief = {
  version: typeof BRIEF_VERSION;
  pace: InterviewPace;
  /** 面试语言：面试官、评分、报告都用它说话（docs/i18n-plan.md）；旧简报没有，读出时按 zh。 */
  language: ContentLanguage;
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
/**
 * 英文场次在中文规则之外再认英文简历的写法（中文场次只用上面三条，结果不变）：
 * 英文单位与量词、成果动词、"Jan 2024 – Present" 这类日期行。
 */
const METRIC_PATTERN_EN = /\d+(\.\d+)?\s*(%|x\b|ms\b|s\b|k\b|m\b|million|billion|hours?|days?|weeks?|users?|requests?|rps|qps|tps)/i;
const OUTCOME_PATTERN_EN = /\b(improv|reduc|cut|decreas|increas|boost|grew|grow|optimi[sz]|achiev|sav|scal|shorten|speed|led|own|built|launch|from scratch)/i;
const DATE_PATTERN_EN = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b|\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|now|current)\b|\bpresent$/i;

function claimPatterns(language: ContentLanguage) {
  const either = (zh: RegExp, en: RegExp) => (text: string) => zh.test(text) || (language === "en" && en.test(text));
  return { metric: either(METRIC_PATTERN, METRIC_PATTERN_EN), outcome: either(OUTCOME_PATTERN, OUTCOME_PATTERN_EN), date: either(DATE_PATTERN, DATE_PATTERN_EN) };
}

/**
 * 代码写进简报的句子（兜底假设、兜底切入与线索、兜底基础题与场景题）按面试语言各一份：
 * 这些句子会进议程给面试官看，英文场次里不能夹中文。
 */
const COPY = {
  zh: {
    projectOverview: (name: string) => PROJECT_ANGLES.overview.question(name),
    projectLeads: ["最难的问题：现象、根因、排查顺序", "效果与预期：指标、基线、数字怎么量的", "取舍与重做：会改哪个决策、为什么"],
    projectSignals: ["能讲清自己负责的部分与关键决策"],
    resumeHypothesis: (evidence: string) => `简历写「${evidence}」：问是怎么做的、怎么量的、基线是什么、哪部分是本人做的`,
    jdHypothesis: (name: string) => `岗位要求「${name}」：问候选人碰过没有、做到什么程度、能不能把手上的经验接过去`,
    quick: (name: string) => ({ question: `聊聊${name}：它解决什么问题、最关键的一个机制是什么？`, followUp: "追问它的边界与出问题时怎么查", expectedSignals: ["机制准确", "说得出边界"] }),
    scenarioName: (name: string | null) => (name ? `场景：${name}` : "场景题"),
    scenarioQuestion: (task: string | null) =>
      task ? `如果你加入后第一个任务是${task}，先要弄清楚哪几件事，你会怎么排优先级？` : "如果你接手一个刚上线就频繁出问题的系统，你会从哪里开始排查，怎么决定先修什么？",
    scenarioGuides: ["追问它为什么先做这件事", "追问如果条件变了（规模、时间、人手）怎么取舍", "追问怎么验证做对了"],
    scenarioSignals: ["有明确的排查或推进顺序", "说得出取舍依据", "有验证方式"],
  },
  en: {
    projectOverview: (name: string) => `Let's start with "${name}" as a whole: what problem did it solve, how was it architected, and which part did you own?`,
    projectLeads: ["Hardest problem: symptoms, root cause, how they narrowed it down", "Impact vs. expectations: metrics, baseline, how the numbers were measured", "Trade-offs and redo: which decision they'd change, and why"],
    projectSignals: ["Clearly explains what they personally owned and the key decisions"],
    resumeHypothesis: (evidence: string) => `The resume says "${evidence}": ask how it was done, how it was measured, what the baseline was, and which part was theirs`,
    jdHypothesis: (name: string) => `The role requires "${name}": ask whether the candidate has done it, to what depth, and whether their existing experience carries over`,
    quick: (name: string) => ({ question: `Tell me about ${name}: what problem does it solve, and what's the single most important mechanism behind it?`, followUp: "Probe its limits and how you'd debug it when it breaks", expectedSignals: ["Mechanism is accurate", "Can name the limits"] }),
    scenarioName: (name: string | null) => (name ? `Scenario: ${name}` : "Scenario"),
    scenarioQuestion: (task: string | null) =>
      task ? `Say your first assignment after joining is ${task}. What would you need to figure out first, and how would you prioritise?` : "Say you inherit a system that has been breaking constantly since launch. Where do you start investigating, and how do you decide what to fix first?",
    scenarioGuides: ["Ask why they'd do that first", "Ask how the trade-off changes if the constraints change (scale, time, headcount)", "Ask how they'd verify they got it right"],
    scenarioSignals: ["Has a clear order for investigating or driving the work", "Can justify the trade-offs", "Has a way to verify the outcome"],
  },
} satisfies Record<ContentLanguage, unknown>;
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
function projectSentences(resumeText: string, project: { name: string; description?: string }, others: { name: string }[] = [], language: ContentLanguage = "zh"): string[] {
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
    // 英文场次另按句号切（". " 后面有空白才算句末，"Node.js"、"3.5x" 不切）。
    .split(language === "en" ? /[\n。；;！!？?]|\.\s+/ : /[\n。；;！!？?]/)
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
  language: ContentLanguage = "zh",
): InterviewHypothesis | null {
  const patterns = claimPatterns(language);
  const claims = projectSentences(resumeText, project, others, language).filter((sentence) => !patterns.date(sentence));
  const evidence = (claims.find(patterns.metric) ?? claims.find(patterns.outcome))?.slice(0, MAX_EVIDENCE_CHARS);
  if (!evidence) return null;
  return {
    id: `H-${project.id}`,
    source: "resume",
    text: COPY[language].resumeHypothesis(evidence),
    evidence,
    projectId: project.id,
  };
}

/**
 * 模型没写岗位假设时的兜底：拿蓝图里第一条来自 JD 的核心能力（没有就第一条），让每场至少有一条岗位要求在账上。
 * 与项目假设的兜底同一哲学：不替模型决定怎么问，只保证要验的东西不缺席。
 */
export function fallbackJdHypothesis(blueprint: Pick<MockInterviewJobBlueprint, "competencies">, language: ContentLanguage = "zh"): InterviewHypothesis | null {
  const competency = blueprint.competencies.find((item) => item.origin === "jd") ?? blueprint.competencies[0];
  if (!competency) return null;
  return {
    id: `J-${competency.id}`,
    source: "jd",
    text: COPY[language].jdHypothesis(competency.name),
    evidence: competency.jdEvidence,
    projectId: null,
  };
}

type Project = { id: string; name: string; description?: string };

type ProjectAreaInput = { question: string; leads: string[]; expectedSignals: string[] } | null;

function projectArea(project: Project, rank: number, written: ProjectAreaInput, language: ContentLanguage): InterviewArea {
  const copy = COPY[language];
  return {
    id: `p${rank + 1}`,
    kind: "project",
    name: project.name,
    projectId: project.id,
    angle: null,
    competencyIds: [],
    jdEvidence: null,
    basis: null,
    // 追问角度的通用线索：模型没写 leads 时用。
    entryQuestion: written?.question ?? copy.projectOverview(project.name),
    guides: written && written.leads.length > 0 ? written.leads : [...copy.projectLeads],
    expectedSignals: written?.expectedSignals ?? [...copy.projectSignals],
    rubric: rubricForArea("project", language),
  };
}

/** 项目材料：每个项目一份（最多 MAX_PROJECTS 个）；模型写了的用模型的问法与线索，没写的用兜底问法。 */
function projectAreas(ranked: Project[], limit: number, written: (project: Project) => ProjectAreaInput, language: ContentLanguage): InterviewArea[] {
  return ranked.slice(0, limit).map((project, rank) => projectArea(project, rank, written(project), language));
}

type QuickInput = { name: string; question: string; basis: QuestionBasis | null; followUp: string; expectedSignals: string[] };

function quickArea(written: QuickInput, id: string, language: ContentLanguage): InterviewArea {
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
    rubric: rubricForArea("quick", language),
  };
}

/** 兜底简报的基础题：从领域包的常考主题清单里按顺序取，没有依据（面试官会先问他碰过没有）。只在模型整体失败时用。 */
function fallbackQuick(name: string, language: ContentLanguage): QuickInput {
  return { name, basis: null, ...COPY[language].quick(name) };
}

function quickAreas(written: QuickInput[], language: ContentLanguage): InterviewArea[] {
  return written.slice(0, MAX_QUICK).map((item, index) => quickArea(item, `q${index + 1}`, language));
}

function fallbackScenarioArea(blueprint: MockInterviewJobBlueprint, id: string, language: ContentLanguage): InterviewArea {
  const copy = COPY[language];
  const competency = blueprint.competencies[0] ?? null;
  return {
    id,
    kind: "scenario",
    name: copy.scenarioName(competency?.name ?? null),
    projectId: null,
    angle: null,
    competencyIds: competency ? [competency.id] : [],
    jdEvidence: competency?.origin === "jd" ? competency.jdEvidence : null,
    basis: null,
    entryQuestion: copy.scenarioQuestion(competency ? competency.description || competency.name : null),
    guides: [...copy.scenarioGuides],
    expectedSignals: [...copy.scenarioSignals],
    rubric: rubricForArea("scenario", language),
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
 * 模型产出 → 冻结的简报（agent-freedom-plan §2.7：聊什么、聊几份由模型定，代码只管真实性与上限，不补足配额）：
 * - 项目：模型写了的才聊（projectId 必须存在，先写到的排前面，最多 MAX_PROJECTS 个）；一个都没写而简历有项目时兜底聊第一个；
 * - 基础题：模型写几道就几道（≤ MAX_QUICK）；依据写了 quote 就必须逐字出自来源（不合格标为无依据）；
 * - 场景题：模型写几道就几道（≤ MAX_SCENARIOS）；JD 原句必须逐字，能力 id 必须在蓝图里；
 * - 假设的简历证据必须逐字出现在简历里，挂到项目上；每个被问的项目至少一条，没有就从简历里兜底。
 */
export function buildBriefFromOutput(input: {
  output: BriefOutput;
  blueprint: MockInterviewJobBlueprint;
  jobDescription: string;
  resumeText: string;
  projects: Project[];
  /** 领域包常考主题清单的主题名：只有兜底简报用它（fallbackBrief）。 */
  topicNames: string[];
  skillPacks: string[];
  pace: InterviewPace;
  language?: ContentLanguage;
  askIntro: boolean;
}): InterviewBrief {
  const { output } = input;
  const language = input.language ?? "zh";
  const competencyIds = new Set(input.blueprint.competencies.map((item) => item.id));
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const resume = denseText(input.resumeText);

  // 项目：模型先写到的排前面，只聊它写了的；一个都没写而简历有项目时兜底聊第一个（项目追问是这个产品的核心，不能空）。
  const ranked: Project[] = [];
  for (const raw of output.projects) {
    const project = projectsById.get(raw.projectId);
    if (project && !ranked.includes(project)) ranked.push(project);
  }
  if (ranked.length === 0 && input.projects.length > 0) ranked.push(input.projects[0]);
  const projects = projectAreas(ranked, MAX_PROJECTS, (project) => {
    const raw = output.projects.find((item) => item.projectId === project.id);
    return raw ? { question: raw.question, leads: raw.leads, expectedSignals: raw.expectedSignals } : null;
  }, language);

  const sources = { resumeText: input.resumeText, jobDescription: input.jobDescription };
  const quick = quickAreas(output.quick.map((item) => ({ ...item, basis: basisAccepted(item.basis, sources) ? item.basis : null })), language);

  const scenarios: InterviewArea[] = output.scenarios.slice(0, MAX_SCENARIOS).map((raw, index) => {
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
      rubric: rubricForArea("scenario", language),
    };
  });

  // 假设：简历类的证据逐字出自简历并挂到项目上；岗位类的证据逐字出自 JD，载体不限。
  const hypotheses: InterviewHypothesis[] = output.hypotheses
    .filter((item) => isVerbatimEvidence(item.source === "jd" ? input.jobDescription : input.resumeText, item.evidence))
    .map((item) => ({
      id: item.id,
      source: item.source,
      text: item.text,
      evidence: item.evidence,
      projectId: (item.projectId && projectsById.has(item.projectId) ? item.projectId : null) ?? (item.source === "jd" ? null : attachHypothesis(resume, item.evidence, input.projects)),
    }));
  for (const project of ranked.slice(0, MAX_PROJECTS)) {
    if (hypotheses.some((item) => item.projectId === project.id)) continue;
    const fallback = fallbackHypothesis(input.resumeText, project, input.projects, language);
    if (fallback && hypotheses.length < MAX_HYPOTHESES && !hypotheses.some((item) => item.evidence === fallback.evidence)) hypotheses.push(fallback);
  }
  // 每场至少一条岗位要求在账上（JD 是岗位特异性的唯一来源）：模型没写就兜底一条，超出上限时它优先于最后一条简历假设。
  if (!hypotheses.some((item) => item.source === "jd")) {
    const fallback = fallbackJdHypothesis(input.blueprint, language);
    if (fallback) hypotheses.splice(Math.min(hypotheses.length, MAX_HYPOTHESES - 1), 0, fallback);
  }

  return {
    version: BRIEF_VERSION,
    pace: input.pace,
    language,
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
  language?: ContentLanguage;
  askIntro: boolean;
}): InterviewBrief {
  const language = input.language ?? "zh";
  const reference = REFERENCE_COUNT[input.pace];
  const projects = projectAreas(input.projects, reference.project, () => null, language);
  const quick = quickAreas(input.topicNames.slice(0, reference.quick + (projects.length === 0 ? reference.project : 0)).map((name) => fallbackQuick(name, language)), language);
  const scenarios = Array.from({ length: reference.scenario }, (_, index) => fallbackScenarioArea(input.blueprint, `s${index + 1}`, language));
  return {
    version: BRIEF_VERSION,
    pace: input.pace,
    language,
    product: input.blueprint.business?.product ?? null,
    askIntro: input.askIntro,
    areas: [...projects, ...quick, ...scenarios],
    hypotheses: [fallbackJdHypothesis(input.blueprint, language)].filter((item): item is InterviewHypothesis => item !== null),
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
    if (!usable) return null;
    // 2026-09-22 之前的简报没有假设来源：都是简历假设。
    return { ...(value as InterviewBrief), language: value.language === "en" ? "en" : "zh", hypotheses: (value.hypotheses ?? []).map((item) => ({ ...item, source: item.source ?? "resume" })) };
  } catch {
    return null;
  }
}
