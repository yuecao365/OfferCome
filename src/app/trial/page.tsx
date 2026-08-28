import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { TrialSetup } from "@/components/trial/trial-setup";
import { isTrialMode } from "@/lib/runtime-mode";
import { TRIAL_PRESET_JOBS } from "@/lib/trial/preset-jobs";

export const metadata = {
  title: "体验 AI 模拟面试 | OfferLai",
};

export default async function TrialPage() {
  await connection();
  if (!isTrialMode()) notFound();

  return (
    <AppShell active="interviews" subActive="interviews-mock">
      <PageHeader
        description="三步开始一场 3 题速览版模拟面试：连接你自己的模型服务、提供简历内容、选择目标岗位。数据只保存在本次会话，约 2 小时后自动清除。"
        eyebrow="在线体验"
        title="体验 AI 模拟面试"
      />
      <TrialSetup presetJobs={TRIAL_PRESET_JOBS} />
    </AppShell>
  );
}
