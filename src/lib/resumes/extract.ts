import fs from "node:fs/promises";
import path from "node:path";

import { extractDocumentText } from "@/lib/documents/extract-text";
import { assertPathInsideResumeDir } from "./storage";

export type ResumeExperienceType = "internship" | "project";

export type ExtractedResumeExperience = {
  title: string;
  type: ResumeExperienceType;
  organization: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  sourceText: string;
  sortOrder: number;
};

/**
 * 基于章节标题的规则抽取：没有模型可用时的降级路径。
 *
 * 只认"实习/项目"章节里的条目。识别不到章节就返回空——宁可让用户手动补充，
 * 也不把教育经历、荣誉奖项这类带日期的块硬凑成项目。
 */

const MAX_EXPERIENCES = 50;

const SECTION_HEADINGS: { type: ResumeExperienceType | "end"; headings: string[] }[] = [
  {
    type: "internship",
    headings: [
      "实习经历",
      "实习经验",
      "工作经历",
      "工作经验",
      "实践经历",
      "experience",
      "work experience",
      "internship",
      "internships",
      "internship experience",
      "professional experience",
      "research experience",
    ],
  },
  {
    type: "project",
    headings: [
      "个人项目",
      "项目经历",
      "项目经验",
      "项目",
      "科研项目",
      "科研经历",
      "projects",
      "project experience",
      "selected projects",
      "personal projects",
    ],
  },
  {
    type: "end",
    headings: [
      "教育经历",
      "教育背景",
      "专业技能",
      "技能",
      "技能清单",
      "获奖经历",
      "荣誉奖项",
      "荣誉",
      "证书",
      "自我评价",
      "个人评价",
      "校园经历",
      "社团经历",
      "联系方式",
      "主修课程",
      "education",
      "skills",
      "technical skills",
      "awards",
      "honors",
      "certifications",
      "contact",
      "summary",
    ],
  },
];

/**
 * 长标题优先，避免"项目"抢先匹配"项目经历 …"这种行。
 * PDF 常把标题排成"S KILLS"这样的字距样式，字符之间允许一个空格。
 */
const HEADING_CANDIDATES = SECTION_HEADINGS.flatMap((section) =>
  section.headings.map((heading) => ({
    type: section.type,
    pattern: new RegExp(
      `^${[...heading].map((char) => (char === " " ? "\\s?" : char)).join("\\s?")}`,
      "i",
    ),
  })),
).sort((left, right) => right.pattern.source.length - left.pattern.source.length);

