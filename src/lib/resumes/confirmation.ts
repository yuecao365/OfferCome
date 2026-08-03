import type {
  ExtractedResumeExperience,
  ResumeExperienceType,
} from "./extract";

export type ExistingResumeProjectOption = {
  id: string;
  name: string;
  type: string;
  organization: string | null;
};

export type PendingResumeExperienceConfirmation = {
  clientId: string;
  type: ResumeExperienceType;
  extractedName: string;
  finalName: string;
  selectedExistingItemId: string | null;
  recommendedExistingItemId: string | null;
  matchScore: number;
  organization: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  sourceText: string;
  sortOrder: number;
};

export type ResumeExperienceConfirmationInput = {
  clientId: string;
  type: ResumeExperienceType;
  extractedName: string;
  finalName: string;
  existingItemId: string | null;
  organization: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  sourceText: string;
  sortOrder: number;
};

export type ResolvedResumeProjectCreate = {
  clientId: string;
  name: string;
  type: ResumeExperienceType;
  organization: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  sourceText: string;
  sortOrder: number;
  extractedName: string;
  finalName: string;
};

export type ResolvedResumeProjectLink = Omit<
  ResolvedResumeProjectCreate,
  "name"
> & {
  resumeProjectId: string;
};

export type ResolvedResumeExperienceConfirmations = {
  creates: ResolvedResumeProjectCreate[];
  links: ResolvedResumeProjectLink[];
};

const MATCH_THRESHOLD = 0.65;

function normalizeExperienceType(value: string | null | undefined): ResumeExperienceType {
  return value === "internship" || value === "project" ? value : "project";
}

export function resumeExperienceTypeLabel(
  type: ResumeExperienceType,
): "实习" | "项目" {
  return type === "internship" ? "实习" : "项目";
}

export function normalizeResumeProjectName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-–—|:：,，.。()（）[\]【】"'“”‘’]+/g, "")
    .trim();
}

function tokenizeProjectName(value: string): Set<string> {
  const words = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\-–—|:：,，.。()（）[\]【】"'“”‘’]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);
  return new Set(words);
}

function scoreNameSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeResumeProjectName(left);
  const normalizedRight = normalizeResumeProjectName(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    const shorter = Math.min(normalizedLeft.length, normalizedRight.length);
    const longer = Math.max(normalizedLeft.length, normalizedRight.length);
    return shorter / longer >= 0.45 ? 0.85 : 0.55;
  }

  const leftWords = tokenizeProjectName(left);
  const rightWords = tokenizeProjectName(right);
  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftWords.size, rightWords.size);
}

function findBestMatch(
  experience: ExtractedResumeExperience,
  existingProjects: ExistingResumeProjectOption[],
): { id: string; score: number } | null {
  const sameType = existingProjects.filter(
    (project) => normalizeExperienceType(project.type) === experience.type,
  );
  const candidates = sameType.length > 0 ? sameType : existingProjects;
  let best: { id: string; score: number } | null = null;

  for (const project of candidates) {
    const score = scoreNameSimilarity(experience.title, project.name);
    if (!best || score > best.score) {
      best = { id: project.id, score };
    }
  }

  return best && best.score >= MATCH_THRESHOLD ? best : null;
}

export function buildPendingResumeExperienceConfirmations(
  experiences: ExtractedResumeExperience[],
  existingProjects: ExistingResumeProjectOption[],
): PendingResumeExperienceConfirmation[] {
  return experiences.map((experience, index) => {
    const match = findBestMatch(experience, existingProjects);

    return {
      clientId: `resume-experience-${index}`,
      type: experience.type,
      extractedName: experience.title,
      finalName: experience.title,
      selectedExistingItemId: match?.id ?? null,
      recommendedExistingItemId: match?.id ?? null,
      matchScore: match?.score ?? 0,
      organization: experience.organization,
      description: experience.description,
      startDate: experience.startDate,
      endDate: experience.endDate,
      sourceText: experience.sourceText,
      sortOrder: experience.sortOrder,
    };
  });
}

function findExactExistingProject(
  input: ResumeExperienceConfirmationInput,
  existingProjects: ExistingResumeProjectOption[],
): ExistingResumeProjectOption | null {
  const normalizedName = normalizeResumeProjectName(input.finalName);
  const type = normalizeExperienceType(input.type);

  return (
    existingProjects.find(
      (project) =>
        normalizeExperienceType(project.type) === type &&
        normalizeResumeProjectName(project.name) === normalizedName,
    ) ?? null
  );
}

export function resolveResumeExperienceConfirmations(
  inputs: ResumeExperienceConfirmationInput[],
  existingProjects: ExistingResumeProjectOption[],
): ResolvedResumeExperienceConfirmations {
  const existingById = new Map(existingProjects.map((project) => [project.id, project]));
  const creates: ResolvedResumeProjectCreate[] = [];
  const links: ResolvedResumeProjectLink[] = [];

  for (const input of inputs) {
    const type = normalizeExperienceType(input.type);
    const finalName = input.finalName.trim();
    const extractedName = input.extractedName.trim() || finalName;

    if (!finalName) {
      throw new Error("实习/项目名称不能为空。");
    }

    const base = {
      clientId: input.clientId,
      type,
      organization: input.organization?.trim() || null,
      description: input.description?.trim() || null,
      startDate: input.startDate?.trim() || null,
      endDate: input.endDate?.trim() || null,
      sourceText: input.sourceText,
      sortOrder: input.sortOrder,
      extractedName,
      finalName,
    };

    if (input.existingItemId) {
      const existing = existingById.get(input.existingItemId);
      if (!existing) {
        throw new Error("选择的已有实习/项目不存在，请刷新后重试。");
      }

      links.push({ ...base, resumeProjectId: existing.id });
      continue;
    }

    const exactExisting = findExactExistingProject(
      { ...input, finalName, type },
      existingProjects,
    );
    if (exactExisting) {
      links.push({ ...base, resumeProjectId: exactExisting.id });
      continue;
    }

    creates.push({ ...base, name: finalName });
  }

  return { creates, links };
}
