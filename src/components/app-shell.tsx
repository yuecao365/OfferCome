import { AppChrome } from "@/components/app-chrome";
import type { AppSection, InterviewSection } from "@/components/app-shell-types";
import { ProfileRefreshScheduler } from "@/components/candidate-profile/profile-refresh-scheduler";

type AppShellProps = {
  active: AppSection;
  subActive?: InterviewSection;
  immersive?: boolean;
  children: React.ReactNode;
};

export function AppShell({ active, subActive, immersive = false, children }: AppShellProps) {
  return (
    <>
      <ProfileRefreshScheduler />
      <AppChrome active={active} immersive={immersive} subActive={subActive}>
        {children}
      </AppChrome>
    </>
  );
}
