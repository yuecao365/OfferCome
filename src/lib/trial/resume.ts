import "server-only";

import path from "node:path";

import { prisma } from "@/lib/db";
import { extractDocumentText } from "@/lib/documents/extract-text";
import { extractResumeExperiencesFromText } from "@/lib/resumes/extract";

/**
 * 体验模式的简历录入：只存解析出的文本，不保留文件。
 *
 * 两条路径殊途同归——都产出一条带 extractedText 的 Resume 和若干
 * ResumeProject（+ ResumeProjectSource 链接，出题上下文靠它取项目）：
 * 1. 上传 PDF/DOC/DOCX：内存解析，字节流不落盘；
 * 2. 手动填表：概述 + 最多 3 段经历，服务端拼成简历文本。
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

export type TrialResumeResult = {
  resumeId: string;
  originalName: string;
  textChars: number;
  projects: { name: string; type: string }[];
};

/** 表单数据拼成简历文本——出题 agent 吃的就是这份纯文本。 */
export function composeTrialResumeText(input: TrialResumeFormInput): string {
  const sections = [`## 个人概述\n${input.summary.trim()}`];
  for (const experience of input.experiences) {
    const heading = [
      experience.name.trim(),
      experience.organization?.trim() || null,
    ]
      .filter(Boolean)
      .join(" · ");
    const label = experience.type === "internship" ? "实习经历" : "项目经历";
    sections.push(`## ${label}：${heading}\n${experience.description.trim()}`);
  }
  return sections.join("\n\n");
}

export function validateTrialResumeForm(
  input: TrialResumeFormInput,
): string | null {
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

type PersistExperience = {
  name: string;
  type: string;
  organization: string | null;
  description: string | null;
  sourceText: string | null;
  sortOrder: number;
};

async function persistTrialResume(input: {
  originalName: string;
  text: string;
  experiences: PersistExperience[];
}): Promise<TrialResumeResult> {
  const text = input.text.trim().slice(0, MAX_TEXT_CHARS);

  const resume = await prisma.$transaction(async (tx) => {
    const created = await tx.resume.create({
      data: {
        originalName: input.originalName,
        storedName: `trial-${crypto.randomUUID()}`,
        // 不保留文件：filePath 置空，读简历一律走 extractedText。
        filePath: "",
        mimeType: "text/plain",
        fileSize: Buffer.byteLength(text, "utf8"),
        isDefault: false,
        extractedText: text,
      },
    });
    for (const experience of input.experiences) {
      const project = await tx.resumeProject.create({
        data: {
          resumeId: created.id,
          name: experience.name,
          type: experience.type,
          organization: experience.organization,
          description: experience.description,
          sourceText: experience.sourceText,
          sortOrder: experience.sortOrder,
        },
      });
      // 出题上下文按 projectSources 取项目，链接必须一并建立。
      await tx.resumeProjectSource.create({
        data: {
          resumeId: created.id,
          resumeProjectId: project.id,
          extractedName: experience.name,
          finalName: experience.name,
          sourceText: experience.sourceText,
        },
      });
    }
    return created;
  });

  return {
    resumeId: resume.id,
    originalName: input.originalName,
    textChars: text.length,
    projects: input.experiences.map(({ name, type }) => ({ name, type })),
  };
}

export async function createTrialResumeFromUpload(
  file: File,
): Promise<TrialResumeResult> {
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

  // 解析失败不拦路：识别不出经历就只用全文出题，少一类题而已。
  const experiences = extractResumeExperiencesFromText(text)
    .slice(0, MAX_PROJECTS_FROM_UPLOAD)
    .map((item, index) => ({
      name: item.title,
      type: item.type,
      organization: item.organization,
      description: item.description,
      sourceText: item.sourceText,
      sortOrder: index,
    }));

  return persistTrialResume({ originalName: file.name, text, experiences });
}

export async function createTrialResumeFromForm(
  input: TrialResumeFormInput,
): Promise<TrialResumeResult> {
  const message = validateTrialResumeForm(input);
  if (message) throw new Error(message);

  return persistTrialResume({
    originalName: "手动填写的简历",
    text: composeTrialResumeText(input),
    experiences: input.experiences.map((experience, index) => ({
      name: experience.name.trim(),
      type: experience.type,
      organization: experience.organization?.trim() || null,
      description: experience.description.trim(),
      sourceText: experience.description.trim(),
      sortOrder: index,
    })),
  });
}
