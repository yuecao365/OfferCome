import { submitMockInterviewAnswer } from "@/lib/mock-interviews/service";
import { prisma } from "@/lib/db";

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
    const nextQuestion = await prisma.interviewQuestion.findFirst({
      where: {
        interviewId: session.interviewId,
        sortOrder: session.currentQuestionIndex,
      },
      select: {
        id: true,
        question: true,
        category: true,
        sortOrder: true,
        parentQuestionId: true,
      },
    });
    return Response.json({
      status: session.status,
      currentQuestionIndex: session.currentQuestionIndex,
      questionCount: session.questionCount,
      nextQuestion: nextQuestion
        ? { ...nextQuestion, isFollowUp: Boolean(nextQuestion.parentQuestionId) }
        : null,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "提交回答失败。" },
      { status: 400 },
    );
  }
}
