import { submitMockInterviewAnswer } from "@/lib/mock-interviews/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      questionId?: unknown;
      answer?: unknown;
      skip?: unknown;
    };
    const skip = body.skip === true;
    if (
      typeof body.questionId !== "string" ||
      (!skip && typeof body.answer !== "string")
    ) {
      return Response.json({ error: "回答参数无效。" }, { status: 400 });
    }
    const session = await submitMockInterviewAnswer({
      sessionId: id,
      questionId: body.questionId,
      answer: typeof body.answer === "string" ? body.answer : undefined,
      skip,
    });
    return Response.json({
      status: session.status,
      currentQuestionIndex: session.currentQuestionIndex,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "提交回答失败。" },
      { status: 400 },
    );
  }
}
