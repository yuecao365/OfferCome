import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

import { normalizeExperienceType } from "./confirmation";
import {
  canPreviewResumeInline,
  resumePreviewKind,
  type ResumeListItem,
  type ResumeProjectListItem,
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

function toResumeListItem(row: ResumeRow): ResumeListItem {
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

const RESUME_PROJECT_SELECT = {
  id: true,
  name: true,
  type: true,
  organization: true,
  description: true,
  resume: { select: { originalName: true } },
} satisfies Prisma.ResumeProjectSelect;

export async function getResumeProjects(): Promise<ResumeProjectListItem[]> {
  const rows = await prisma.resumeProject.findMany({
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    select: RESUME_PROJECT_SELECT,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: normalizeExperienceType(row.type),
    organization: row.organization,
    description: row.description,
    sourceResumeName: row.resume?.originalName ?? null,
  }));
}
