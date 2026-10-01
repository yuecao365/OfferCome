import path from "node:path";

import { prisma } from "@/lib/db";
import { extractDocumentText } from "@/lib/documents/extract-text";
import {
  looksLikeVerbatimTranscript,
  structureInterviewText,
} from "@/lib/interviews/draft";
import { transcribeOpenAiDiarized } from "@/lib/interviews/openai-diarization";
import { getInterviewDraftProjectOptions } from "@/lib/interviews/queries";
import {
  describeTranscriptionError,
  needsPreemptiveSplit,
  resolveAudioMediaType,
  transcribeAudioArtifact,
} from "@/lib/interviews/transcription";
import {
  MAX_INTERVIEW_AUDIO_BYTES,
  MAX_INTERVIEW_DOCUMENT_BYTES,
} from "@/lib/interviews/types";
import {
  deriveCandidateVoiceMetrics,
  type TranscriptionArtifact,
} from "@/lib/interviews/voice-metrics";
import { defineMessages } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/server";

const MAX_PASTED_TEXT_LENGTH = 100_000;
const DOCUMENT_EXTENSIONS = new Set([".txt", ".md", ".docx", ".pdf"]);

const messages = defineMessages({
  "zh-CN": {
    failed: "生成面试草稿失败。",
    transcriptionService:
      "语音转写服务调用失败，请检查设置页的转写模型、API Key 和网络代理后重试。较长的录音可以先截取需要的片段。",
    audioTooLarge: "录音文件不能超过 25MB。",
    noAudioText: "没有从录音中识别到文本。",
    unsupportedFile: "只支持音频、TXT、MD、DOCX 或 PDF 文件。",
    documentTooLarge: "文本文件不能超过 10MB。",
    noDocumentText: "没有从文件中提取到可识别的文本。",
    missingInput: "请上传录音或文本文件，或者粘贴面试文本。",
    pastedTooLong: "粘贴文本不能超过 10 万字符。",
    unreadableUpload:
      "上传内容无法读取，通常是文件太大被截断。录音请控制在 25MB 以内，文本文件在 10MB 以内。",
    transcriptExpired: "转写稿已过期，请重新转写录音。",
    transcribeAudioOnly: "转写步骤仅支持录音文件。",
  },
  en: {
    failed: "Couldn't generate the interview draft.",
    transcriptionService:
      "The transcription service call failed. Check the transcription model, API key and network proxy in Settings, then try again. For long recordings, trim to the part you need first.",
    audioTooLarge: "Recordings can't exceed 25 MB.",
    noAudioText: "No speech was recognized in the recording.",
    unsupportedFile: "Only audio, TXT, MD, DOCX or PDF files are supported.",
    documentTooLarge: "Text files can't exceed 10 MB.",
    noDocumentText: "No readable text was found in the file.",
    missingInput: "Upload a recording or text file, or paste the interview text.",
    pastedTooLong: "Pasted text can't exceed 100,000 characters.",
    unreadableUpload:
      "The upload couldn't be read, usually because the file was too large and got cut off. Keep recordings under 25 MB and text files under 10 MB.",
    transcriptExpired: "The transcript has expired. Transcribe the recording again.",
    transcribeAudioOnly: "Transcription only works with audio files.",
  },
});

type DraftMessages = (typeof messages)["zh-CN"];

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/**
 * 转写服务返回的错误名（AI_APICallError 之类）对用户没有意义，这里换成
 * 能照着做的提示；自己抛出的错误（已按界面语言）原样透出。
 */
function userFacingMessage(error: unknown, t: DraftMessages): string {
  if (!(error instanceof Error)) return t.failed;
  if (/^AI_|APICallError|Failed after \d+ attempts/i.test(error.message)) {
    return t.transcriptionService;
  }
  return error.message;
}

