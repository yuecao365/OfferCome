import { createHash } from "node:crypto";

export const BOSS_SOURCE = "boss_zhipin" as const;

export type BossContactCandidate = {
  companyName?: string | null;
  jobTitle?: string | null;
  href?: string | null;
  sourceId?: string | null;
  sourceActivityAt?: Date | null;
  sourceStatusCode?: number | null;
};

export type NormalizedBossContact = {
  companyName: string;
  jobTitle: string;
  source: typeof BOSS_SOURCE;
  sourceKey: string;
  jobUrl?: string | null;
  sourceActivityAt?: Date | null;
  sourceStatusCode?: number | null;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeBossHref(href: string): string {
  try {
    const url = new URL(href, "https://www.zhipin.com");
    url.hash = "";
    return url.toString();
  } catch {
    return href;
  }
}

/**
 * sourceKey 是否来自 Boss 的稳定标识（岗位 ID 或详情页链接）。
 * 只有回退到公司名+岗位名哈希时才为 false。
 */
export function hasStableBossSourceId(sourceKey: string): boolean {
  return !sourceKey.startsWith(`${BOSS_SOURCE}:hash:`);
}

export function toBossSourceKey(candidate: BossContactCandidate): string {
  const sourceId = cleanText(candidate.sourceId);

  if (sourceId) {
    return `${BOSS_SOURCE}:job:${sourceId}`;
  }

  const href = cleanText(candidate.href);

  if (href) {
    return `${BOSS_SOURCE}:url:${normalizeBossHref(href)}`;
  }

  const companyName = cleanText(candidate.companyName);
  const jobTitle = cleanText(candidate.jobTitle);
  const hash = createHash("sha256")
    .update(`${BOSS_SOURCE}\0${companyName}\0${jobTitle}`)
    .digest("hex");

  return `${BOSS_SOURCE}:hash:${hash}`;
}

export function normalizeBossContacts(
  candidates: BossContactCandidate[],
): NormalizedBossContact[] {
  const seen = new Set<string>();
  const contacts: NormalizedBossContact[] = [];

  for (const candidate of candidates) {
    const companyName = cleanText(candidate.companyName);
    const jobTitle = cleanText(candidate.jobTitle);

    if (!companyName || !jobTitle) {
      continue;
    }

    const sourceKey = toBossSourceKey({ ...candidate, companyName, jobTitle });

    if (seen.has(sourceKey)) {
      continue;
    }

    seen.add(sourceKey);
    contacts.push({
      companyName,
      jobTitle,
      source: BOSS_SOURCE,
      sourceKey,
      jobUrl: cleanText(candidate.href) || null,
      sourceActivityAt: candidate.sourceActivityAt ?? null,
      sourceStatusCode: candidate.sourceStatusCode ?? null,
    });
  }

  return contacts;
}
