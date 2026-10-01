import type { ContentLanguage } from "@/lib/i18n/locale";

import { isAreaKind, KIND_WEIGHT, type InterviewBrief } from "./brief/brief";
import type { EvaluationWeakness } from "./question-evaluation";
import { REPORT_VERSION, type HypothesisStatus, type MockInterviewReport, type ReportWeaknessKind } from "./report";
import { computeInterviewTotalScore } from "./scoring";
import type { SummaryInput, SummaryOutput } from "./summary-agent";

/**
 * 交卷的纯逻辑：把简报、线程与带评分的兼容题目拼成汇总 agent 的输入与报告。
 * 本地版从数据库读行喂进来（completion.ts），体验版从浏览器的会话文档喂进来。
 */

export type OutcomeThread = {
  areaId: string | null;
  kind: string;
  label: string;
  status: string;
  depth: number;
  questionId: string | null;
};

export type OutcomeQuestion = {
  id: string;
  skipped: boolean;
  evaluation: { score: number | null; weaknesses: EvaluationWeakness[] } | null;
};

export type AreaOutcome = { summary: SummaryInput["areas"][number]; scores: number[] };

/** 每个聊过的话题：种类、追问轮数、分数与短板；跳过的记 0 分；答了但评分失败的不计入总分。权重按种类（项目 3、场景 2、基础 1）。 */
export function areaOutcomes(_brief: InterviewBrief, threads: OutcomeThread[], questions: OutcomeQuestion[]): AreaOutcome[] {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  return threads.flatMap((thread) => {
    if (thread.status === "active") return [];
    const kind = isAreaKind(thread.kind) ? thread.kind : "quick";
    const question = thread.questionId ? (questionById.get(thread.questionId) ?? null) : null;
    const answered = question !== null && !question.skipped;
    const unscored = answered && (question.evaluation === null || question.evaluation.score === null);
    return [
      {
        scores: unscored ? [] : [question?.evaluation?.score ?? 0],
        summary: {
          name: thread.label,
          kind,
          weight: KIND_WEIGHT[kind],
          depthReached: thread.depth,
          skipped: !answered,
          score: answered ? (question.evaluation?.score ?? null) : null,
          weaknesses: question?.evaluation?.weaknesses ?? [],
        },
      },
    ];
  });
}

export function summaryInput(input: { jobTitle: string; brief: InterviewBrief; areas: AreaOutcome[]; notes: string }): SummaryInput {
  return {
    jobTitle: input.jobTitle,
    pace: input.brief.pace,
    areas: input.areas.map((area) => area.summary),
    notes: input.notes,
    hypotheses: input.brief.hypotheses.map((hypothesis) => ({ text: hypothesis.text, source: hypothesis.source })),
  };
}

/** 代码直接写进报告的固定句，按场次语言（brief.language）。 */
const REPORT_COPY = {
  zh: {
    openHypothesis: "这场没有问到。",
    allSkipped: {
      summary: "本场所有题目均已跳过，暂时没有可评分的回答。",
      point: "没有作答的题目",
      practice: "重新发起一场模拟面试，完整回答至少一道题。",
    },
  },
  en: {
    openHypothesis: "Not covered in this interview.",
    allSkipped: {
      summary: "Every question in this session was skipped, so there are no answers to score yet.",
      point: "No questions were answered",
      practice: "Start another mock interview and answer at least one question in full.",
    },
  },
} satisfies Record<ContentLanguage, unknown>;

/** 全场都跳过时不调模型，用固定文案。 */
export function allSkippedSummary(language: ContentLanguage = "zh"): SummaryOutput {
  const copy = REPORT_COPY[language].allSkipped;
  return {
    summary: copy.summary,
    strengths: [],
    weaknesses: [{ point: copy.point, areaName: null, kind: "missing", practice: copy.practice }],
    hypotheses: [],
  };
}

/**
 * 模型常把状态词写进结论开头（"refuted：…"、"Confirmed — …"、"[Open] …"），去掉。
 * 中文场次沿用原来的规则；英文场次要求状态词后面跟标点或被括起来，免得误删以 "Open source …" 开头的正常句子，去掉后首字母大写。
 */
const EN_STATUS = String.raw`(?:partially\s+)?(?:confirmed|refuted|open|unconfirmed|verified|not\s+(?:asked|covered|tested|reached))`;
const EN_BRACKETED_STATUS = new RegExp(String.raw`^\s*[\[(*_]+\s*${EN_STATUS}\s*[\])*_]+\s*(?:[:：,，.;\-–—]+\s*)?`, "i");
const EN_LABELLED_STATUS = new RegExp(String.raw`^\s*(?:status\s*[:：\-–—]\s*)?${EN_STATUS}\s*[:：,，.;\-–—]+\s*`, "i");

export function cleanHypothesisVerdict(verdict: string, language: ContentLanguage = "zh"): string {
  if (language === "zh") return verdict.replace(/^(confirmed|refuted|open|已验证|已否定|没问到)\s*[:：,，]?\s*/i, "").trim();
  const stripped = verdict.replace(EN_BRACKETED_STATUS, "").replace(EN_LABELLED_STATUS, "").trim();
  if (!stripped) return verdict.trim();
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** 汇总 agent 的原始产出（schema 校验过）；validateSummary 把它收成报告字段。 */
export type SummaryDraft = {
  summary: string;
  strengths: { point: string; areaName: string }[];
  weaknesses: { point: string; areaName: string; kind: ReportWeaknessKind; practice: string }[];
  hypotheses: { text: string; status: HypothesisStatus; verdict: string }[];
};

/**
 * 领域名必须存在；pattern 至少要能对应两个领域的短板，否则降为 missing。
 * 简历假设以输入为准（模型漏掉的补上）；没问到的结论固定（按场次语言）。
 */
export function validateSummary(output: SummaryDraft, input: SummaryInput, language: ContentLanguage = "zh"): SummaryOutput {
  const areaNames = new Set(input.areas.map((area) => area.name));
  const areasWithWeakness = input.areas.filter((area) => area.weaknesses.length > 0).length;
  const area = (name: string) => (areaNames.has(name) ? name : null);
  const judged = new Map(output.hypotheses.map((item) => [item.text, item]));
  return {
    summary: output.summary,
    strengths: output.strengths.map((item) => ({ point: item.point, areaName: area(item.areaName) })),
    weaknesses: output.weaknesses.map((item) => ({
      point: item.point,
      areaName: area(item.areaName),
      kind: item.kind === "pattern" && areasWithWeakness < 2 ? "missing" : item.kind,
      practice: item.practice,
    })),
    hypotheses: input.hypotheses.map(({ text, source }) => {
      const judgement = judged.get(text);
      const status = judgement?.status ?? "open";
      return { text, source, status, verdict: status === "open" ? REPORT_COPY[language].openHypothesis : cleanHypothesisVerdict(judgement?.verdict ?? "", language) };
    }),
  };
}

export function buildReport(areas: AreaOutcome[], summary: SummaryOutput): MockInterviewReport {
  return {
    version: REPORT_VERSION,
    totalScore: computeInterviewTotalScore(areas.map((area) => ({ weight: area.summary.weight, scores: area.scores }))),
    ...summary,
  };
}
