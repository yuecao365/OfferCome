import { AppChrome } from "@/components/app-chrome";
import type { AppSection, InterviewSection } from "@/components/app-shell-types";
import { ProfileRefreshScheduler } from "@/components/candidate-profile/profile-refresh-scheduler";
import { isDemoMode, isTrialMode } from "@/lib/runtime-mode";

type AppShellProps = {
  active: AppSection;
  subActive?: InterviewSection;
  immersive?: boolean;
  children: React.ReactNode;
};

export function AppShell({ active, subActive, immersive = false, children }: AppShellProps) {
  const demo = isDemoMode();
  const trial = isTrialMode();

  return (
    <>
      {!demo && !trial ? <ProfileRefreshScheduler /> : null}
      <AppChrome
        active={active}
        homeHref={demo ? "/homepage" : "/"}
        immersive={immersive}
        subActive={subActive}
      >
        {demo ? (
          <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-strong">
            在线体验使用虚构数据，所有新增、编辑、上传和同步操作均不会执行或保存。
          </div>
        ) : null}
        {trial ? (
          <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-strong">
            在线体验：以下页面展示的是示例数据，用于了解产品结构。想真的跑一场 AI
            模拟面试（用你自己的模型 API Key，数据只存在当前浏览器），
            <a className="font-semibold underline underline-offset-2" href="/trial">
              从这里开始
            </a>
            。完整功能请使用本地版。
          </div>
        ) : null}
        {children}
      </AppChrome>
    </>
  );
}
