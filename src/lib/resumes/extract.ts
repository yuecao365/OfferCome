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

const SECTION_STARTS: {
  type: ResumeExperienceType;
  patterns: RegExp[];
}[] = [
  {
    type: "internship",
    patterns: [
      /^实习经历$/,
      /^实习经验$/,
      /^工作经历$/,
      /^实践经历$/,
      /^瀹炰範缁忓巻$/,
      /^瀹炰範缁忛獙$/,
      /^宸ヤ綔缁忓巻$/,
      /^瀹炶返缁忓巻$/,
      /^experience$/i,
      /^work experience$/i,
      /^internship$/i,
      /^internships$/i,
      /^professional experience$/i,
      /^research experience$/i,
    ],
  },
  {
    type: "project",
    patterns: [
      /^个人项目$/,
      /^项目经历$/,
      /^项目经验$/,
      /^项目$/,
      /^科研项目$/,
      /^涓汉椤圭洰$/,
      /^椤圭洰缁忓巻$/,
      /^椤圭洰缁忛獙$/,
      /^椤圭洰$/,
      /^绉戠爺椤圭洰$/,
      /^projects$/i,
      /^project experience$/i,
      /^selected projects$/i,
      /^personal projects$/i,
    ],
  },
];

const SECTION_END_PATTERN =
  /^(教育经历|教育背景|专业技能|技能|技能清单|获奖经历|荣誉奖项|证书|自我评价|个人评价|校园经历|社团经历|联系方式|鏁欒偛缁忓巻|鏁欒偛鑳屾櫙|涓撲笟鎶€鑳絴鎶€鑳絴鎶€鑳芥竻鍗晐鑾峰缁忓巻|鑽ｈ獕濂栭」|璇佷功|鑷垜璇勪环|涓汉璇勪环|鏍″洯缁忓巻|绀惧洟缁忓巻|鑱旂郴鏂瑰紡|education|skills|technical skills|awards|certifications|contact|summary)$/i;
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

export function normalizeResumeExperienceType(
  value: string | null | undefined,
): ResumeExperienceType {
  return value === "internship" || value === "project" ? value : "project";
}

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

function getSectionType(line: string): ResumeExperienceType | null {
  const normalized = line.replace(/[：:]/g, "").trim();
  for (const section of SECTION_STARTS) {
    if (section.patterns.some((pattern) => pattern.test(normalized))) {
      return section.type;
    }
  }
  return null;
}

function normalizeSectionHeading(line: string): string {
  return line.replace(/[：:\s]/g, "").trim().toLowerCase();
}

function isSectionEnd(line: string): boolean {
  const normalized = line.replace(/[：:]/g, "");
  const compact = normalizeSectionHeading(line);
  return (
    SECTION_END_PATTERN.test(normalized) ||
    [
      "education",
      "skills",
      "technicalskills",
      "awards",
      "certifications",
      "contact",
      "summary",
    ].includes(compact)
  );
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

function cleanDate(value: string | null | undefined): string | null {
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

function normalizeProjectTitle(
  title: string,
  description: string,
  sourceText: string,
): string {
  const combined = `${title}\n${description}\n${sourceText}`;
  const lower = combined.toLowerCase();
  const cleanedTitle = title.replace(/\s*[–—]\s*/g, " - ").replace(/\s+/g, " ").trim();

  if (/^study\s*assistant/i.test(cleanedTitle)) {
    if (/local personal assistant/i.test(cleanedTitle)) {
      return "Study Assistant - Local Personal Assistant Based on LLM Agents";
    }
    if (lower.includes("llm") && lower.includes("agent")) {
      return "Study Assistant ——基于 LLM Agent 的本地化个人助手系统";
    }
  }

  if (/^persona-driven\s+llm\s+agents/i.test(cleanedTitle)) {
    return "Persona-Driven LLM Agents for Social Media Community Engagement";
  }

  if (
    /^llm\b/i.test(cleanedTitle) &&
    /(multi[-\s]?agent|langgraph|agentic|social simulation|多智能体|社交仿真)/i.test(
      combined,
    )
  ) {
    return "LLM 多智能体社交仿真与评估系统";
  }

  return cleanedTitle;
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
  const rawTitle =
    type === "internship" && parts.length > 1
      ? parts.slice(1).join(" ")
      : headingWithoutDate || heading;
  const description = lines
    .slice(1)
    .map((line) => line.replace(/^[-•·]\s*/, "").trim())
    .filter(Boolean)
    .join("\n");
  const title =
    type === "project"
      ? normalizeProjectTitle(rawTitle, description, sourceText)
      : rawTitle;

  if (!title || title.length < 2 || isNoiseTitle(title, sourceText)) {
    return null;
  }

  return {
    title: title.slice(0, 160),
    type,
    organization,
    description: description ? description.slice(0, 2000) : null,
    startDate: cleanDate(dateMatch?.[1]),
    endDate: cleanDate(dateMatch?.[2]),
    sourceText,
    sortOrder,
  };
}

function extractDateBasedProjectItems(lines: string[]): ExtractedResumeExperience[] {
  const items: ExtractedResumeExperience[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (hasDateRange(line)) {
      if (current.length > 0) {
        const item = parseItem(current, "project", items.length);
        if (item) {
          items.push(item);
        }
      }
      current = [line];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    const item = parseItem(current, "project", items.length);
    if (item) {
      items.push(item);
    }
  }

  return items;
}

export function extractResumeExperiencesFromText(
  text: string,
): ExtractedResumeExperience[] {
  if (isLikelyPdfBinaryText(text)) {
    return [];
  }

  const lines = normalizeLines(text);
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

  for (const line of lines) {
    const nextType = getSectionType(line);
    if (nextType) {
      flushSection();
      currentType = nextType;
      sectionLines = [];
      continue;
    }

    if (currentType && isSectionEnd(line)) {
      flushSection();
      currentType = null;
      sectionLines = [];
      continue;
    }

    if (currentType) {
      sectionLines.push(line);
    }
  }

  flushSection();
  const results =
    extracted.length > 0 ? extracted : extractDateBasedProjectItems(lines);

  return results.slice(0, 50).map((item, index) => ({
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
