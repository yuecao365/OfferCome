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
            体验模式：投递、面试记录、复盘都可以随意增删改，数据只属于你本次会话，约 2
            小时后自动清除。想跑一场真实的 AI 模拟面试（需要你自己的模型 API Key），
            <a className="font-semibold underline underline-offset-2" href="/trial">
              从这里开始
            </a>
            。Boss 同步与语音作答仅在本地版开放。
          </div>
        ) : null}
        {children}
      </AppChrome>
    </>
  );
}
