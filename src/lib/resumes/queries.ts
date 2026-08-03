import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

import {
  canPreviewResumeInline,
  resumePreviewKind,
  type ResumeListItem,
} from "./types";

const RESUME_SELECT = {
  id: true,
  originalName: true,
  storedName: true,
  mimeType: true,
  fileSize: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ResumeSelect;

type ResumeRow = Prisma.ResumeGetPayload<{ select: typeof RESUME_SELECT }>;

export function toResumeListItem(row: ResumeRow): ResumeListItem {
  const previewKind = resumePreviewKind(row.mimeType, row.originalName);

  return {
    ...row,
    previewUrl: `/api/resumes/${row.id}/file`,
    downloadUrl: `/api/resumes/${row.id}/file?download=1`,
    canPreviewInline: canPreviewResumeInline(row.mimeType, row.originalName),
    previewKind,
  };
}

export async function getResumes(): Promise<ResumeListItem[]> {
  const rows = await prisma.resume.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: RESUME_SELECT,
  });

  return rows.map(toResumeListItem);
}
