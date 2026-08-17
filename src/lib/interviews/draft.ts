import { z } from "zod";

import { isAgentRunError, runAgent } from "@/lib/ai/run-agent";
import { getAiTaskConfig, isAiTaskConfigured } from "@/lib/settings/ai";

import {
  INTERVIEW_QUESTION_CATEGORIES,
  INTERVIEW_QUESTION_CATEGORY_LABELS,
  INTERVIEW_ROUNDS,
  normalizeInterviewRound,
  type InterviewQuestionCategory,
  type InterviewRound,
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

/**
 * 从面试文本里顺带识别出的头部信息，用于预填表单，省掉用户手输。
 * 只在文本明确提到时才有值；全部可为 null，预填后用户仍可修改。
 */
export type InterviewDraftHeader = {
  companyName: string | null;
  jobTitle: string | null;
  round: InterviewRound | null;
  /** "YYYY-MM-DD" 或 "YYYY-MM-DD HH:mm"，未提到时为 null。 */
  interviewedAt: string | null;
};

export const EMPTY_DRAFT_HEADER: InterviewDraftHeader = {
  companyName: null,
  jobTitle: null,
  round: null,
  interviewedAt: null,
};

export type InterviewDraft = {
  questions: InterviewDraftQuestion[];
  provider: "heuristic" | "openai";
  header: InterviewDraftHeader;
  /** 模型给出、但无法在原文中逐字定位的问题原句，只用于如实告知与排查。 */
  unmatchedQuestions: string[];
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
  header: z
    .object({
      companyName: z.string().min(1).max(120).nullable(),
      jobTitle: z.string().min(1).max(120).nullable(),
      round: z.enum(INTERVIEW_ROUNDS).nullable(),
      interviewedAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/)
        .nullable()
        .describe("文本中明确提到的面试日期（可含时间）；没提到就是 null"),
    })
    .describe("只在文本明确提到时填写，绝不猜测"),
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

/** 至少两问两答才算成型的问答轮次，避免复盘里偶然出现一句“问题：…”被误判。 */
const VERBATIM_TURN_THRESHOLD = 4;

/**
 * 逐字稿带说话人/问答前缀，事后写的复盘总结是叙述文字。用它替代让用户自己
 * 声明材料类型——用户很难判准，判错只会让画像权重失真。
 */
export function looksLikeVerbatimTranscript(text: string): boolean {
  const turns = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => QUESTION_PREFIX.test(line) || ANSWER_PREFIX.test(line)).length;
  return turns >= VERBATIM_TURN_THRESHOLD;
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

  return {
    questions,
    provider: "heuristic",
    header: EMPTY_DRAFT_HEADER,
    unmatchedQuestions: [],
  };
}

/** 模型输出已过 schema 校验，这里只做修剪和空值归一。 */
function sanitizeDraftHeader(
  header: z.infer<typeof generatedDraftSchema>["header"],
): InterviewDraftHeader {
  return {
    companyName: header.companyName?.trim() || null,
    jobTitle: header.jobTitle?.trim() || null,
    round: header.round ? normalizeInterviewRound(header.round) : null,
    interviewedAt: header.interviewedAt?.trim() || null,
  };
}

type GeneratedDraft = z.infer<typeof generatedDraftSchema>;

