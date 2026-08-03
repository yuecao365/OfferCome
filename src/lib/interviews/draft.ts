import { generateText, Output } from "ai";
import { z } from "zod";

import { createTextModel } from "@/lib/ai/providers";
import { getAiTaskConfig } from "@/lib/settings/ai";

import {
  INTERVIEW_QUESTION_CATEGORIES,
  INTERVIEW_QUESTION_CATEGORY_LABELS,
  type InterviewQuestionCategory,
} from "./types";

export type InterviewDraftProject = {
  id: string;
  name: string;
  type: string;
  organization: string;
};

export type InterviewDraftQuestion = {
  question: string;
  answer: string;
  type: string;
  category: InterviewQuestionCategory;
  relatedItemId: string | null;
  relatedItemName: string | null;
  confidence: number;
};

export type InterviewDraft = {
  questions: InterviewDraftQuestion[];
  provider: "heuristic" | "openai";
};

type ParsedExchange = { question: string; answer: string };

const QUESTION_PREFIX =
  /^(?:q(?:uestion)?|问题|提问|问|面试官|interviewer)\s*[:：]\s*(.+)$/i;
const ANSWER_PREFIX =
  /^(?:a(?:nswer)?|回答|答|候选人|应聘者|我|candidate)\s*[:：]\s*(.*)$/i;
const NUMBERED_QUESTION = /^(?:\d+[.)、]\s*)?(.+[?？])$/;
const TECHNICAL_KEYWORDS =
  /(react|vue|angular|javascript|typescript|java|python|golang|数据库|算法|网络|操作系统|缓存|线程|进程|前端|后端|接口|架构|性能|源码|原理|技术栈)/i;
const PROJECT_KEYWORDS = /(项目|实习|经历|负责|公司|业务|系统|作品)/i;

