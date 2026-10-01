"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Textarea } from "@/components/ui/form-controls";
import { useMessages } from "@/lib/i18n/client";
import { defineMessages } from "@/lib/i18n/locale";

import type { InterviewDraftHeader } from "@/lib/interviews/draft";
import {
  MAX_INTERVIEW_AUDIO_BYTES,
  MAX_INTERVIEW_DOCUMENT_BYTES,
  type InterviewQuestionCategory,
  type InterviewQuestionInput,
} from "@/lib/interviews/types";
import { FileInput } from "@/components/ui/file-input";

const messages = defineMessages({
  "zh-CN": {
    missingInput: "请先选择文件或粘贴面试文本。",
    audioTooLarge: "录音文件不能超过 25MB，请先压缩或截取需要的片段。",
    documentTooLarge: "文本文件不能超过 10MB。",
    draftFailed: "生成面试草稿失败。",
    transcribeFailed: "录音转写失败。",
    transcribed: "录音已转写，正在识别面试问题…",
    recognized: (n: number) => `已识别出 ${n} 个问题，请确认内容后保存。`,
    unmatched: (n: number) => `另有 ${n} 个问题无法在原文中定位，未填入，可手动补充。`,
    title: "从文件或文本导入面试内容",
    hint: "支持 MP3、WAV、M4A、WebM、TXT、MD、DOCX 和 PDF。识别结果只填入表单，不会自动保存。",
    fileLabel: "录音或文本文件",
    textLabel: "或粘贴面试文本",
    textPlaceholder: "例如：面试官：请介绍一下你的项目？\n我：我主要负责……",
    transcriptPreview: "转写稿预览",
    transcriptionMissing: "录音导入需先在设置页配置语音转写；文本和文档导入仍可使用。",
    realAudio: "已识别为真实录音",
    speakers: (n: number) => ` · ${n} 位说话人，已自动定位你的发言`,
    fluencySuffix: "，将生成口语流畅度结论。",
    noSpeakerSplit: "这段录音无法可靠区分出你的发言（缺少说话人或时间戳信息），将只按文本分析，不生成口语流畅度结论。",
    pending: "识别中...",
    transcribeAndRecognize: "转写并识别",
    recognizeAgain: "重新识别问题",
    generate: "生成表单草稿",
    audioNotKept: "录音只用于本次识别，不会保存音频文件。",
  },
  en: {
    missingInput: "Choose a file or paste the interview text first.",
    audioTooLarge: "Audio files must be 25 MB or smaller. Compress it or trim to the part you need.",
    documentTooLarge: "Text files must be 10 MB or smaller.",
    draftFailed: "Couldn't generate the interview draft.",
    transcribeFailed: "Couldn't transcribe the recording.",
    transcribed: "Recording transcribed. Finding interview questions…",
    recognized: (n: number) => `Found ${n} question${n === 1 ? "" : "s"}. Review them before saving. `,
    unmatched: (n: number) => `${n} more couldn't be located in the source and were left out — add them by hand if needed.`,
    title: "Import interview content from a file or text",
    hint: "Supports MP3, WAV, M4A, WebM, TXT, MD, DOCX and PDF. Results only fill the form — nothing is saved automatically.",
    fileLabel: "Audio or text file",
    textLabel: "Or paste the interview text",
    textPlaceholder: "e.g. Interviewer: Tell me about your project?\nMe: I was mainly responsible for…",
    transcriptPreview: "Transcript preview",
    transcriptionMissing: "To import recordings, set up speech transcription in Settings first. Text and document import still work.",
    realAudio: "Recognized as a real recording",
    speakers: (n: number) => ` · ${n} speakers, your turns located automatically`,
    fluencySuffix: "; a spoken-fluency assessment will be generated.",
    noSpeakerSplit: "Your turns can't be reliably separated in this recording (no speaker or timestamp info), so it will be analyzed as text only, without a spoken-fluency assessment.",
    pending: "Recognizing...",
    transcribeAndRecognize: "Transcribe and recognize",
    recognizeAgain: "Recognize questions again",
    generate: "Generate form draft",
    audioNotKept: "The recording is only used for this recognition; the audio file isn't saved.",
  },
});

type DraftQuestionResponse = {
  question: string;
  answer: string;
  category: InterviewQuestionCategory;
  relatedItemId: string | null;
  confidence: number;
};

type DraftResponse = {
  questions?: DraftQuestionResponse[];
  header?: InterviewDraftHeader;
  unmatchedQuestionCount?: number;
  source?: "audio" | "document" | "pasted";
  transcript?: string;
  artifactId?: string;
  sourceType?: "real_audio" | "real_transcript" | "real_summary";
  speakers?: string[];
  segments?: Array<{
    text: string;
    start: number | null;
    end: number | null;
    speaker: string | null;
  }>;
  capabilities?: {
    hasTimestamps: boolean;
    hasSpeakers: boolean;
    hasVoiceMetrics: boolean;
  };
  error?: string;
};

type InterviewDraftImporterProps = {
  onDraft: (
    questions: InterviewQuestionInput[],
    header: InterviewDraftHeader | null,
  ) => void;
  transcriptionConfigured: boolean;
};

const AUDIO_FILE_PATTERN = /\.(?:mp3|wav|m4a|webm|ogg)$/i;

function isAudioFile(file: File | null): boolean {
  return Boolean(
    file && (file.type.startsWith("audio/") || AUDIO_FILE_PATTERN.test(file.name)),
  );
}

