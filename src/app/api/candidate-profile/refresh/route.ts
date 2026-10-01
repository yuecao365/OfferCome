import { scheduleCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { refreshCandidateProfile } from "@/lib/candidate-profile/service";
import { getProfileRefreshStatus } from "@/lib/candidate-profile/state";
import { contentLanguageOf, defineMessages } from "@/lib/i18n/locale";
import { getLocale, getMessages } from "@/lib/i18n/server";

const messages = defineMessages({
  "zh-CN": { failed: "刷新面试能力画像失败。" },
  en: { failed: "Couldn't refresh your interview profile." },
});

export async function POST(request: Request) {
  const t = await getMessages(messages);
  const language = contentLanguageOf(await getLocale());
  try {
    const body = (await request.json().catch(() => ({}))) as { force?: unknown };
    const result = await refreshCandidateProfile({ force: body.force === true, language });
    if (result.status === "processing") scheduleCandidateProfileRefresh(language);
    return Response.json({ result, profile: await getProfileRefreshStatus() });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : t.failed,
        profile: await getProfileRefreshStatus(),
      },
      { status: 400 },
    );
  }
}
