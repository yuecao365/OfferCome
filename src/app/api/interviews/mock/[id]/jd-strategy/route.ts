import { scheduleMockInterviewGeneration } from "@/lib/mock-interviews/generation-background";
import {
  applyJobDescriptionStrategy,
  type JobDescriptionStrategy,
} from "@/lib/mock-interviews/service";

const STRATEGIES = ["supplement", "enrich", "proceed"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { strategy?: unknown; additionalText?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "请求内容格式不正确。" }, { status: 400 });
  }
  if (!STRATEGIES.includes(body.strategy as JobDescriptionStrategy)) {
    return Response.json({ error: "请选择有效的处理方式。" }, { status: 400 });
  }
  const claimed = await applyJobDescriptionStrategy({
    sessionId: id,
    strategy: body.strategy as JobDescriptionStrategy,
    additionalText:
      typeof body.additionalText === "string" ? body.additionalText : undefined,
  });
  if (!claimed) {
    return Response.json(
      { error: "岗位描述状态已变化，请刷新页面。" },
      { status: 409 },
    );
  }
  scheduleMockInterviewGeneration(id);
  return Response.json({ status: "generating" });
}
