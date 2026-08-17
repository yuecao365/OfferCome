import type { InterviewQuestionCategory } from "@/lib/interviews/types";
import { questionSimilarity } from "@/lib/text/similarity";

import type { MockInterviewContext } from "./context";
import {
  isJobDescriptionEvidence,
  jobCompetencyRelevance,
  type RelevantPersonalizationContext,
} from "./relevance";
import type {
  MockInterviewJobBlueprint,
  MockInterviewQuestionDraft,
  MockInterviewQuestionPlan,
} from "./types";

const DUPLICATE_THRESHOLD = 0.72;
/** 第二轮补位的底线：接近逐字重复的题即使缺题也不放两道。 */
const NEAR_EXACT_DUPLICATE_THRESHOLD = 0.9;
const HISTORY_COPY_THRESHOLD = 0.3;

export type QuestionSourceAllocation = {
  directJobDescriptionMin: number;
  resumeMax: number;
  personalizationMax: number;
  secondaryCompetencyMax: number;
  generalRoleMax: number;
};

export function getQuestionSourceAllocation(
  questionCount: number,
  hasSeed = false,
  blueprint?: MockInterviewJobBlueprint,
): QuestionSourceAllocation {
  const personalizationMax = Math.max(
    hasSeed ? 1 : 0,
    questionCount >= 5 ? Math.min(2, Math.floor(questionCount * 0.2)) : 0,
  );
  const resumeMax = Math.max(1, Math.floor(questionCount * 0.3));
  const hasInferredCompetency = blueprint?.competencies.some(
    (item) => item.origin === "inferred",
  );
  const jdCompetencyCount =
    blueprint?.competencies.filter((item) => item.origin === "jd").length ?? 0;
  const generalRoleMax = hasInferredCompetency
    ? Math.max(0, Math.min(questionCount, questionCount - jdCompetencyCount * 2))
    : 0;
  return {
    directJobDescriptionMin: Math.max(
      0,
      questionCount - resumeMax - personalizationMax - generalRoleMax,
    ),
    resumeMax,
    personalizationMax,
    secondaryCompetencyMax: Math.max(1, Math.floor(questionCount * 0.15)),
    generalRoleMax,
  };
}

/**
 * 硬拒只留"伪造引用"一类：引用了不存在的能力、项目或个性化来源。
 * 其余问题（重复、配额、相关性弱、证据意译）一律降权排序，不再丢弃。
 */
type RejectionReason =
  | "invalid_competency"
  | "invalid_resume_project"
  | "invalid_personalization_source"
  | "invalid_source_metadata";

export type QuestionSelectionResult = {
  accepted: MockInterviewQuestionDraft[];
  rejected: { question: string; reason: RejectionReason }[];
};

