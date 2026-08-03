import { enqueueCandidateProfileRefresh } from "@/lib/candidate-profile/background";
import { mergeRoleContexts } from "@/lib/candidate-profile/service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sourceKey?: unknown; targetKey?: unknown };
    if (typeof body.sourceKey !== "string" || typeof body.targetKey !== "string") {
      return Response.json({ error: "请选择要合并的岗位视角。" }, { status: 400 });
    }
    await mergeRoleContexts({ sourceKey: body.sourceKey, targetKey: body.targetKey });
    await enqueueCandidateProfileRefresh({ fullRebuild: true });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "合并岗位视角失败。" },
      { status: 400 },
    );
  }
}
