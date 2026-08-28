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
            体验模式：示例数据加上你本次会话的内容，约 2 小时后自动清除。想真的跑一场
            AI 模拟面试，
            <a className="font-semibold underline underline-offset-2" href="/trial">
              从这里开始
            </a>
            ；其余功能在本地版中开放。
          </div>
        ) : null}
        {children}
      </AppChrome>
    </>
  );
}
