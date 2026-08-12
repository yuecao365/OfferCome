import { scheduleMockInterviewGeneration } from "@/lib/mock-interviews/generation-background";
import { claimMockInterviewGenerationRetry } from "@/lib/mock-interviews/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const claimed = await claimMockInterviewGenerationRetry(id);
  if (!claimed) {
    return Response.json(
      { error: "生成状态已变化，请刷新页面。" },
      { status: 409 },
    );
  }
  scheduleMockInterviewGeneration(id);
  return Response.json({ status: "generating" });
}
