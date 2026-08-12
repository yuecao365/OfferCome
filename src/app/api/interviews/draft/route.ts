import path from "node:path";

import { prisma } from "@/lib/db";
import { extractDocumentText } from "@/lib/documents/extract-text";
import { structureInterviewText } from "@/lib/interviews/draft";
import { transcribeOpenAiDiarized } from "@/lib/interviews/openai-diarization";
import { getInterviewDraftProjectOptions } from "@/lib/interviews/queries";
import { resolveAudioMediaType, transcribeAudioArtifact } from "@/lib/interviews/transcription";
import { deriveVoiceMetrics, type TranscriptionArtifact } from "@/lib/interviews/voice-metrics";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_PASTED_TEXT_LENGTH = 100_000;
const DOCUMENT_EXTENSIONS = new Set([".txt", ".md", ".docx", ".pdf"]);

type ImportMode = "full_recording" | "candidate_recording" | "transcript" | "summary";

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function parseImportMode(value: FormDataEntryValue | null): ImportMode {
  return value === "full_recording" ||
    value === "candidate_recording" ||
    value === "transcript" ||
    value === "summary"
    ? value
    : "summary";
}

function emptyTextArtifact(text: string): TranscriptionArtifact {
  return {
    text,
    segments: [],
    durationSeconds: null,
    speakers: [],
    capabilities: { hasTimestamps: false, hasSpeakers: false, hasVoiceMetrics: false },
  };
}

async function sourceFromRequest(formData: FormData): Promise<{
  artifact: TranscriptionArtifact;
  source: "audio" | "document" | "pasted";
  sourceType: "real_audio" | "real_transcript" | "real_summary";
  importMode: ImportMode;
}> {
  const importMode = parseImportMode(formData.get("importMode"));
  const pastedText = formData.get("text");
  const file = formData.get("file");

  if (file instanceof File && file.name) {
    const extension = path.extname(file.name).toLowerCase();
    const audioMediaType = resolveAudioMediaType(file.name, file.type);
    if (audioMediaType) {
      if (importMode !== "full_recording" && importMode !== "candidate_recording") {
        throw new Error("录音导入需要声明是完整访谈录音还是仅本人录音。");
      }
      if (file.size > MAX_AUDIO_BYTES) throw new Error("录音文件不能超过 25MB。");
      const input = {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mediaType: audioMediaType,
      };
      let artifact: TranscriptionArtifact;
      if (importMode === "full_recording") {
        try {
          artifact = await transcribeOpenAiDiarized(input);
        } catch (error) {
          console.warn(
            "[interviews] diarization unavailable, falling back to text transcription:",
            error instanceof Error ? error.message : "unknown error",
          );
          artifact = await transcribeAudioArtifact(input);
          artifact.capabilities.hasSpeakers = false;
          artifact.capabilities.hasVoiceMetrics = false;
        }
      } else {
        artifact = await transcribeAudioArtifact(input);
        const metrics = deriveVoiceMetrics(artifact.segments, null);
        artifact.capabilities.hasVoiceMetrics = Boolean(metrics);
      }
      if (!artifact.text.trim()) throw new Error("没有从录音中识别到文本。");
      return { artifact, source: "audio", sourceType: "real_audio", importMode };
    }

    if (!DOCUMENT_EXTENSIONS.has(extension)) {
      throw new Error("只支持音频、TXT、MD、DOCX 或 PDF 文件。");
    }
    if (file.size > MAX_DOCUMENT_BYTES) throw new Error("文本文件不能超过 10MB。");
    if (importMode !== "transcript" && importMode !== "summary") {
      throw new Error("文本文件需要声明是逐字转写还是复盘总结。");
    }
    const text = await extractDocumentText({
      bytes: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type,
    });
    if (!text.trim()) throw new Error("没有从文件中提取到可识别的文本。");
    return {
      artifact: emptyTextArtifact(text),
      source: "document",
      sourceType: importMode === "transcript" ? "real_transcript" : "real_summary",
      importMode,
    };
  }

  if (typeof pastedText !== "string" || !pastedText.trim()) {
    throw new Error("请上传录音或文本文件，或者粘贴面试文本。");
  }
  if (pastedText.length > MAX_PASTED_TEXT_LENGTH) {
    throw new Error("粘贴文本不能超过 10 万字符。");
  }
  if (importMode !== "transcript" && importMode !== "summary") {
    throw new Error("粘贴文本需要声明是逐字转写还是复盘总结。");
  }
  return {
    artifact: emptyTextArtifact(pastedText),
    source: "pasted",
    sourceType: importMode === "transcript" ? "real_transcript" : "real_summary",
    importMode,
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    await prisma.interviewImportArtifact.deleteMany({
      where: { expiresAt: { lt: new Date() }, consumedAt: null },
    });
    const action = formData.get("action");
    const artifactId = formData.get("artifactId");
    if (action === "structure" && typeof artifactId === "string" && artifactId) {
      const stored = await prisma.interviewImportArtifact.findFirst({
        where: { id: artifactId, consumedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!stored) throw new Error("转写稿已过期，请重新转写录音。");
      const draft = await structureInterviewText(
        stored.transcriptText,
        await getInterviewDraftProjectOptions(),
      );
      const capabilities = JSON.parse(stored.capabilitiesJson) as unknown;
      return Response.json({
        ...draft,
        source: "audio",
        sourceType: stored.sourceType,
        artifactId: stored.id,
        transcript: stored.transcriptText,
        segments: JSON.parse(stored.segmentsJson) as unknown,
        speakers: [],
        capabilities,
      });
    }

    const { artifact, source, sourceType, importMode } =
      await sourceFromRequest(formData);
    const immediateMetrics =
      importMode === "candidate_recording"
        ? deriveVoiceMetrics(artifact.segments, null)
        : null;
    const stored = await prisma.interviewImportArtifact.create({
      data: {
        sourceType,
        transcriptText: artifact.text.slice(0, MAX_PASTED_TEXT_LENGTH),
        segmentsJson: JSON.stringify(artifact.segments),
        durationSeconds: artifact.durationSeconds,
        candidateSpeaker: importMode === "candidate_recording" ? null : undefined,
        voiceMetricsJson: immediateMetrics ? JSON.stringify(immediateMetrics) : null,
        capabilitiesJson: JSON.stringify(artifact.capabilities),
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });

    if (action === "transcribe") {
      if (source !== "audio") {
        throw new Error("转写步骤仅支持录音文件。");
      }
      return Response.json({
        artifactId: stored.id,
        transcript: artifact.text.slice(0, MAX_PASTED_TEXT_LENGTH),
        speakers: artifact.speakers,
        segments: artifact.segments.slice(0, 300),
        capabilities: artifact.capabilities,
        sourceType,
      });
    }

    const draft = await structureInterviewText(
      artifact.text,
      await getInterviewDraftProjectOptions(),
    );

    return Response.json({
      ...draft,
      source,
      sourceType,
      importMode,
      artifactId: stored.id,
      transcript: artifact.text.slice(0, MAX_PASTED_TEXT_LENGTH),
      segments: artifact.segments.slice(0, 300),
      speakers: artifact.speakers,
      capabilities: artifact.capabilities,
    });
  } catch (error) {
    console.warn(
      "[interviews] draft generation failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return errorResponse(error instanceof Error ? error.message : "生成面试草稿失败。");
  }
}
