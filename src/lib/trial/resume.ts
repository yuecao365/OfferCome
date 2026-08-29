import "server-only";

import path from "node:path";

import { extractDocumentText } from "@/lib/documents/extract-text";
import { extractResumeExperiencesFromText } from "@/lib/resumes/extract";

import type { TrialResumeInput } from "./interview";

/**
 * 体验版的简历录入：**纯解析，不落任何存储**。
 *
 * 两条路径都产出同一个 TrialResumeInput（全文 + 项目条目），由浏览器保存。
 * 上传的文件只在内存里过一遍，函数返回后即被回收。
 */

export const TRIAL_RESUME_MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;
const MAX_FORM_EXPERIENCES = 3;
const MAX_PROJECTS_FROM_UPLOAD = 6;

/** 图片解析不出文本，体验版直接不收，引导走手动填写。 */
const UPLOAD_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);

export type TrialResumeExperienceInput = {
  name: string;
  type: string;
  organization?: string;
  description: string;
};

export type TrialResumeFormInput = {
  summary: string;
  experiences: TrialResumeExperienceInput[];
};

/** 表单数据拼成简历文本——出题 agent 吃的就是这份纯文本。 */
export function composeTrialResumeText(input: TrialResumeFormInput): string {
  const sections = [`## 个人概述\n${input.summary.trim()}`];
  for (const experience of input.experiences) {
    const heading = [experience.name.trim(), experience.organization?.trim() || null]
      .filter(Boolean)
      .join(" · ");
    const label = experience.type === "internship" ? "实习经历" : "项目经历";
    sections.push(`## ${label}：${heading}\n${experience.description.trim()}`);
  }
  return sections.join("\n\n");
}

export function validateTrialResumeForm(input: TrialResumeFormInput): string | null {
  if (input.summary.trim().length < 30) {
    return "个人概述至少写 30 个字，说明方向、技术栈和亮点，出的题才会贴合你。";
  }
  if (input.summary.length > 20_000) return "个人概述过长。";
  if (input.experiences.length > MAX_FORM_EXPERIENCES) {
    return `最多填写 ${MAX_FORM_EXPERIENCES} 段经历。`;
  }
  for (const experience of input.experiences) {
    if (!experience.name.trim() || experience.name.length > 120) {
      return "每段经历都需要一个有效的名称。";
    }
    if (!["internship", "project"].includes(experience.type)) {
      return "经历类型只能是实习或项目。";
    }
    if (experience.description.trim().length < 20) {
      return "每段经历的描述至少写 20 个字（职责、技术、结果）。";
    }
    if (experience.description.length > 5_000) return "经历描述过长。";
  }
  return null;
}

function toResumeInput(
  text: string,
  experiences: { name: string; type: string; organization: string; description: string }[],
): TrialResumeInput {
  return {
    text: text.trim().slice(0, MAX_TEXT_CHARS),
    // id 只用于出题时引用项目，会话内唯一即可。
    projects: experiences.map((experience, index) => ({
      id: `trial-project-${index}`,
      name: experience.name,
      type: experience.type,
      organization: experience.organization,
      description: experience.description,
    })),
  };
}

export async function parseTrialResumeUpload(file: File): Promise<TrialResumeInput> {
  const extension = path.extname(file.name).toLowerCase();
  if (!UPLOAD_EXTENSIONS.has(extension)) {
    throw new Error("体验版只支持 PDF、DOC、DOCX 简历；图片简历请改用手动填写。");
  }
  if (file.size <= 0 || file.size > TRIAL_RESUME_MAX_BYTES) {
    throw new Error("简历文件需要在 10MB 以内且不为空。");
  }

  const text = (
    await extractDocumentText({
      bytes: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type,
    })
  ).trim();
  if (text.length < 50) {
    throw new Error(
      "没有从这份文件里解析出足够的文本（扫描件或图片型 PDF 常见）。请改用手动填写。",
    );
  }

  // 识别不出经历不拦路：只用全文出题，少一类项目深挖题而已。
  const experiences = extractResumeExperiencesFromText(text)
    .slice(0, MAX_PROJECTS_FROM_UPLOAD)
    .map((item) => ({
      name: item.title,
      type: item.type,
      organization: item.organization ?? "",
      description: item.description ?? item.sourceText,
    }));

  return toResumeInput(text, experiences);
}

export function parseTrialResumeForm(input: TrialResumeFormInput): TrialResumeInput {
  const message = validateTrialResumeForm(input);
  if (message) throw new Error(message);

  return toResumeInput(
    composeTrialResumeText(input),
    input.experiences.map((experience) => ({
      name: experience.name.trim(),
      type: experience.type,
      organization: experience.organization?.trim() ?? "",
      description: experience.description.trim(),
    })),
  );
}