export function InterviewDraftImporter({
  onDraft,
  transcriptionConfigured,
}: InterviewDraftImporterProps) {
  const t = useMessages(messages);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [artifactId, setArtifactId] = useState("");
  const [sourceType, setSourceType] = useState<
    "real_audio" | "real_transcript" | "real_summary"
  >("real_summary");
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [hasVoiceMetrics, setHasVoiceMetrics] = useState(false);
  // 录音先转写再识别，中间留一步让用户核对转写稿；文本材料一步到位。
  const isAudioMode = isAudioFile(file) || (Boolean(artifactId) && sourceType === "real_audio");

  const runImportStep = async () => {
    const shouldTranscribe = isAudioFile(file) && !artifactId;
    if (!shouldTranscribe && !artifactId && !file && !text.trim()) {
      setIsError(true);
      setMessage(t.missingInput);
      return;
    }
    // 超限的文件在浏览器端就拦下，省掉一次注定失败的长时间上传。
    const sizeLimit = isAudioFile(file)
      ? MAX_INTERVIEW_AUDIO_BYTES
      : MAX_INTERVIEW_DOCUMENT_BYTES;
    if (file && file.size > sizeLimit) {
      setIsError(true);
      setMessage(
        isAudioFile(file)
          ? t.audioTooLarge
          : t.documentTooLarge,
      );
      return;
    }

    setPending(true);
    setMessage("");
    setIsError(false);

    try {
      const postDraft = async (body: FormData): Promise<DraftResponse> => {
        const response = await fetch("/api/interviews/draft", {
          method: "POST",
          body,
        });
        const result = (await response.json()) as DraftResponse;
        if (!response.ok) {
          throw new Error(result.error ?? t.draftFailed);
        }
        return result;
      };

      // 录音先转写。转写成功后不再停下等用户，直接继续识别问题；
      // 转写稿仍会展示，识别失败时停留在已转写状态，可单独重试识别。
      let structureArtifactId = artifactId;
      if (shouldTranscribe && file) {
        const transcribeData = new FormData();
        transcribeData.set("file", file);
        transcribeData.set("action", "transcribe");
        const transcribed = await postDraft(transcribeData);
        if (!transcribed.artifactId || !transcribed.transcript) {
          throw new Error(t.transcribeFailed);
        }
        setText(transcribed.transcript);
        setArtifactId(transcribed.artifactId);
        setSourceType(transcribed.sourceType ?? "real_audio");
        setSpeakers(transcribed.speakers ?? []);
        setHasVoiceMetrics(Boolean(transcribed.capabilities?.hasVoiceMetrics));
        setMessage(t.transcribed);
        structureArtifactId = transcribed.artifactId;
      }

      const formData = new FormData();
      if (structureArtifactId) {
        formData.set("artifactId", structureArtifactId);
        formData.set("action", "structure");
      } else if (file) formData.set("file", file);
      else formData.set("text", text);

      const result = await postDraft(formData);
      if (!result.questions) throw new Error(t.draftFailed);

      onDraft(
        result.questions.map((question, index) => ({
          question: question.question,
          answer: question.answer,
          category: question.category,
          resumeProjectId:
            question.category === "resume_project"
              ? question.relatedItemId
              : null,
          sortOrder: index,
          confidence: question.confidence,
        })),
        result.header ?? null,
      );
      setText(result.transcript ?? text);
      setArtifactId(result.artifactId ?? "");
      setSourceType(result.sourceType ?? "real_summary");
      setSpeakers(result.speakers ?? []);
      setHasVoiceMetrics(Boolean(result.capabilities?.hasVoiceMetrics));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      const skipped = result.unmatchedQuestionCount ?? 0;
      setMessage(
        t.recognized(result.questions.length) + (skipped > 0 ? t.unmatched(skipped) : ""),
      );
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : t.draftFailed);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-3">
      {/* 说话人和材料类型都由服务端从转写结果推断，这里只回传导入产物 ID。 */}
      <input name="importArtifactId" type="hidden" value={artifactId} />
      <div>
        <h3 className="text-sm font-medium text-zinc-900">{t.title}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          {t.hint}
        </p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FieldLabel>
          {t.fileLabel}
          <FileInput
            accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.txt,.md,.docx,.pdf"
            className="py-1.5"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setArtifactId("");
              setSpeakers([]);
              setHasVoiceMetrics(false);
            }}
            ref={fileInputRef}
          />
        </FieldLabel>
        <FieldLabel>
          {t.textLabel}
          <Textarea
            className="min-h-24"
            onChange={(event) => setText(event.target.value)}
            placeholder={t.textPlaceholder}
            value={text}
          />
        </FieldLabel>
      </div>
      {isAudioMode && artifactId ? (
        <div className="mt-3 rounded border border-zinc-200 bg-white p-3">
          <p className="text-sm font-medium text-zinc-800">{t.transcriptPreview}</p>
          <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">
            {text}
          </div>
        </div>
      ) : null}
      {!transcriptionConfigured ? (
        <Alert className="mt-2" tone="info">{t.transcriptionMissing}</Alert>
      ) : null}

      {artifactId && sourceType === "real_audio" ? (
        hasVoiceMetrics ? (
          <p className="mt-3 text-xs text-zinc-600">
            {t.realAudio}
            {speakers.length > 1 ? t.speakers(speakers.length) : ""}
            {t.fluencySuffix}
          </p>
        ) : (
          <Alert className="mt-3" tone="info">
            {t.noSpeakerSplit}
          </Alert>
        )
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          disabled={pending}
          onClick={runImportStep}
          type="button"
          variant="outline"
        >
          {pending
            ? t.pending
            : isAudioMode && !artifactId
              ? t.transcribeAndRecognize
              : isAudioMode
                ? t.recognizeAgain
                : t.generate}
        </Button>
        {message ? (
          <p
            aria-live="polite"
            className={isError ? "text-sm text-red-700" : "text-sm text-zinc-700"}
          >
            {message}
          </p>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {t.audioNotKept}
      </p>
    </Card>
  );
}
