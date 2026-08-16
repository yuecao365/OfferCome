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
