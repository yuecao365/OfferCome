import type {
  ExistingResumeProjectOption,
  PendingResumeExperienceConfirmation,
  ResumeExperienceExtractionSource,
} from "./confirmation";
import type { ResumeExperienceType } from "./extract";

export type ResumePreviewKind = "pdf" | "image" | "none";

export type ResumeListItem = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  fileSize: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  previewUrl: string;
  downloadUrl: string;
  canPreviewInline: boolean;
  previewKind: ResumePreviewKind;
};

export type ResumeActionState = {
  status: "idle" | "success" | "error";
  message: string;
  tempUploadId?: string;
  fileName?: string;
  isDefault?: boolean;
  pendingExperiences?: PendingResumeExperienceConfirmation[];
  existingProjects?: ExistingResumeProjectOption[];
  extractionSource?: ResumeExperienceExtractionSource;
};

export const initialResumeActionState: ResumeActionState = {
  status: "idle",
  message: "",
  pendingExperiences: [],
  existingProjects: [],
};

export type ResumeProjectListItem = {
  id: string;
  name: string;
  type: ResumeExperienceType;
  organization: string | null;
  description: string | null;
  sourceResumeName: string | null;
};

export type ResumeExperienceConfirmState = {
  status: "idle" | "success" | "error";
  message: string;
  resumeId?: string;
  createdCount: number;
  linkedCount: number;
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function normalizedNameAndMime(mimeType: string, originalName: string) {
  return {
    lowerMimeType: mimeType.toLowerCase(),
    lowerName: originalName.toLowerCase(),
  };
}

export function resumePreviewKind(
  mimeType: string,
  originalName: string,
): ResumePreviewKind {
  const { lowerMimeType, lowerName } = normalizedNameAndMime(
    mimeType,
    originalName,
  );

  if (lowerMimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    lowerMimeType === "image/jpeg" ||
    lowerMimeType === "image/png" ||
    lowerMimeType === "image/webp" ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".webp")
  ) {
    return "image";
  }

  return "none";
}

export function canPreviewResumeInline(
  mimeType: string,
  originalName: string,
): boolean {
  return resumePreviewKind(mimeType, originalName) !== "none";
}

export function resumeTypeLabel(mimeType: string, originalName: string): string {
  const { lowerMimeType, lowerName } = normalizedNameAndMime(
    mimeType,
    originalName,
  );

  if (lowerMimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    return "PDF";
  }
  if (lowerName.endsWith(".docx")) {
    return "Word DOCX";
  }
  if (lowerName.endsWith(".doc")) {
    return "Word DOC";
  }
  if (lowerMimeType === "image/jpeg" || /\.(jpe?g)$/.test(lowerName)) {
    return "JPEG 图片";
  }
  if (lowerMimeType === "image/png" || lowerName.endsWith(".png")) {
    return "PNG 图片";
  }
  if (lowerMimeType === "image/webp" || lowerName.endsWith(".webp")) {
    return "WebP 图片";
  }
  return "文件";
}
