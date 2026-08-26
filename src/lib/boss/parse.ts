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

/**
 * Boss 的 jobValidStatus。含义不是官方文档，是从真实同步数据推断的：
 * 210 条记录里 code=2 共 125 条，近 30 天内**零条**有互动、也没有一条是新投递；
 * code=1 则有互动到当天、且全部新投递都落在这里。据此判定 1=在招、2=已下架。
 *
 * 只把 2 当作"确定下架"，其余值（包括将来 Boss 新增的）一律按"不确定"处理，
 * 宁可不给建议也不猜。
 */
const BOSS_JOB_STATUS_CLOSED = 2;

export function isBossJobClosed(
  sourceStatusCode: number | null | undefined,
): boolean {
  return sourceStatusCode === BOSS_JOB_STATUS_CLOSED;
}

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
