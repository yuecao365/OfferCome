import path from "node:path";

import { extractDocumentText } from "./extract-text";

const MAX_JD_BYTES = 10 * 1024 * 1024;
export const MAX_JD_TEXT = 100_000;
const JD_EXTENSIONS = new Set([".txt", ".md", ".docx", ".pdf"]);

/** 上传的岗位描述文件 → 文本。本地版创建接口与体验版的解析接口共用同一套限制。 */
export async function readJobDescriptionFile(file: File): Promise<{ text: string; originalName: string }> {
  const extension = path.extname(file.name).toLowerCase();
  if (!JD_EXTENSIONS.has(extension)) {
    throw new Error("岗位描述只支持 TXT、MD、DOCX 或 PDF 文件。");
  }
  if (file.size > MAX_JD_BYTES) throw new Error("岗位描述文件不能超过 10MB。");
  const text = await extractDocumentText({
    bytes: Buffer.from(await file.arrayBuffer()),
    fileName: file.name,
    mimeType: file.type,
  });
  if (!text.trim()) throw new Error("没有从岗位描述中提取到文本。");
  return { text: text.slice(0, MAX_JD_TEXT), originalName: file.name };
}