const generatedDraftSchema = z.object({
  questions: z.array(
    z.object({
      question: z
        .string()
        .min(1)
        .describe("面试文本中连续、逐字复制的问题原文，不得改写或概括"),
      answerStartQuote: z
        .string()
        .min(1)
        .max(120)
        .nullable()
        .describe("回答开头的连续原文引用；没有回答时为 null"),
      answerEndQuote: z
        .string()
        .min(1)
        .max(120)
        .nullable()
        .describe("回答结尾的连续原文引用；没有回答时为 null"),
      category: z.enum(INTERVIEW_QUESTION_CATEGORIES),
      relatedItemId: z.string().nullable(),
      relatedItemName: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export function parseInterviewExchanges(text: string): ParsedExchange[] {
  const lines = normalizeText(text)
    .replace(/([?？])(?=\S)/g, "$1\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const exchanges: ParsedExchange[] = [];
  let current: ParsedExchange | null = null;

  const flush = () => {
    if (current?.question) {
      exchanges.push({
        question: current.question.trim(),
        answer: current.answer.trim(),
      });
    }
    current = null;
  };

  for (const line of lines) {
    const prefixedQuestion = line.match(QUESTION_PREFIX);
    const numberedQuestion = line.match(NUMBERED_QUESTION);
    if (prefixedQuestion || numberedQuestion) {
      flush();
      current = {
        question: (prefixedQuestion?.[1] ?? numberedQuestion?.[1] ?? "").trim(),
        answer: "",
      };
      continue;
    }

    const answer = line.match(ANSWER_PREFIX);
    if (answer && current) {
      current.answer = [current.answer, answer[1]].filter(Boolean).join("\n");
      continue;
    }

    if (current) {
      current.answer = [current.answer, line].filter(Boolean).join("\n");
    }
  }

  flush();
  return exchanges.slice(0, 100);
}

function findRelatedProject(
  text: string,
  projects: InterviewDraftProject[],
): InterviewDraftProject | null {
  const normalized = text.toLowerCase();
  return (
    projects.find((project) =>
      [
        project.name,
        project.name.split(/\s+[-–—|]\s+/)[0],
        project.organization,
      ]
        .filter(Boolean)
        .some((name) => {
          const alias = name.trim().toLowerCase();
          return alias.length >= 4 && normalized.includes(alias);
        }),
    ) ?? null
  );
}

function classifyQuestion(
  question: string,
  answer: string,
  projects: InterviewDraftProject[],
): { category: InterviewQuestionCategory; project: InterviewDraftProject | null } {
  const content = `${question}\n${answer}`;
  const project = findRelatedProject(content, projects);
  if (project || PROJECT_KEYWORDS.test(question)) {
    return { category: "resume_project", project };
  }
  if (TECHNICAL_KEYWORDS.test(content)) {
    return { category: "technical", project: null };
  }
  return { category: "general", project: null };
}

export function structureInterviewTextHeuristically(
  text: string,
  projects: InterviewDraftProject[],
): InterviewDraft {
  const questions = parseInterviewExchanges(text).map((exchange) => {
    const { category, project } = classifyQuestion(
      exchange.question,
      exchange.answer,
      projects,
    );
    return {
      ...exchange,
      category,
      type: INTERVIEW_QUESTION_CATEGORY_LABELS[category],
      relatedItemId: project?.id ?? null,
      relatedItemName: project?.name ?? null,
      confidence: project ? 0.85 : category === "general" ? 0.62 : 0.72,
    };
  });

  return { questions, provider: "heuristic" };
}

type GeneratedDraft = z.infer<typeof generatedDraftSchema>;

type SourceRange = {
  start: number;
  end: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findSourceRange(
  source: string,
  quote: string,
  from: number,
  before = source.length,
): SourceRange | null {
  const exactStart = source.indexOf(quote, from);
  if (exactStart >= from && exactStart + quote.length <= before) {
    return { start: exactStart, end: exactStart + quote.length };
  }

  const parts = quote.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const whitespaceTolerantQuote = parts.map(escapeRegExp).join("\\s+");
  const match = new RegExp(whitespaceTolerantQuote, "u").exec(
    source.slice(from, before),
  );
  return match
    ? {
        start: from + match.index,
        end: from + match.index + match[0].length,
      }
    : null;
}

function extractVerbatimAnswer(
  source: string,
  questionEnd: number,
  nextQuestionStart: number,
  answerStartQuote: string | null,
  answerEndQuote: string | null,
): string {
  if (!answerStartQuote && !answerEndQuote) return "";

  if (answerStartQuote && answerEndQuote) {
    const answerStart = findSourceRange(
      source,
      answerStartQuote,
      questionEnd,
      nextQuestionStart,
    );
    if (answerStart) {
      const answerEnd = findSourceRange(
        source,
        answerEndQuote,
        answerStart.start,
        nextQuestionStart,
      );
      if (answerEnd) {
        return source.slice(answerStart.start, answerEnd.end).trim();
      }
    }
  }

  // Boundary quotes are model-produced and may occasionally differ only in
  // punctuation. Preserve the source between questions instead of replacing
  // it with a model summary or silently discarding it.
  return source.slice(questionEnd, nextQuestionStart).trim();
}

export function reconstructGeneratedDraft(
  source: string,
  draft: z.infer<typeof generatedDraftSchema>,
  projects: InterviewDraftProject[],
): InterviewDraft {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const locatedQuestions: Array<{
    generated: GeneratedDraft["questions"][number];
    range: SourceRange;
  }> = [];
  let searchFrom = 0;

  if (draft.questions.length > 100) {
    throw new Error("单次最多识别 100 个面试问题，请拆分文本后重试。");
  }

  for (const generated of draft.questions) {
    const range = findSourceRange(source, generated.question, searchFrom);
    if (!range) continue;
    locatedQuestions.push({ generated, range });
    searchFrom = range.end;
  }

  if (locatedQuestions.length !== draft.questions.length) {
    throw new Error(
      "部分问题没有逐字匹配到原始面试文本，为避免丢失或改写内容，本次草稿已取消，请重试。",
    );
  }

  return {
    provider: "openai",
    questions: locatedQuestions.map(({ generated, range }, index) => {
      const project = generated.relatedItemId
        ? projectsById.get(generated.relatedItemId) ?? null
        : findRelatedProject(generated.relatedItemName ?? "", projects);
      const category = generated.category;
      const nextQuestionStart =
        locatedQuestions[index + 1]?.range.start ?? source.length;
      return {
        question: source.slice(range.start, range.end).trim(),
        answer: extractVerbatimAnswer(
          source,
          range.end,
          nextQuestionStart,
          generated.answerStartQuote,
          generated.answerEndQuote,
        ),
        category,
        type: INTERVIEW_QUESTION_CATEGORY_LABELS[category],
        relatedItemId: category === "resume_project" ? project?.id ?? null : null,
        relatedItemName:
          category === "resume_project" ? project?.name ?? null : null,
        confidence: generated.confidence,
      };
    }),
  };
}

async function structureWithConfiguredModel(
  text: string,
  projects: InterviewDraftProject[],
): Promise<InterviewDraft> {
  const config = await getAiTaskConfig("text");
  if (config.requiresApiKey && !config.apiKey) {
    return structureInterviewTextHeuristically(text, projects);
  }

  const { output } = await generateText({
    model: createTextModel(config),
    output: Output.object({
      name: "InterviewQuestionBoundaries",
      description: "面试问题、回答原文边界、分类及关联项目",
      schema: generatedDraftSchema,
    }),
    system:
      "你是面试问答边界识别助手，不是摘要助手。找出文本中真实出现的每一个面试问题，包括没有回答的问题。question 必须从输入中连续逐字复制，不得改写、纠错、缩写或补写。不要根据候选人的回答反推输入中不存在的问题。对于有回答的问题，只返回回答开头和结尾各 20～60 个字符的连续原文引用，禁止返回或概括完整回答；两个引用必须能在输入中原样找到，并排除面试官的过渡语。没有回答时两个引用都返回 null。根据语义将问题分类为 resume_project、technical 或 general。只有明确匹配候选项目时才填写关联项目 ID。confidence 表示边界和分类的可信度。",
    prompt: `候选实习/项目：\n${JSON.stringify(projects)}\n\n面试文本：\n${text}`,
  });

  return reconstructGeneratedDraft(text, output, projects);
}

export async function structureInterviewText(
  text: string,
  projects: InterviewDraftProject[],
): Promise<InterviewDraft> {
  const normalized = normalizeText(text);
  if (!normalized) throw new Error("没有可用于识别的面试文本。");

  const provider = process.env.INTERVIEW_STRUCTURE_PROVIDER ?? "auto";
  if (provider === "heuristic") {
    return structureInterviewTextHeuristically(normalized, projects);
  }
  if (provider !== "auto" && provider !== "openai") {
    throw new Error(`暂不支持结构化识别服务：${provider}`);
  }

  const result = await structureWithConfiguredModel(normalized, projects);
  if (result.questions.length === 0) {
    throw new Error(
      "没有识别到明确的面试问题。请使用“问题：… / 回答：…”格式补充文本后重试。",
    );
  }
  return result;
}
