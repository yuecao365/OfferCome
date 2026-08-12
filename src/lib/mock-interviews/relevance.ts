import type { CandidateProfileContextInsight } from "@/lib/candidate-profile/types";
import { normalizedText } from "@/lib/text/similarity";

import type { MockInterviewContext } from "./context";
import type { MockInterviewJobBlueprint } from "./types";

const STOP_TOKENS = new Set([
  "and",
  "for",
  "the",
  "with",
  "以及",
  "什么",
  "使用",
  "如何",
  "工作",
  "岗位",
  "技术",
  "相关",
  "经验",
  "要求",
  "负责",
  "进行",
  "问题",
  "能力",
]);

function tokenize(value: string): Set<string> {
  const normalized = normalizedText(value);
  const tokens = new Set<string>();
  for (const word of normalized.match(/[a-z0-9+#.]{2,}/g) ?? []) {
    if (!STOP_TOKENS.has(word)) tokens.add(word);
  }
  for (const segment of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (let size = 2; size <= Math.min(3, segment.length); size += 1) {
      for (let index = 0; index <= segment.length - size; index += 1) {
        const token = segment.slice(index, index + size);
        if (!STOP_TOKENS.has(token)) tokens.add(token);
      }
    }
  }
  return tokens;
}

function tokenCoverage(candidate: string, target: string): number {
  const candidateTokens = tokenize(candidate);
  if (candidateTokens.size === 0) return 0;
  const targetTokens = tokenize(target);
  let matches = 0;
  for (const token of candidateTokens) {
    if (targetTokens.has(token)) matches += 1;
  }
  return matches / candidateTokens.size;
}

export function isJobDescriptionEvidence(
  jobDescription: string,
  evidence: string,
): boolean {
  const normalizedEvidence = normalizedText(evidence);
  return (
    normalizedEvidence.length >= 2 &&
    normalizedText(jobDescription).includes(normalizedEvidence)
  );
}

type CompetencyMatch = {
  competencyId: string;
  relevance: number;
};

export function jobCompetencyRelevance(
  text: string,
  competency: MockInterviewJobBlueprint["competencies"][number],
): number {
  return tokenCoverage(
    text,
    `${competency.name}\n${competency.description}\n${competency.jdEvidence}`,
  );
}

function bestCompetencyMatch(
  text: string,
  blueprint: MockInterviewJobBlueprint,
): CompetencyMatch {
  let best: CompetencyMatch = { competencyId: "", relevance: 0 };
  for (const competency of blueprint.competencies) {
    const relevance = jobCompetencyRelevance(text, competency);
    if (relevance > best.relevance) {
      best = { competencyId: competency.id, relevance };
    }
  }
  return best;
}

export type RelevantHistoryItem = MockInterviewContext["history"][number] & {
  jobCompetencyId: string;
  jobRelevance: number;
};

export type RelevantProfileInsight = CandidateProfileContextInsight & {
  jobCompetencyId: string;
  jobRelevance: number;
};

export type RelevantPersonalizationContext = {
  history: RelevantHistoryItem[];
  profileInsights: RelevantProfileInsight[];
};

export function selectRelevantPersonalization(input: {
  context: MockInterviewContext;
  blueprint: MockInterviewJobBlueprint;
  jobTitle: string;
}): RelevantPersonalizationContext {
  const history = input.context.history
    .map((item): RelevantHistoryItem => {
      const match = bestCompetencyMatch(item.question, input.blueprint);
      const titleRelevance = tokenCoverage(item.jobTitle, input.jobTitle);
      return {
        ...item,
        jobCompetencyId: match.competencyId,
        jobRelevance: Number(
          (match.relevance * 0.9 + titleRelevance * 0.1).toFixed(3),
        ),
      };
    })
    .filter((item) => item.jobCompetencyId && item.jobRelevance >= 0.16)
    .toSorted((left, right) => right.jobRelevance - left.jobRelevance)
    .slice(0, 12);

  const profileInsights = input.context.profile.insights
    .map((insight): RelevantProfileInsight => {
      const match = bestCompetencyMatch(
        `${insight.title}\n${insight.statement}`,
        input.blueprint,
      );
      return {
        ...insight,
        jobCompetencyId: match.competencyId,
        jobRelevance: Number(match.relevance.toFixed(3)),
      };
    })
    .filter(
      (insight) => insight.jobCompetencyId && insight.jobRelevance >= 0.16,
    )
    .toSorted((left, right) => right.jobRelevance - left.jobRelevance)
    .slice(0, 8);

  return { history, profileInsights };
}
