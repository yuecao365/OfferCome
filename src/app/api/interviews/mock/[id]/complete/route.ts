import { completeMockInterview } from "@/lib/mock-interviews/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return Response.json({ report: await completeMockInterview(id) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "生成面试报告失败。" },
      { status: 400 },
    );
  }
}
