import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { TrialWorkspace } from "@/components/trial/trial-workspace";
import { isTrialMode } from "@/lib/runtime-mode";
import { TRIAL_PRESET_JOBS } from "@/lib/trial/preset-jobs";

export const metadata = {
  title: "体验 AI 模拟面试 | OfferLai",
};

export default function TrialPage() {
  if (!isTrialMode()) notFound();

  return (
    <AppShell active="interviews" subActive="interviews-mock">
      <PageHeader
        description="三步开始一场 3 题速览版模拟面试：连接你自己的模型服务、提供简历内容、选择目标岗位。全部数据只保存在当前浏览器标签页。"
        eyebrow="在线体验"
        title="体验 AI 模拟面试"
      />
      <TrialWorkspace presetJobs={TRIAL_PRESET_JOBS} />
    </AppShell>
  );
}
