import { AppChrome } from "@/components/app-chrome";
import type { AppSection, InterviewSection } from "@/components/app-shell-types";
import { ProfileRefreshScheduler } from "@/components/candidate-profile/profile-refresh-scheduler";
import { TrialProfileRefreshScheduler } from "@/components/trial/trial-profile-refresh-scheduler";
import { isTrialMode } from "@/lib/runtime-mode";

type AppShellProps = {
  active: AppSection;
  subActive?: InterviewSection;
  immersive?: boolean;
  children: React.ReactNode;
};

export function AppShell({ active, subActive, immersive = false, children }: AppShellProps) {
  const trial = isTrialMode();

  return (
    <>
      {trial ? null : <ProfileRefreshScheduler />}
      {trial ? <TrialProfileRefreshScheduler /> : null}
      <AppChrome
        active={active}
        homeHref={trial ? "/homepage" : "/"}
        immersive={immersive}
        subActive={subActive}
      >
        {children}
      </AppChrome>
    </>
  );
}