type SourceRange = {
  start: number;
  end: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 逐字符放宽匹配的长度上限，避免为超长引用构造巨大的正则。 */
const LOOSE_MATCH_MAX_LENGTH = 300;

function matchInSource(
  source: string,
  pattern: string,
  from: number,
  before: number,
): SourceRange | null {
  const match = new RegExp(pattern, "u").exec(source.slice(from, before));
  return match
    ? { start: from + match.index, end: from + match.index + match[0].length }
    : null;
}

/**
 * 在原文中定位模型给出的引用。放宽的只是“怎么找”，返回的始终是原文区间，
 * 因此不会把模型改写过的措辞混进结果里。
 */
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

  const whitespaceTolerant = matchInSource(
    source,
    parts.map(escapeRegExp).join("\\s+"),
    from,
    before,
  );
  if (whitespaceTolerant) return whitespaceTolerant;

  // PDF 抽取的文本可能在任意位置夹带空格或换行，而模型复制时会去掉它们，
  // 最后再退一步：允许字符之间出现任意空白。
  const compact = quote.replace(/\s+/g, "");
  if (!compact || compact.length > LOOSE_MATCH_MAX_LENGTH) return null;
  return matchInSource(
    source,
    [...compact].map(escapeRegExp).join("\\s*"),
    from,
    before,
  );
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

  const unmatchedQuestions: string[] = [];
  for (const generated of draft.questions) {
    const range = findSourceRange(source, generated.question, searchFrom);
    if (!range) {
      unmatchedQuestions.push(generated.question);
      continue;
    }
    locatedQuestions.push({ generated, range });
    searchFrom = range.end;
  }

  // 定位不到的问题只能丢弃——绝不能拿模型改写过的文字冒充原文。但也不能
  // 因此作废整份草稿：把定位成功的照常返回，丢了几条如实报给调用方。
  return {
    provider: "openai",
    header: sanitizeDraftHeader(draft.header),
    unmatchedQuestions,
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

const INTERVIEW_DRAFT_PROMPT_VERSION = "interview-draft-v1";

async function structureWithConfiguredModel(
  text: string,
  projects: InterviewDraftProject[],
): Promise<InterviewDraft> {
  const config = await getAiTaskConfig("text");
  if (!isAiTaskConfigured(config)) {
    return structureInterviewTextHeuristically(text, projects);
  }

  try {
    const { output } = await runAgent({
      agent: "interview_draft_structuring",
      config,
      feature: "面试草稿识别",
      promptVersion: INTERVIEW_DRAFT_PROMPT_VERSION,
      schema: generatedDraftSchema,
      schemaName: "InterviewQuestionBoundaries",
      schemaDescription: "面试问题、回答原文边界、分类及关联项目",
      timeoutMs: 60_000,
      system:
        "你是面试问答边界识别助手，不是摘要助手。找出文本中真实出现的每一个面试问题，包括没有回答的问题。question 必须从输入中连续逐字复制，不得改写、纠错、缩写或补写。不要根据候选人的回答反推输入中不存在的问题。对于有回答的问题，只返回回答开头和结尾各 20～60 个字符的连续原文引用，禁止返回或概括完整回答；两个引用必须能在输入中原样找到，并排除面试官的过渡语。没有回答时两个引用都返回 null。根据语义将问题分类为 resume_project、technical 或 general。只有明确匹配候选项目时才填写关联项目 ID。confidence 表示边界和分类的可信度。header 中填写文本明确提到的公司名称、岗位名称、面试轮次和面试日期；文本没有明确提到的字段一律填 null，绝不根据行业或语气猜测。",
      payload: { candidateProjects: projects, interviewText: text },
    });
    const draft = reconstructGeneratedDraft(text, output, projects);
    if (draft.unmatchedQuestions.length > 0) {
      // 打出原句，便于判断是模型改写了措辞，还是抽取出的原文有问题。
      console.warn(
        `[interviews] ${draft.unmatchedQuestions.length} question(s) not found in source:`,
        draft.unmatchedQuestions.map((question) => question.slice(0, 80)),
      );
    }
    return draft;
  } catch (error) {
    if (isAgentRunError(error)) {
      throw new Error(
        error.kind === "timeout"
          ? "面试文本识别超时。模型服务响应较慢，请稍后重试或缩短文本。"
          : "面试文本识别失败。模型没有返回可用的结构化结果，请重试。",
        { cause: error },
      );
    }
    throw error;
  }
}

export async function structureInterviewText(
  text: string,
  projects: InterviewDraftProject[],
): Promise<InterviewDraft> {
  const normalized = normalizeText(text);
  if (!normalized) throw new Error("没有可用于识别的面试文本。");

  const result = await structureWithConfiguredModel(normalized, projects);
  if (result.questions.length > 0) return result;

  // 模型的结果一条都定位不到时退回规则解析：宁可给一份可编辑的粗略草稿，
  // 也不要甩给用户一个只能“重试”的报错。
  const fallback = structureInterviewTextHeuristically(normalized, projects);
  if (fallback.questions.length > 0) return fallback;

  throw new Error(
    "没有识别到明确的面试问题。请使用“问题：… / 回答：…”格式补充文本后重试。",
  );
}
