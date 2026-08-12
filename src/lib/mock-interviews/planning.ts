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
const HISTORY_COPY_THRESHOLD = 0.3;

export type QuestionSourceAllocation = {
  directJobDescriptionMin: number;
  resumeMax: number;
  personalizationMax: number;
  secondaryCompetencyMax: number;
};

export function getQuestionSourceAllocation(
  questionCount: number,
  hasSeed = false,
): QuestionSourceAllocation {
  const personalizationMax = Math.max(
    hasSeed ? 1 : 0,
    questionCount >= 5 ? Math.min(2, Math.floor(questionCount * 0.2)) : 0,
  );
  const resumeMax = Math.max(1, Math.floor(questionCount * 0.3));
  return {
    directJobDescriptionMin: questionCount - resumeMax - personalizationMax,
    resumeMax,
    personalizationMax,
    secondaryCompetencyMax: Math.max(1, Math.floor(questionCount * 0.15)),
  };
}

type RejectionReason =
  | "duplicate"
  | "history_copy"
  | "invalid_competency"
  | "weak_job_relevance"
  | "invalid_jd_evidence"
  | "invalid_resume_project"
  | "invalid_personalization_source"
  | "invalid_source_metadata"
  | "secondary_competency_quota_exceeded"
  | "source_quota_exceeded";

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
  );

  const countSource = (sourceKind: MockInterviewQuestionDraft["sourceKind"]) =>
    accepted.filter((item) => item.sourceKind === sourceKind).length;
  const countPersonalization = () =>
    countSource("history") + countSource("profile");

  for (const candidate of input.candidates) {
    if (accepted.length >= input.questionCount) break;
    let reason: RejectionReason | null = null;

    const competency = competencyById.get(candidate.jobCompetencyId);
    if (!competency) {
      reason = "invalid_competency";
    } else if (jobCompetencyRelevance(candidate.question, competency) < 0.08) {
      reason = "weak_job_relevance";
    } else if (!isJobDescriptionEvidence(input.context.jobDescription, candidate.jdEvidence)) {
      reason = "invalid_jd_evidence";
    } else if (
      accepted.some(
        (item) => questionSimilarity(item.question, candidate.question) >= DUPLICATE_THRESHOLD,
      )
    ) {
      reason = "duplicate";
    } else if (
      input.context.history.some(
        (item) =>
          questionSimilarity(item.question, candidate.question) >=
          HISTORY_COPY_THRESHOLD,
      )
    ) {
      reason = "history_copy";
    } else if (
      competency.priority === "secondary" &&
      accepted.filter(
        (item) => competencyById.get(item.jobCompetencyId)?.priority === "secondary",
      ).length >= allocation.secondaryCompetencyMax
    ) {
      reason = "secondary_competency_quota_exceeded";
    } else if (candidate.sourceKind === "resume") {
      if (!candidate.resumeProjectId || !projectIds.has(candidate.resumeProjectId)) {
        reason = "invalid_resume_project";
      } else if (candidate.personalizationSourceId !== null) {
        reason = "invalid_source_metadata";
      } else if (countSource("resume") >= allocation.resumeMax) {
        reason = "source_quota_exceeded";
      }
    } else if (
      candidate.sourceKind === "history" ||
      candidate.sourceKind === "profile"
    ) {
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
        reason = "invalid_personalization_source";
      } else if (countPersonalization() >= allocation.personalizationMax) {
        reason = "source_quota_exceeded";
      }
    } else if (
      candidate.resumeProjectId !== null ||
      candidate.personalizationSourceId !== null
    ) {
      reason = "invalid_source_metadata";
    }

    if (reason) {
      rejected.push({ question: candidate.question, reason });
      continue;
    }
    accepted.push(candidate);
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
