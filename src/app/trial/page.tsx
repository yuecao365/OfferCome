import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { TrialOnboarding } from "@/components/trial/trial-onboarding";
import { isTrialMode } from "@/lib/runtime-mode";

export const metadata = {
  title: "体验准备 | OfferLai",
};

export default function TrialPage() {
  if (!isTrialMode()) notFound();

  return (
    <AppShell active="interviews" subActive="interviews-mock">
      <PageHeader
        description="两步完成准备：连接你自己的模型服务、提供简历内容。之后即可在真实工作台中体验 AI 模拟面试、投递管理与面试复盘。"
        eyebrow="在线体验"
        title="体验准备"
      />
      <TrialOnboarding />
    </AppShell>
  );
}
