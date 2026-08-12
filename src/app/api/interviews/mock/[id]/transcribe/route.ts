import { prisma } from "@/lib/db";
import {
  resolveAudioMediaType,
  transcribeAudioArtifact,
} from "@/lib/interviews/transcription";
import {
  deriveVoiceMetrics,
  mergeVoiceMetrics,
  voiceMetricsSchema,
} from "@/lib/interviews/voice-metrics";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await prisma.mockInterviewSession.findUnique({
      where: { id },
      select: {
        status: true,
        interviewId: true,
        currentQuestionIndex: true,
      },
    });
    if (!session) {
      return Response.json({ error: "模拟面试不存在。" }, { status: 404 });
    }
    if (session.status !== "in_progress") {
      return Response.json(
        { error: "当前模拟面试不能继续录音作答。" },
        { status: 409 },
      );
    }

    const formData = await request.formData();
    const questionId = formData.get("questionId");
    if (typeof questionId !== "string" || !questionId) {
      return Response.json({ error: "缺少当前面试题目。" }, { status: 400 });
    }
    const question = await prisma.interviewQuestion.findFirst({
      where: { id: questionId, interviewId: session.interviewId },
      select: { id: true, sortOrder: true },
    });
    if (!question) {
      return Response.json({ error: "面试题目不存在。" }, { status: 404 });
    }
    if (question.sortOrder !== session.currentQuestionIndex) {
      return Response.json({ error: "只能转写当前题目的录音。" }, { status: 409 });
    }
    const audio = formData.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return Response.json({ error: "请选择有效的回答录音。" }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json({ error: "单次回答录音不能超过 25MB。" }, { status: 400 });
    }

    const mediaType = resolveAudioMediaType(audio.name, audio.type);
    if (!mediaType) {
      return Response.json({ error: "当前录音格式不受支持。" }, { status: 400 });
    }

    const artifact = await transcribeAudioArtifact({
      bytes: new Uint8Array(await audio.arrayBuffer()),
      mediaType,
    });
    const metrics = deriveVoiceMetrics(artifact.segments, null);
    if (metrics) {
      await prisma.$transaction(async (tx) => {
        const currentSession = await tx.mockInterviewSession.findUnique({
          where: { id },
          select: { status: true, currentQuestionIndex: true },
        });
        if (
          currentSession?.status !== "in_progress" ||
          currentSession.currentQuestionIndex !== question.sortOrder
        ) {
          throw new Error("当前题目已变化，请刷新后重试。");
        }
        const currentQuestion = await tx.interviewQuestion.findUnique({
          where: { id: question.id },
          select: { voiceMetricsJson: true },
        });
        const parsedExisting = currentQuestion?.voiceMetricsJson
          ? voiceMetricsSchema.safeParse(
              JSON.parse(currentQuestion.voiceMetricsJson) as unknown,
            )
          : null;
        const merged = mergeVoiceMetrics(
          parsedExisting?.success ? parsedExisting.data : null,
          metrics,
        );
        await tx.interviewQuestion.update({
          where: { id: question.id },
          data: {
            voiceMetricsJson: merged ? JSON.stringify(merged) : null,
          },
        });
      });
    }
    return Response.json({ transcript: artifact.text });
  } catch (error) {
    console.warn(
      "[mock-interviews] answer transcription failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return Response.json(
      { error: error instanceof Error ? error.message : "回答录音转写失败。" },
      { status: 502 },
    );
  }
}
