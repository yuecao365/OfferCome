import { scheduleMockInterviewGeneration } from "@/lib/mock-interviews/generation-background";
import { claimMockInterviewGenerationRetry } from "@/lib/mock-interviews/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let strategy: "enrich" | undefined;
  try {
    const text = await request.text();
    if (text) {
      const body = JSON.parse(text) as { strategy?: unknown };
      if (body.strategy !== undefined && body.strategy !== "enrich") {
        return Response.json({ error: "重试方式不正确。" }, { status: 400 });
      }
      strategy = body.strategy;
    }
  } catch {
    return Response.json({ error: "请求内容格式不正确。" }, { status: 400 });
  }
  const claimed = await claimMockInterviewGenerationRetry(id, strategy);
  if (!claimed) {
    return Response.json(
      { error: "生成状态已变化，请刷新页面。" },
      { status: 409 },
    );
  }
  scheduleMockInterviewGeneration(id);
  return Response.json({ status: "generating" });
}