/** 文本材料的类型由内容结构判定，不再让用户声明。 */
function textSourceType(text: string): "real_transcript" | "real_summary" {
  return looksLikeVerbatimTranscript(text) ? "real_transcript" : "real_summary";
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

async function sourceFromRequest(formData: FormData, t: DraftMessages): Promise<{
  artifact: TranscriptionArtifact;
  source: "audio" | "document" | "pasted";
  sourceType: "real_audio" | "real_transcript" | "real_summary";
}> {
  const pastedText = formData.get("text");
  const file = formData.get("file");

  if (file instanceof File && file.name) {
    const extension = path.extname(file.name).toLowerCase();
    const audioMediaType = resolveAudioMediaType(file.name, file.type);
    if (audioMediaType) {
      if (file.size > MAX_INTERVIEW_AUDIO_BYTES) {
        throw new Error(t.audioTooLarge);
      }
      const input = {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mediaType: audioMediaType,
      };
      // 一律尝试说话人分离：录音里有没有面试官由转写结果判断，不必问用户。
      // 但分离接口只能整段直传，大文件必然被掐流，这种情况直接走切分转写。
      let artifact: TranscriptionArtifact | null = null;
      if (!needsPreemptiveSplit(input)) {
        try {
          artifact = await transcribeOpenAiDiarized(input);
        } catch (error) {
          console.warn(
            "[interviews] diarization unavailable, falling back to text transcription:",
            describeTranscriptionError(error),
          );
        }
      }
      if (!artifact) {
        artifact = await transcribeAudioArtifact(input);
        artifact.capabilities.hasSpeakers = false;
      }
      if (!artifact.text.trim()) throw new Error(t.noAudioText);
      artifact.capabilities.hasVoiceMetrics = Boolean(
        deriveCandidateVoiceMetrics(artifact.segments),
      );
      return { artifact, source: "audio", sourceType: "real_audio" };
    }

    if (!DOCUMENT_EXTENSIONS.has(extension)) {
      throw new Error(t.unsupportedFile);
    }
    if (file.size > MAX_INTERVIEW_DOCUMENT_BYTES) {
      throw new Error(t.documentTooLarge);
    }
    const text = await extractDocumentText({
      bytes: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type,
    });
    if (!text.trim()) throw new Error(t.noDocumentText);
    return {
      artifact: emptyTextArtifact(text),
      source: "document",
      sourceType: textSourceType(text),
    };
  }

  if (typeof pastedText !== "string" || !pastedText.trim()) {
    throw new Error(t.missingInput);
  }
  if (pastedText.length > MAX_PASTED_TEXT_LENGTH) {
    throw new Error(t.pastedTooLong);
  }
  return {
    artifact: emptyTextArtifact(pastedText),
    source: "pasted",
    sourceType: textSourceType(pastedText),
  };
}

export async function POST(request: Request) {
  const t = await getMessages(messages);
  try {
    // 请求体超过 proxy 的缓冲上限时会被截断，formData() 只会抛出难懂的解析错误，
    // 这里换成用户能照做的提示。
    const formData = await request.formData().catch(() => {
      throw new Error(t.unreadableUpload);
    });
    await prisma.interviewImportArtifact.deleteMany({
      where: { expiresAt: { lt: new Date() }, consumedAt: null },
    });
    const action = formData.get("action");
    const artifactId = formData.get("artifactId");
    if (action === "structure" && typeof artifactId === "string" && artifactId) {
      const stored = await prisma.interviewImportArtifact.findFirst({
        where: { id: artifactId, consumedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!stored) throw new Error(t.transcriptExpired);
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

    const { artifact, source, sourceType } = await sourceFromRequest(formData, t);
    // 候选人是哪位说话人由对话结构推断；推断不出就不产出语音指标。
    const voiceMetrics = deriveCandidateVoiceMetrics(artifact.segments);
    const stored = await prisma.interviewImportArtifact.create({
      data: {
        sourceType,
        transcriptText: artifact.text.slice(0, MAX_PASTED_TEXT_LENGTH),
        segmentsJson: JSON.stringify(artifact.segments),
        durationSeconds: artifact.durationSeconds,
        candidateSpeaker: voiceMetrics?.candidateSpeaker ?? null,
        voiceMetricsJson: voiceMetrics ? JSON.stringify(voiceMetrics) : null,
        capabilitiesJson: JSON.stringify(artifact.capabilities),
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });

    if (action === "transcribe") {
      if (source !== "audio") {
        throw new Error(t.transcribeAudioOnly);
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
      unmatchedQuestionCount: draft.unmatchedQuestions.length,
      source,
      sourceType,
      artifactId: stored.id,
      transcript: artifact.text.slice(0, MAX_PASTED_TEXT_LENGTH),
      segments: artifact.segments.slice(0, 300),
      speakers: artifact.speakers,
      capabilities: artifact.capabilities,
    });
  } catch (error) {
    console.warn(
      "[interviews] draft generation failed:",
      describeTranscriptionError(error),
    );
    return errorResponse(userFacingMessage(error, t));
  }
}
