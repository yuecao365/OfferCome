import { z } from "zod";

import { normalizedText } from "@/lib/text/similarity";

import { cleanResumeDate, type ExtractedResumeExperience } from "./extract";

/**
 * 模型抽取实习/项目的 schema 与领域校验（纯函数，便于测试）。
 * 模型调用本身在 experience-agent.ts。
 */

export const RESUME_EXTRACTION_PROMPT_VERSION = "resume-experience-v1";

/** 严格模式：所有字段必填、可空用 nullable。 */
export const resumeExperienceOutputSchema = z.object({
  experiences: z
    .array(
      z.object({
        type: z.enum(["internship", "project"]),
        title: z.string().min(1).max(200),
        organization: z.string().max(200).nullable(),
        description: z.string().max(3_000).nullable(),
        startDate: z.string().max(40).nullable(),
        endDate: z.string().max(40).nullable(),
        sourceText: z.string().min(1).max(2_000),
      }),
    )
    .max(30),
});

export type ResumeExperienceOutput = z.infer<typeof resumeExperienceOutputSchema>;

const MAX_EXPERIENCES = 50;

function isEvidence(resumeText: string, excerpt: string | null): boolean {
  if (!excerpt) return false;
  const normalized = normalizedText(excerpt);
  return normalized.length >= 2 && resumeText.includes(normalized);
}

/**
 * 只保留能在简历原文里找到依据的条目：sourceText 逐字命中最好；
 * 模型意译了原文时退一步，只要标题本身出现在简历里也算数，
 * 并把 sourceText 换成标题，避免把编造的"原文"存进项目库。
 */
export function validateExtractedResumeExperiences(
  resumeText: string,
  output: ResumeExperienceOutput,
): ExtractedResumeExperience[] {
  const haystack = normalizedText(resumeText);
  const seen = new Set<string>();
  const experiences: ExtractedResumeExperience[] = [];

  for (const item of output.experiences) {
    const title = item.title.replace(/\s+/g, " ").trim();
    const key = `${item.type}:${normalizedText(title)}`;
    if (title.length < 2 || seen.has(key)) continue;

    const sourceText = isEvidence(haystack, item.sourceText)
      ? item.sourceText.trim()
      : isEvidence(haystack, title)
        ? title
        : null;
    if (!sourceText) continue;

    seen.add(key);
    experiences.push({
      title: title.slice(0, 160),
      type: item.type,
      organization: item.organization?.trim() || null,
      description: item.description?.trim().slice(0, 2000) || null,
      startDate: cleanResumeDate(item.startDate?.trim() || null),
      endDate: cleanResumeDate(item.endDate?.trim() || null),
      sourceText: sourceText.slice(0, 2000),
      sortOrder: experiences.length,
    });
  }

  return experiences.slice(0, MAX_EXPERIENCES);
}
