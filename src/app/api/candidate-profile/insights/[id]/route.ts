import { updateCandidateInsight } from "@/lib/candidate-profile/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      return Response.json({ error: "未知的画像操作。" }, { status: 400 });
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
      { error: error instanceof Error ? error.message : "更新画像洞察失败。" },
      { status: 400 },
    );
  }
}
