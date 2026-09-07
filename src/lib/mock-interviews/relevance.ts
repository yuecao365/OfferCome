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

const WRAPPING_QUOTES = /^[\s“”‘’"'「」『』《》【】]+|[\s“”‘’"'「」『』《》【】。；;，,]+$/g;
const QUOTED_SEGMENT = /[“"「『]([^”"」』]{2,})[”"」』]/g;

/**
 * 模型常把逐字引用用“”包起来，或写成“该岗位需要“……””这种带前缀的形式。
 * 引号不是原文的一部分，去掉包裹引号后整体匹配；仍不匹配就取引号内片段逐个试。
 * 评测第一次真跑时 8/8 道题因此被判为意译，蓝图里全部能力也被连带降级。
 */
function evidenceCandidates(evidence: string): string[] {
  const stripped = evidence.replace(WRAPPING_QUOTES, "");
  const quoted = [...evidence.matchAll(QUOTED_SEGMENT)].map((match) => match[1]);
  return [stripped, ...quoted].map(normalizedText).filter((item) => item.length >= 2);
}

export function isJobDescriptionEvidence(
  jobDescription: string,
  evidence: string,
): boolean {
  const haystack = normalizedText(jobDescription);
  return evidenceCandidates(evidence).some((candidate) => haystack.includes(candidate));
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

function seededCompetencyMatch(
  text: string,
  blueprint: MockInterviewJobBlueprint,
): CompetencyMatch {
  const match = bestCompetencyMatch(text, blueprint);
  if (match.competencyId) return match;
  const fallback =
    blueprint.competencies.find((item) => item.priority === "core") ??
    blueprint.competencies[0];
  return { competencyId: fallback?.id ?? "", relevance: 0 };
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
  seedQuestionId?: string | null;
  seedInsightId?: string | null;
}): RelevantPersonalizationContext {
  const history = input.context.history
    .map((item): RelevantHistoryItem => {
      const seeded = item.questionId === input.seedQuestionId;
      const match = seeded
        ? seededCompetencyMatch(item.question, input.blueprint)
        : bestCompetencyMatch(item.question, input.blueprint);
      const titleRelevance = tokenCoverage(item.jobTitle, input.jobTitle);
      return {
        ...item,
        jobCompetencyId: match.competencyId,
        jobRelevance: Number(
          (match.relevance * 0.9 + titleRelevance * 0.1).toFixed(3),
        ),
      };
    })
    .filter(
      (item) =>
        item.jobCompetencyId &&
        (item.questionId === input.seedQuestionId || item.jobRelevance >= 0.16),
    )
    .toSorted((left, right) =>
      Number(right.questionId === input.seedQuestionId) -
        Number(left.questionId === input.seedQuestionId) ||
      right.jobRelevance - left.jobRelevance,
    )
    .slice(0, 12);

  const profileInsights = input.context.profile.insights
    .map((insight): RelevantProfileInsight => {
      const text = `${insight.title}\n${insight.statement}`;
      const match =
        insight.id === input.seedInsightId
          ? seededCompetencyMatch(text, input.blueprint)
          : bestCompetencyMatch(text, input.blueprint);
      return {
        ...insight,
        jobCompetencyId: match.competencyId,
        jobRelevance: Number(match.relevance.toFixed(3)),
      };
    })
    .filter(
      (insight) =>
        insight.jobCompetencyId &&
        (insight.id === input.seedInsightId || insight.jobRelevance >= 0.16),
    )
    .toSorted((left, right) =>
      Number(right.id === input.seedInsightId) -
        Number(left.id === input.seedInsightId) ||
      right.jobRelevance - left.jobRelevance,
    )
    .slice(0, 8);

  return { history, profileInsights };
}