/** 标题前后常见的装饰与分隔：图标、冒号、竖线、破折号。 */
const HEADING_DECORATION_PATTERN = /^[\s■●◆▶►▪•·#|｜\-–—:：/]+/;

const DATE_TOKEN_PATTERN =
  "(?:20\\d{2}|19\\d{2})(?:[./年\\s]*(?:0?[1-9]|1[0-2]))?|至今|present|now";
const DATE_RANGE_PATTERN = new RegExp(
  `(${DATE_TOKEN_PATTERN})(?:\\s*[-~–—至到]\\s*(${DATE_TOKEN_PATTERN})?)?`,
  "i",
);
const ENGLISH_MONTH_PATTERN =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const ENGLISH_DATE_PATTERN = new RegExp(
  `\\b${ENGLISH_MONTH_PATTERN}\\.?\\s+(?:\\d{4}|present|now)\\b`,
  "i",
);
const ENGLISH_TRAILING_DATE_PATTERN = new RegExp(
  `\\s+${ENGLISH_MONTH_PATTERN}\\.?\\s+(?:\\d{4})?(?:\\s*[-\\u2013\\u2014~]\\s*(?:${ENGLISH_MONTH_PATTERN}\\.?\\s*)?(?:\\d{4}|present|now))?\\s*$`,
  "i",
);
const ENGLISH_COMPACT_TRAILING_DATE_PATTERN = new RegExp(
  `\\s+${ENGLISH_MONTH_PATTERN}\\.?\\s+${ENGLISH_MONTH_PATTERN}\\.?\\s*\\d{4}\\s*$`,
  "i",
);

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isLikelyPdfBinaryText(text: string): boolean {
  const sample = text.trimStart().slice(0, 800);
  return (
    sample.startsWith("%PDF-") ||
    (/\/Linearized\s+\d/.test(sample) && /\bendobj\b/.test(sample)) ||
    (/\bobj\b/.test(sample) && /\bxref\b/.test(sample) && /\btrailer\b/.test(sample))
  );
}

type HeadingMatch = {
  type: ResumeExperienceType | "end";
  /** 标题之后同一行剩下的内容；标题独占一行时为空串。 */
  rest: string;
};

/**
 * 标题只要出现在行首就算，后面的内容归入该章节的第一行。
 * 简历常把标题和首条经历排在同一行，或者中英双语标题并列。
 */
function matchHeading(line: string): HeadingMatch | null {
  const stripped = line.replace(HEADING_DECORATION_PATTERN, "");

  for (const candidate of HEADING_CANDIDATES) {
    const matched = stripped.match(candidate.pattern);
    if (!matched) continue;
    const remainder = stripped.slice(matched[0].length);
    // 行首恰好是标题词，但后面紧跟别的字（如"项目经理实习生"）不算标题。
    if (remainder && !HEADING_DECORATION_PATTERN.test(remainder)) continue;

    const rest = remainder.replace(HEADING_DECORATION_PATTERN, "").trim();
    const bilingual = rest ? matchHeading(rest) : null;
    return bilingual && bilingual.type === candidate.type
      ? bilingual
      : { type: candidate.type, rest };
  }
  return null;
}

function hasDateRange(line: string): boolean {
  return DATE_RANGE_PATTERN.test(line) || ENGLISH_DATE_PATTERN.test(line);
}

function stripTrailingDateText(line: string): string {
  return line
    .replace(ENGLISH_COMPACT_TRAILING_DATE_PATTERN, "")
    .replace(ENGLISH_TRAILING_DATE_PATTERN, "")
    .trim();
}

function looksLikeNewItem(line: string): boolean {
  const trimmed = line.trim();
  if (/^[-•·]/.test(trimmed)) {
    return false;
  }
  if (hasDateRange(trimmed)) {
    return true;
  }
  if (/^[a-z]/.test(trimmed) || /[.!?,;。；，：:]$/.test(trimmed)) {
    return false;
  }
  return trimmed.length <= 80;
}

function splitSectionItems(lines: string[]): string[][] {
  const items: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (
      current.length > 0 &&
      (hasDateRange(line) || (current.length > 1 && looksLikeNewItem(line)))
    ) {
      items.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    items.push(current);
  }

  return items;
}

export function cleanResumeDate(value: string | null | undefined): string | null {
  return value
    ? value
        .replace(/\s+/g, "")
        .replace(/[年月]/g, ".")
        .replace(/\.$/, "")
    : null;
}

function isNoiseTitle(title: string, sourceText: string): boolean {
  if (isLikelyPdfBinaryText(sourceText)) {
    return true;
  }
  if (/^%PDF-/i.test(title)) {
    return true;
  }
  if (/^(obj|endobj|xref|trailer|stream|endstream)$/i.test(title)) {
    return true;
  }
  return /^[\d\s./[\]<>%-]+$/.test(title);
}

function cleanTitle(title: string): string {
  return title.replace(/\s*[–—]\s*/g, " - ").replace(/\s+/g, " ").trim();
}

function parseItem(
  lines: string[],
  type: ResumeExperienceType,
  sortOrder: number,
): ExtractedResumeExperience | null {
  const sourceText = lines.join("\n").slice(0, 2000);
  const heading = lines[0]?.replace(/^[-•·]\s*/, "").trim();
  if (!heading) {
    return null;
  }

  const dateMatch = heading.match(DATE_RANGE_PATTERN);
  const headingWithoutDate = stripTrailingDateText(heading)
    .replace(DATE_RANGE_PATTERN, "")
    .trim();
  const parts = headingWithoutDate
    .split(/\s{1,}|[|｜]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const organization = type === "internship" && parts.length > 1 ? parts[0] : null;
  const title = cleanTitle(
    type === "internship" && parts.length > 1
      ? parts.slice(1).join(" ")
      : headingWithoutDate || heading,
  );
  const description = lines
    .slice(1)
    .map((line) => line.replace(/^[-•·]\s*/, "").trim())
    .filter(Boolean)
    .join("\n");

  if (!title || title.length < 2 || isNoiseTitle(title, sourceText)) {
    return null;
  }

  return {
    title: title.slice(0, 160),
    type,
    organization,
    description: description ? description.slice(0, 2000) : null,
    startDate: cleanResumeDate(dateMatch?.[1]),
    endDate: cleanResumeDate(dateMatch?.[2]),
    sourceText,
    sortOrder,
  };
}

export function extractResumeExperiencesFromText(
  text: string,
): ExtractedResumeExperience[] {
  if (isLikelyPdfBinaryText(text)) {
    return [];
  }

  const extracted: ExtractedResumeExperience[] = [];
  let currentType: ResumeExperienceType | null = null;
  let sectionLines: string[] = [];

  function flushSection() {
    if (!currentType || sectionLines.length === 0) {
      return;
    }
    for (const itemLines of splitSectionItems(sectionLines)) {
      const item = parseItem(itemLines, currentType, extracted.length);
      if (item) {
        extracted.push(item);
      }
    }
  }

  for (const line of normalizeLines(text)) {
    const heading = matchHeading(line);
    if (heading) {
      flushSection();
      currentType = heading.type === "end" ? null : heading.type;
      sectionLines = currentType && heading.rest ? [heading.rest] : [];
      continue;
    }

    if (currentType) {
      sectionLines.push(line);
    }
  }

  flushSection();
  return extracted.slice(0, MAX_EXPERIENCES).map((item, index) => ({
    ...item,
    sortOrder: index,
  }));
}

export async function extractResumeTextFromFile(
  filePath: string,
  mimeType: string,
): Promise<string> {
  const safePath = assertPathInsideResumeDir(filePath);
  const bytes = await fs.readFile(safePath);
  try {
    return await extractDocumentText({
      bytes,
      fileName: path.basename(safePath),
      mimeType,
    });
  } catch (error) {
    if (path.extname(safePath).toLowerCase() !== ".pdf") throw error;

    console.warn(
      "[resumes] pdf text extraction failed; skipping PDF binary fallback:",
      error instanceof Error ? error.message : "unknown error",
    );
    return "";
  }
}