export function selectValidQuestions(input: {
  candidates: MockInterviewQuestionDraft[];
  existing?: MockInterviewQuestionDraft[];
  questionCount: number;
  context: MockInterviewContext;
  blueprint: MockInterviewJobBlueprint;
  personalization: RelevantPersonalizationContext;
  seedSourceId?: string | null;
}): QuestionSelectionResult {
  const accepted = [...(input.existing ?? [])];
  const rejected: QuestionSelectionResult["rejected"] = [];
  const competencyById = new Map(
    input.blueprint.competencies.map((item) => [item.id, item]),
  );
  const projectIds = new Set(input.context.projects.map((item) => item.id));
  const historyById = new Map(
    input.personalization.history.map((item) => [item.questionId, item]),
  );
  const profileById = new Map(
    input.personalization.profileInsights.map((item) => [item.id, item]),
  );
  const allocation = getQuestionSourceAllocation(
    input.questionCount,
    Boolean(input.seedSourceId),
    input.blueprint,
  );

  // —— 第一步：硬拒伪造引用（引用真实性是硬门，其余全部软化）。
  const scorable: { candidate: MockInterviewQuestionDraft; score: number }[] = [];
  for (const candidate of input.candidates) {
    const competency = competencyById.get(candidate.jobCompetencyId);
    if (!competency) {
      rejected.push({ question: candidate.question, reason: "invalid_competency" });
      continue;
    }
    if (candidate.sourceKind === "resume") {
      if (!candidate.resumeProjectId || !projectIds.has(candidate.resumeProjectId)) {
        rejected.push({ question: candidate.question, reason: "invalid_resume_project" });
        continue;
      }
      if (candidate.personalizationSourceId !== null) {
        rejected.push({ question: candidate.question, reason: "invalid_source_metadata" });
        continue;
      }
    } else if (candidate.sourceKind === "history" || candidate.sourceKind === "profile") {
      const source = candidate.personalizationSourceId;
      const relevantSource =
        candidate.sourceKind === "history"
          ? source && historyById.get(source)
          : source && profileById.get(source);
      if (
        !relevantSource ||
        relevantSource.jobCompetencyId !== candidate.jobCompetencyId ||
        candidate.resumeProjectId !== null
      ) {
        rejected.push({
          question: candidate.question,
          reason: "invalid_personalization_source",
        });
        continue;
      }
    } else if (
      candidate.resumeProjectId !== null ||
      candidate.personalizationSourceId !== null
    ) {
      rejected.push({ question: candidate.question, reason: "invalid_source_metadata" });
      continue;
    }

    // —— 第二步：打分。岗位相关性为底，证据质量与历史抄袭做加减分。
    const relevance = jobCompetencyRelevance(candidate.question, competency);
    const verbatim =
      competency.origin === "jd" &&
      isJobDescriptionEvidence(input.context.jobDescription, candidate.jdEvidence);
    const paraphrased = competency.origin === "jd" && !verbatim;
    const generalMismatch =
      competency.origin === "jd" && candidate.sourceKind === "general_role";
    const inferredMismatch =
      competency.origin === "inferred" && candidate.sourceKind !== "general_role";
    const historyCopy = input.context.history.some(
      (item) =>
        questionSimilarity(item.question, candidate.question) >= HISTORY_COPY_THRESHOLD,
    );
    const score =
      relevance +
      (verbatim ? 0.05 : 0) -
      // 主要用户是技术岗位候选人：同分时通用行为题让位于技术/项目题。
      (candidate.category === "general" ? 0.08 : 0) -
      (paraphrased ? 0.1 : 0) -
      (generalMismatch ? 0.25 : 0) -
      (inferredMismatch ? 0.25 : 0) -
      (historyCopy ? 0.35 : 0) -
      (relevance < 0.08 ? 0.2 : 0);
    scorable.push({ candidate, score });
  }
  scorable.sort((left, right) => right.score - left.score);

  // —— 第三步：两轮贪心。第一轮尊重配额与去重；不够数时第二轮放宽配额补位，
  // 只保留"几乎逐字重复"这一条底线。宁可有一道略超配额的题，也不空手。
  const secondaryCount = () =>
    accepted.filter(
      (item) => competencyById.get(item.jobCompetencyId)?.priority === "secondary",
    ).length;
  const countSource = (sourceKind: MockInterviewQuestionDraft["sourceKind"]) =>
    accepted.filter((item) => item.sourceKind === sourceKind).length;
  const isDuplicate = (candidate: MockInterviewQuestionDraft, threshold: number) =>
    accepted.some(
      (item) => questionSimilarity(item.question, candidate.question) >= threshold,
    );

  const deferred: { candidate: MockInterviewQuestionDraft; score: number }[] = [];
  for (const entry of scorable) {
    if (accepted.length >= input.questionCount) break;
    const { candidate } = entry;
    const competency = competencyById.get(candidate.jobCompetencyId)!;
    const overQuota =
      (candidate.sourceKind === "resume" && countSource("resume") >= allocation.resumeMax) ||
      ((candidate.sourceKind === "history" || candidate.sourceKind === "profile") &&
        countSource("history") + countSource("profile") >= allocation.personalizationMax) ||
      (candidate.sourceKind === "general_role" &&
        countSource("general_role") >= Math.max(1, allocation.generalRoleMax)) ||
      (competency.priority === "secondary" &&
        secondaryCount() >= allocation.secondaryCompetencyMax);
    if (overQuota || isDuplicate(candidate, DUPLICATE_THRESHOLD)) {
      deferred.push(entry);
      continue;
    }
    accepted.push(candidate);
  }
  for (const entry of deferred) {
    if (accepted.length >= input.questionCount) break;
    if (isDuplicate(entry.candidate, NEAR_EXACT_DUPLICATE_THRESHOLD)) continue;
    accepted.push(entry.candidate);
  }

  return { accepted, rejected };
}

function rubricForCategory(
  category: InterviewQuestionCategory,
): MockInterviewQuestionPlan["questions"][number]["rubric"] {
  if (category === "resume_project") {
    return [
      { name: "事实与细节", description: "回答包含可核验的个人职责、技术决策和实施细节。", weight: 40 },
      { name: "岗位关联", description: "能将项目经验映射到目标岗位的实际职责。", weight: 35 },
      { name: "复盘与表达", description: "结构清晰，并能说明结果、取舍和改进。", weight: 25 },
    ];
  }
  if (category === "technical") {
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

export function buildQuestionPlan(
  questions: MockInterviewQuestionDraft[],
): MockInterviewQuestionPlan {
  return {
    questions: questions.map((question) => ({
      ...question,
      rubric: rubricForCategory(question.category),
    })),
  };
}
