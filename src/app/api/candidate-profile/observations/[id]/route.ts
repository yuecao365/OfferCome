import { enqueueCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { correctAbilityObservation } from "@/lib/candidate-profile/service";
import { defineMessages } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/server";

const messages = defineMessages({
  "zh-CN": { unknownAction: "未知的证据纠正操作。", failed: "纠正能力证据失败。" },
  en: { unknownAction: "Unknown evidence correction.", failed: "Couldn't correct the evidence." },
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getMessages(messages);
  try {
    const { id } = await params;
    const body = (await request.json()) as { action?: unknown; dimension?: unknown };
    if (
      body.action !== "exclude" &&
      body.action !== "restore" &&
      body.action !== "reassign_dimension"
    ) {
      return Response.json({ error: t.unknownAction }, { status: 400 });
    }
    await correctAbilityObservation({
      id,
      action: body.action,
      dimension: typeof body.dimension === "string" ? body.dimension : undefined,
    });
    await enqueueCandidateProfileRefresh({ fullRebuild: true });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : t.failed },
      { status: 400 },
    );
  }
}
