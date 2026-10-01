import { updateCandidateInsight } from "@/lib/candidate-profile/service";
import { defineMessages } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/server";

const messages = defineMessages({
  "zh-CN": { unknownAction: "未知的画像操作。", failed: "更新画像洞察失败。" },
  en: { unknownAction: "Unknown profile action.", failed: "Couldn't update the profile insight." },
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getMessages(messages);
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      action?: unknown;
      title?: unknown;
      statement?: unknown;
    };
    if (
      body.action !== "confirm" &&
      body.action !== "edit" &&
      body.action !== "hide" &&
      body.action !== "restore"
    ) {
      return Response.json({ error: t.unknownAction }, { status: 400 });
    }
    const insight = await updateCandidateInsight({
      id,
      action: body.action,
      title: typeof body.title === "string" ? body.title : undefined,
      statement: typeof body.statement === "string" ? body.statement : undefined,
    });
    return Response.json({ insight });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : t.failed },
      { status: 400 },
    );
  }
}
