import { prisma } from "@/lib/db";
import {
  resolveAudioMediaType,
  transcribeAudio,
} from "@/lib/interviews/transcription";

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
      select: { status: true },
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

    const transcript = await transcribeAudio({
      bytes: new Uint8Array(await audio.arrayBuffer()),
      mediaType,
    });
    return Response.json({ transcript });
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
