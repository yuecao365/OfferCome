import "server-only";

import { after } from "next/server";

import { isTrialMode } from "@/lib/runtime-mode";

import { refreshCandidateProfile } from "./service";
import { markCandidateProfileDirty } from "./state";
import { runRefreshBatches } from "./background-runner";

const MAX_BACKGROUND_BATCHES = 20;

type RefreshResult = Awaited<ReturnType<typeof refreshCandidateProfile>>;

export async function enqueueCandidateProfileRefresh({
  fullRebuild = false,
}: { fullRebuild?: boolean } = {}): Promise<void> {
  // 体验模式不刷画像：会把示例库里的十几场面试全部重评一遍，
  // 烧的是访客自己的 Key；体验版交卷看到报告即闭环。
  if (isTrialMode()) return;
  await markCandidateProfileDirty({ fullRebuild, debounceMs: 0 });
  scheduleCandidateProfileRefresh();
}

export function scheduleCandidateProfileRefresh(): void {
  if (isTrialMode()) return;
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
