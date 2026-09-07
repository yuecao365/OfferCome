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
      contextSnapshotJson: true,
      questionCount: true,
      interview: { select: { jobTitle: true } },
    },
  });
  if (!session) {
    return Response.json({ error: "模拟面试不存在。" }, { status: 404 });
  }
  let snapshot: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(session.contextSnapshotJson) as unknown;
    if (parsed && typeof parsed === "object") snapshot = parsed as Record<string, unknown>;
  } catch {}

  return Response.json({
    status: session.status,
    generationPhase: session.generationPhase,
    errorCode: session.generationErrorCode,
    error: session.generationError,
    questionCount: session.questionCount,
    jobTitle: session.interview.jobTitle,
    errorContext:
      snapshot.generationErrorContext &&
      typeof snapshot.generationErrorContext === "object"
        ? snapshot.generationErrorContext
        : null,
  });
}
