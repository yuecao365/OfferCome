import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { buildStoredResumeName, RESUME_UPLOAD_DIR } from "@/lib/resumes/storage";

import { loadResumeText } from "./fixtures";

const RESUME_MIME = "text/markdown";

/** 合成简历（eval/resumes/*.md）在库里的 Resume 行：没有就建一条，有就复用。评测与模拟器共用。 */
export async function ensureFixtureResume(resumeId: string): Promise<string> {
  const originalName = `eval-${resumeId}.md`;
  const existing = await prisma.resume.findFirst({ where: { originalName }, select: { id: true } });
  if (existing) return existing.id;
  const text = loadResumeText(resumeId);
  await fs.mkdir(RESUME_UPLOAD_DIR, { recursive: true });
  const storedName = buildStoredResumeName(".md");
  const filePath = path.join(RESUME_UPLOAD_DIR, storedName);
  await fs.writeFile(filePath, text, "utf8");
  const created = await prisma.resume.create({
    data: { originalName, storedName, filePath, mimeType: RESUME_MIME, fileSize: Buffer.byteLength(text), isDefault: false },
    select: { id: true },
  });
  console.log(`已为合成简历 ${resumeId} 建了 Resume 记录 ${created.id}`);
  return created.id;
}
