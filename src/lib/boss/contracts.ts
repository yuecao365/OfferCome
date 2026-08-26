import type { ApplicationStage } from "@/lib/applications/types";

export type BossLoginResult = {
  success: boolean;
  status: "success" | "failed";
  message: string;
};

export type BossSyncStatus = "success" | "login_required" | "failed";

export type BossSyncChangedField =
  | "activity"
  | "company_name"
  | "job_title"
  | "source_status";

export type BossSyncHighlight = {
  kind: "auto_rejected" | "new" | "source_changed";
  /** 记录的唯一键，供同步结果弹窗直接改状态。 */
  sourceKey: string;
  companyName: string;
  jobTitle: string;
  changedFields: BossSyncChangedField[];
  /** 本次同步写完之后的阶段，弹窗据此推荐下一步。 */
  currentStage: ApplicationStage;
  /** Boss 侧岗位是否已下架。与 changedFields 里的 source_status 配合判断"刚下架"。 */
  sourceJobClosed: boolean;
};

export type BossSyncPublicResult = {
  success: boolean;
  status: BossSyncStatus;
  message: string;
  createdCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  autoRejectedCount?: number;
  totalCount?: number;
  completedAllPages?: boolean;
  stopReason?: import("./sync-policy").BossSyncStopReason | null;
  highlights?: BossSyncHighlight[];
};
