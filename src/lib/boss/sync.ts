import {
  BossBrowserLoginRequiredError,
  BossBrowserClosedError,
  collectBossContactsFromBrowser,
  type BossBrowserCollectionResult,
  type BossBrowserPageDiagnostics,
  type CollectBossContactsOptions,
} from "./browser-collector";
import type {
  BossSyncHighlight,
  BossSyncPublicResult,
  BossSyncStatus,
} from "./contracts";
import type { NormalizedBossContact } from "./parse";
import {
  upsertBossContacts,
  type BossContactReadClient,
  type BossContactWriteClient,
  type BossSyncSummary,
} from "./store";
import { createTaskLock } from "./task-lock";
import {
  DEFAULT_MAX_SYNC_PAGES,
  type BossSyncStopReason,
} from "./sync-policy";

export type BossSyncRunnerDb = BossContactReadClient &
  BossContactWriteClient & {
    /** 可选：存在时，同步会跳过用户已在平台删除的岗位（按 sourceKey）。 */
    dismissedApplication?: {
      findMany(args: {
        select: { sourceKey: true };
      }): Promise<Array<{ sourceKey: string }>>;
    };
  };
export type BossSyncPageDiagnostics = BossBrowserPageDiagnostics;

export type BossSyncRunResult = {
  success: boolean;
  status: BossSyncStatus;
  message: string;
  found: number;
  inserted: number;
  updated: number;
  unchanged: number;
  autoRejected: number;
  failed: number;
  highlights: BossSyncHighlight[];
  contacts: NormalizedBossContact[];
  diagnostics: BossSyncPageDiagnostics[];
  stopReason: BossSyncStopReason | null;
};

export type { BossSyncPublicResult } from "./contracts";

type BossContactCollector = (
  options: CollectBossContactsOptions,
) => Promise<BossBrowserCollectionResult>;

export type RunBossSyncOptions = {
  db: BossSyncRunnerDb;
  cwd?: string;
  dryRun?: boolean;
  maxPages?: number;
  now?: Date;
  collectContacts?: BossContactCollector;
  onMessage?: (message: string) => void;
  onWarning?: (message: string, error?: unknown) => void;
};

function loginRequiredResult(message: string): BossSyncRunResult {
  return {
    success: false,
    status: "login_required",
    message,
    found: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    autoRejected: 0,
    failed: 0,
    highlights: [],
    contacts: [],
    diagnostics: [],
    stopReason: null,
  };
}

function failedResult(message: string): BossSyncRunResult {
  return {
    success: false,
    status: "failed",
    message,
    found: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    autoRejected: 0,
    failed: 1,
    highlights: [],
    contacts: [],
    diagnostics: [],
    stopReason: null,
  };
}

export async function runBossSync(
  options: RunBossSyncOptions,
): Promise<BossSyncRunResult> {
  try {
    const collectContacts =
      options.collectContacts ?? collectBossContactsFromBrowser;
    const { contacts, diagnostics, stopReason } = await collectContacts({
      cwd: options.cwd,
      maxPages: options.maxPages ?? DEFAULT_MAX_SYNC_PAGES,
      onMessage: options.onMessage,
    });

    if (options.dryRun) {
      return {
        success: true,
        status: "success",
        message: `Dry run completed. Found ${contacts.length} records.`,
        found: contacts.length,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        autoRejected: 0,
        failed: 0,
        highlights: [],
        contacts,
        diagnostics,
        stopReason,
      };
    }

    // 用户在平台上删除过的岗位不再重新入库，避免每次同步都"复活"。
    const dismissedRows = options.db.dismissedApplication
      ? await options.db.dismissedApplication.findMany({
          select: { sourceKey: true },
        })
      : [];
    const dismissedKeys = new Set(dismissedRows.map((row) => row.sourceKey));
    const syncableContacts =
      dismissedKeys.size > 0
        ? contacts.filter((contact) => !dismissedKeys.has(contact.sourceKey))
        : contacts;
    const dismissedCount = contacts.length - syncableContacts.length;

    const summary: BossSyncSummary = await upsertBossContacts(
      options.db,
      syncableContacts,
      options.now ?? new Date(),
      {
        onError: (contact, error) => {
          options.onWarning?.(
            `Failed to write contact: ${contact.companyName} | ${contact.jobTitle}`,
            error,
          );
        },
      },
    );
    const dismissedNote =
      dismissedCount > 0 ? `，跳过 ${dismissedCount} 条已删除的岗位` : "";

    return {
      success: summary.failed === 0,
      status: summary.failed === 0 ? "success" : "failed",
      message:
        summary.failed === 0
          ? `同步完成：检查 ${contacts.length} 条，新增 ${summary.inserted} 条，来源变化或状态更新 ${summary.updated} 条，自动标记拒绝 ${summary.autoRejected} 条${dismissedNote}。`
          : `同步完成但有 ${summary.failed} 条写入失败。`,
      found: contacts.length,
      inserted: summary.inserted,
      updated: summary.updated,
      unchanged: summary.unchanged,
      autoRejected: summary.autoRejected,
      failed: summary.failed,
      highlights: summary.highlights,
      contacts,
      diagnostics,
      stopReason,
    };
  } catch (error) {
    if (error instanceof BossBrowserLoginRequiredError) {
      return loginRequiredResult(error.message);
    }

    if (error instanceof BossBrowserClosedError) {
      options.onWarning?.("Boss browser window closed during sync.", error);
      return failedResult(error.message);
    }

    options.onWarning?.("Boss browser sync failed.", error);
    return failedResult("Boss 浏览器同步失败，请稍后重试。");
  }
}

export function toBossSyncPublicResult(
  result: BossSyncRunResult,
): BossSyncPublicResult {
  return {
    success: result.success,
    status: result.status,
    message: result.message,
    createdCount: result.inserted,
    updatedCount: result.updated,
    unchangedCount: result.unchanged,
    autoRejectedCount: result.autoRejected,
    totalCount: result.found,
    completedAllPages: result.stopReason !== "max-pages",
    highlights: result.highlights,
  };
}

export function printBossSyncDiagnostics(
  diagnostics: BossSyncPageDiagnostics[],
): void {
  for (const item of diagnostics) {
    console.log(
      `[boss:sync] Browser page=${item.page}, candidates=${item.candidateCount}, url=${item.url}`,
    );
  }
}

export function printBossSyncContacts(contacts: NormalizedBossContact[]): void {
  if (contacts.length === 0) {
    console.log("[boss:sync] No company/job pairs were recognized.");
    return;
  }

  for (const [index, contact] of contacts.entries()) {
    console.log(`${index + 1}. ${contact.companyName} | ${contact.jobTitle}`);
  }
}

export function createBossSyncLock() {
  return createTaskLock<BossSyncPublicResult>(() => ({
    success: false,
    status: "failed",
    message: "Boss 同步正在进行中，请稍后再试。",
  }));
}
