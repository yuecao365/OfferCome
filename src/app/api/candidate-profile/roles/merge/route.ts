import { enqueueCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { mergeRoleContexts } from "@/lib/candidate-profile/service";
import { defineMessages } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/server";

const messages = defineMessages({
  "zh-CN": { pickRoles: "请选择要合并的岗位视角。", failed: "合并岗位视角失败。" },
  en: { pickRoles: "Choose the role views to merge.", failed: "Couldn't merge the role views." },
});

export async function POST(request: Request) {
  const t = await getMessages(messages);
  try {
    const body = (await request.json()) as { sourceKey?: unknown; targetKey?: unknown };
    if (typeof body.sourceKey !== "string" || typeof body.targetKey !== "string") {
      return Response.json({ error: t.pickRoles }, { status: 400 });
    }
    await mergeRoleContexts({ sourceKey: body.sourceKey, targetKey: body.targetKey });
    await enqueueCandidateProfileRefresh({ fullRebuild: true });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : t.failed },
      { status: 400 },
    );
  }
}
