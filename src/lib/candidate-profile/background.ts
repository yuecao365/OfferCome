import "server-only";

import { after } from "next/server";

import { refreshCandidateProfile } from "./service";
import { markCandidateProfileDirty } from "./state";
import { runRefreshBatches } from "./background-runner";

const MAX_BACKGROUND_BATCHES = 20;

type RefreshResult = Awaited<ReturnType<typeof refreshCandidateProfile>>;

export async function enqueueCandidateProfileRefresh({
  fullRebuild = false,
}: { fullRebuild?: boolean } = {}): Promise<void> {
  await markCandidateProfileDirty({ fullRebuild, debounceMs: 0 });
  scheduleCandidateProfileRefresh();
}

export function scheduleCandidateProfileRefresh(): void {
  after(async () => {
    try {
      await runRefreshBatches<RefreshResult>({
        refresh: () => refreshCandidateProfile({ force: false }),
        maxBatches: MAX_BACKGROUND_BATCHES,
      });
    } catch (error) {
      console.error("后台更新能力画像失败，任务将由恢复调度器重试。", error);
    }
  });
}
