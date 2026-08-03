import { scheduleCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { refreshCandidateProfile } from "@/lib/candidate-profile/service";
import { getProfileRefreshStatus } from "@/lib/candidate-profile/state";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { force?: unknown };
    const result = await refreshCandidateProfile({ force: body.force === true });
    if (result.status === "processing") scheduleCandidateProfileRefresh();
    return Response.json({ result, profile: await getProfileRefreshStatus() });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "刷新面试能力画像失败。",
        profile: await getProfileRefreshStatus(),
      },
      { status: 400 },
    );
  }
}
