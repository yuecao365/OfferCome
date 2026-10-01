import { prisma } from "@/lib/db";
import { resolveAudioMediaType, transcribeAudioArtifact } from "@/lib/interviews/transcription";
import { deriveVoiceMetrics } from "@/lib/interviews/voice-metrics";
import { defineMessages } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/server";

/**
 * 语音模式的候选人回答：收一段录音，转写成文字并推导语音指标；不落库——
 * 文字随候选人那条消息交给 /turn（voiceMetricsJson 存进消息的 metricsJson.voice，画像的口语流畅维度从那里推导）。
 */

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const messages = defineMessages({
  "zh-CN": {
    notFound: "模拟面试不存在。",
    notInProgress: "当前模拟面试不能继续录音作答。",
    noAudio: "请选择有效的回答录音。",
    tooLarge: "单次回答录音不能超过 25MB。",
    unsupported: "当前录音格式不受支持。",
    failed: "回答录音转写失败。",
  },
  en: {
    notFound: "Mock interview not found.",
    notInProgress: "This mock interview no longer accepts recorded answers.",
    noAudio: "Choose a valid answer recording.",
    tooLarge: "Each answer recording can't exceed 25 MB.",
    unsupported: "This recording format isn't supported.",
    failed: "Couldn't transcribe the answer recording.",
  },
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getMessages(messages);
  try {
    const { id } = await params;
    const session = await prisma.mockInterviewSession.findUnique({ where: { id }, select: { status: true } });
    if (!session) return Response.json({ error: t.notFound }, { status: 404 });
    if (session.status !== "in_progress") return Response.json({ error: t.notInProgress }, { status: 409 });

    const formData = await request.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File) || audio.size === 0) return Response.json({ error: t.noAudio }, { status: 400 });
    if (audio.size > MAX_AUDIO_BYTES) return Response.json({ error: t.tooLarge }, { status: 400 });
    const mediaType = resolveAudioMediaType(audio.name, audio.type);
    if (!mediaType) return Response.json({ error: t.unsupported }, { status: 400 });

    const artifact = await transcribeAudioArtifact({ bytes: new Uint8Array(await audio.arrayBuffer()), mediaType });
    const metrics = deriveVoiceMetrics(artifact.segments, null);
    return Response.json({ transcript: artifact.text, voiceMetricsJson: metrics ? JSON.stringify(metrics) : null });
  } catch (error) {
    console.warn("[mock-interviews] answer transcription failed:", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: error instanceof Error ? error.message : t.failed }, { status: 502 });
  }
}
