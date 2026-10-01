import path from "node:path";

import { defineMessages, type Locale } from "@/lib/i18n/locale";

import { extractDocumentText } from "./extract-text";

const MAX_JD_BYTES = 10 * 1024 * 1024;
export const MAX_JD_TEXT = 100_000;
const JD_EXTENSIONS = new Set([".txt", ".md", ".docx", ".pdf"]);

const messages = defineMessages({
  "zh-CN": {
    unsupported: "岗位描述只支持 TXT、MD、DOCX 或 PDF 文件。",
    tooLarge: "岗位描述文件不能超过 10MB。",
    empty: "没有从岗位描述中提取到文本。",
  },
  en: {
    unsupported: "Job descriptions must be TXT, MD, DOCX or PDF files.",
    tooLarge: "Job description files can't exceed 10 MB.",
    empty: "No text could be extracted from the job description.",
  },
});

/** 上传的岗位描述文件 → 文本。本地版创建接口与体验版的解析接口共用同一套限制。locale 是报错的界面语言。 */
export async function readJobDescriptionFile(file: File, locale: Locale = "zh-CN"): Promise<{ text: string; originalName: string }> {
  const t = messages[locale];
  const extension = path.extname(file.name).toLowerCase();
  if (!JD_EXTENSIONS.has(extension)) {
    throw new Error(t.unsupported);
  }
  if (file.size > MAX_JD_BYTES) throw new Error(t.tooLarge);
  const text = await extractDocumentText({
    bytes: Buffer.from(await file.arrayBuffer()),
    fileName: file.name,
    mimeType: file.type,
  });
  if (!text.trim()) throw new Error(t.empty);
  return { text: text.slice(0, MAX_JD_TEXT), originalName: file.name };
}
