import type {
  ApplicationFilters,
  ApplicationListItem,
  ApplicationStage,
} from "@/lib/applications/types";

import type { TrialResumeInput } from "./interview";

/**
 * 体验版工作台的浏览器数据文档。
 *
 * 与本地版的分界线只在**状态归属**：本地版的数据在 SQLite、由 queries.ts
 * 读取；体验版的数据在这个文档里、由本文件的纯函数读写。两边共用同一套
 * UI 组件类型（ApplicationListItem 等）和纯校验/聚合函数——这里绝不复制
 * 那些逻辑，只做文档结构与查询适配。
 *
 * 全部字段用可序列化类型（日期存 ISO 字符串），映射到 UI 类型时再转 Date。
 * `version` 用于将来结构变更：不匹配一律丢弃重来，体验数据不值得写迁移。
 */

export const TRIAL_WORKSPACE_VERSION = 1;

export type TrialApplication = {
  id: string;
  companyName: string;
  jobTitle: string;
  source: string;
  stage: ApplicationStage;
  /** ISO 字符串。 */
  appliedAt: string;
  jobUrl: string;
  jobDescription: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type TrialWorkspace = {
  version: typeof TRIAL_WORKSPACE_VERSION;
  /** 首次载入示例数据的时间；null 表示访客清空过、不再自动补种。 */
  seededAt: string | null;
  applications: TrialApplication[];
  resume: TrialResumeInput | null;
};

export function createEmptyWorkspace(): TrialWorkspace {
  return {
    version: TRIAL_WORKSPACE_VERSION,
    seededAt: null,
    applications: [],
    resume: null,
  };
}

export function isTrialWorkspace(value: unknown): value is TrialWorkspace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TrialWorkspace>;
  return (
    candidate.version === TRIAL_WORKSPACE_VERSION &&
    Array.isArray(candidate.applications)
  );
}

/* ------------------------------ 投递操作 ------------------------------ */

export type TrialApplicationInput = {
  companyName: string;
  jobTitle: string;
  stage: ApplicationStage;
  appliedAt: Date;
  source: string;
  jobUrl: string | null;
  jobDescription: string;
  note: string;
};

export function upsertApplication(
  workspace: TrialWorkspace,
  input: TrialApplicationInput,
  id?: string,
): TrialWorkspace {
  const now = new Date().toISOString();
  const existing = id
    ? workspace.applications.find((item) => item.id === id)
    : undefined;

  const record: TrialApplication = {
    id: existing?.id ?? crypto.randomUUID(),
    companyName: input.companyName,
    jobTitle: input.jobTitle,
    source: input.source,
    stage: input.stage,
    appliedAt: input.appliedAt.toISOString(),
    jobUrl: input.jobUrl ?? "",
    jobDescription: input.jobDescription,
    note: input.note,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return {
    ...workspace,
    applications: existing
      ? workspace.applications.map((item) => (item.id === record.id ? record : item))
      : [record, ...workspace.applications],
  };
}

export function deleteApplication(
  workspace: TrialWorkspace,
  id: string,
): TrialWorkspace {
  return {
    ...workspace,
    applications: workspace.applications.filter((item) => item.id !== id),
  };
}

export function updateApplicationStage(
  workspace: TrialWorkspace,
  id: string,
  stage: ApplicationStage,
): TrialWorkspace {
  const now = new Date().toISOString();
  return {
    ...workspace,
    applications: workspace.applications.map((item) =>
      item.id === id ? { ...item, stage, updatedAt: now } : item,
    ),
  };
}

/* ------------------------------ 查询适配 ------------------------------ */

/** 映射到本地版列表使用的同一 UI 类型——这是"页面一模一样"的前提。 */
export function toApplicationListItem(record: TrialApplication): ApplicationListItem {
  const appliedAt = new Date(record.appliedAt);
  const updatedAt = new Date(record.updatedAt);
  return {
    id: record.id,
    companyName: record.companyName,
    jobTitle: record.jobTitle,
    source: record.source,
    jobUrl: record.jobUrl,
    jobDescription: record.jobDescription,
    stage: record.stage,
    appliedAt,
    // 体验版没有同步渠道：最后见到/状态更新时间都取记录更新时间。
    lastSeenAt: updatedAt,
    statusUpdatedAt: updatedAt,
    updatedAt,
    autoRejectedAt: null,
    note: record.note,
  };
}

/** 与本地版 getApplications 相同的返回形状，页面组件不需要感知数据来自哪里。 */
export type TrialApplicationsResult = {
  items: ApplicationListItem[];
  page: number;
  total: number;
  totalPages: number;
};

export function queryApplications(
  workspace: TrialWorkspace,
  filters: ApplicationFilters,
): TrialApplicationsResult {
  const query = filters.q.toLowerCase();
  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : null;

  const matched = workspace.applications.filter((item) => {
    if (filters.status !== "all" && item.stage !== filters.status) return false;
    if (filters.source !== "all" && item.source !== filters.source) return false;
    if (
      query &&
      !item.companyName.toLowerCase().includes(query) &&
      !item.jobTitle.toLowerCase().includes(query) &&
      !item.note.toLowerCase().includes(query)
    ) {
      return false;
    }
    const appliedAt = new Date(item.appliedAt);
    if (from && appliedAt < from) return false;
    if (to && appliedAt > to) return false;
    return true;
  });

  const direction = filters.sortDir === "asc" ? 1 : -1;
  const sorted = matched.toSorted((left, right) => {
    const key = filters.sortBy;
    return (
      direction *
      (new Date(left[key]).getTime() - new Date(right[key]).getTime())
    );
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const start = (page - 1) * filters.pageSize;

  return {
    items: sorted.slice(start, start + filters.pageSize).map(toApplicationListItem),
    page,
    total,
    totalPages,
  };
}

export function applicationSources(workspace: TrialWorkspace): string[] {
  return [...new Set(workspace.applications.map((item) => item.source))].sort();
}
