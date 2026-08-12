import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await prisma.mockInterviewSession.findUnique({
    where: { id },
    select: {
      status: true,
      generationPhase: true,
      generationErrorCode: true,
      generationError: true,
    },
  });
  if (!session) {
    return Response.json({ error: "模拟面试不存在。" }, { status: 404 });
  }

  return Response.json({
    status: session.status,
    generationPhase: session.generationPhase,
    errorCode: session.generationErrorCode,
    error: session.generationError,
  });
}
