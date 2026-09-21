import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { buildStoredResumeName, RESUME_UPLOAD_DIR } from "@/lib/resumes/storage";

import { loadResumeText } from "./fixtures";

const RESUME_MIME = "text/markdown";

/** 合成简历（eval/resumes/*.md）在库里的 Resume 行：没有就建一条，有就复用。评测与模拟器共用。 */
export async function ensureFixtureResume(resumeId: string): Promise<string> {
  return ensureResumeFromText(`eval-${resumeId}`, loadResumeText(resumeId));
}

/** 任意一段简历文本在库里的 Resume 行：按名字 + 内容哈希复用，文本变了就是新的一行（bench 任务里的简历文本以任务文件为准）。 */
export async function ensureResumeFromText(key: string, text: string): Promise<string> {
  const hash = crypto.createHash("sha1").update(text).digest("hex").slice(0, 8);
  const originalName = `${key}-${hash}.md`;
  const existing = await prisma.resume.findFirst({ where: { originalName }, select: { id: true } });
  if (existing) return existing.id;
  await fs.mkdir(RESUME_UPLOAD_DIR, { recursive: true });
  const storedName = buildStoredResumeName(".md");
  const filePath = path.join(RESUME_UPLOAD_DIR, storedName);
  await fs.writeFile(filePath, text, "utf8");
  const created = await prisma.resume.create({
    data: { originalName, storedName, filePath, mimeType: RESUME_MIME, fileSize: Buffer.byteLength(text), isDefault: false },
    select: { id: true },
  });
  console.log(`已为简历 ${originalName} 建了 Resume 记录 ${created.id}`);
  return created.id;
}
