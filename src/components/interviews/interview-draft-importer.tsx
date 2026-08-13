"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input, Select, Textarea } from "@/components/ui/form-controls";

import type {
  InterviewQuestionCategory,
  InterviewQuestionInput,
} from "@/lib/interviews/types";

type DraftQuestionResponse = {
  question: string;
  answer: string;
  category: InterviewQuestionCategory;
  relatedItemId: string | null;
  confidence: number;
};

type DraftResponse = {
  questions?: DraftQuestionResponse[];
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
  onDraft: (questions: InterviewQuestionInput[]) => void;
  transcriptionConfigured: boolean;
};

export function InterviewDraftImporter({
  onDraft,
  transcriptionConfigured,
}: InterviewDraftImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [importMode, setImportMode] = useState<
    "full_recording" | "candidate_recording" | "transcript" | "summary"
  >("summary");
  const [artifactId, setArtifactId] = useState("");
  const [sourceType, setSourceType] = useState<
    "real_audio" | "real_transcript" | "real_summary"
  >("real_summary");
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [segments, setSegments] = useState<NonNullable<DraftResponse["segments"]>>([]);
  const [candidateSpeaker, setCandidateSpeaker] = useState("");
  const [hasVoiceMetrics, setHasVoiceMetrics] = useState(false);
  const isAudioMode =
    importMode === "full_recording" || importMode === "candidate_recording";

  const runImportStep = async () => {
    const shouldTranscribe = isAudioMode && !artifactId;
    if (shouldTranscribe && !file) {
      setIsError(true);
      setMessage("请先选择录音文件。");
      return;
    }
    if (!shouldTranscribe && !artifactId && !file && !text.trim()) {
      setIsError(true);
      setMessage("请先选择文件或粘贴面试文本。");
      return;
    }

    setPending(true);
    setMessage("");
    setIsError(false);

    try {
      const formData = new FormData();
      if (shouldTranscribe && file) {
        formData.set("file", file);
        formData.set("action", "transcribe");
      } else if (isAudioMode && artifactId) {
        formData.set("artifactId", artifactId);
        formData.set("action", "structure");
      } else if (file) formData.set("file", file);
      else formData.set("text", text);
      formData.set("importMode", importMode);

      const response = await fetch("/api/interviews/draft", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as DraftResponse;
      if (!response.ok) {
        throw new Error(result.error ?? "生成面试草稿失败。");
      }

      if (shouldTranscribe) {
        if (!result.artifactId || !result.transcript) {
          throw new Error("录音转写失败。");
        }
        setText(result.transcript);
        setArtifactId(result.artifactId);
        setSourceType(result.sourceType ?? "real_audio");
        setSpeakers(result.speakers ?? []);
        setSegments(result.segments ?? []);
        setCandidateSpeaker("");
        setHasVoiceMetrics(Boolean(result.capabilities?.hasVoiceMetrics));
        setMessage("录音已转写。请检查转写稿和说话人，再识别面试问题。");
        return;
      }
      if (!result.questions) throw new Error("生成面试草稿失败。");

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
      );
      setText(result.transcript ?? text);
      setArtifactId(result.artifactId ?? "");
      setSourceType(result.sourceType ?? "real_summary");
      setSpeakers(result.speakers ?? []);
      setSegments(result.segments ?? []);
      setCandidateSpeaker("");
      setHasVoiceMetrics(Boolean(result.capabilities?.hasVoiceMetrics));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage(`已识别出 ${result.questions.length} 个问题，请确认内容后保存。`);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "生成面试草稿失败。");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-3">
      <input name="importArtifactId" type="hidden" value={artifactId} />
      <input name="candidateSpeaker" type="hidden" value={candidateSpeaker} />
      <input name="sourceType" type="hidden" value={sourceType} />
      <div>
        <h3 className="text-sm font-medium text-zinc-900">从文件或文本导入面试内容</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          支持 MP3、WAV、M4A、WebM、TXT、MD、DOCX 和 PDF。识别结果只填入表单，不会自动保存。
        </p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FieldLabel className="md:col-span-2">
          导入内容类型（保存前确认）
          <Select
            onChange={(event) => {
              const mode = event.target.value as typeof importMode;
              setImportMode(mode);
              setArtifactId("");
              setSpeakers([]);
              setSegments([]);
              setCandidateSpeaker("");
              setSourceType(
                mode === "full_recording" || mode === "candidate_recording"
                  ? "real_audio"
                  : mode === "transcript"
                    ? "real_transcript"
                    : "real_summary",
              );
              setText("");
            }}
            value={importMode}
          >
            <option disabled={!transcriptionConfigured} value="full_recording">完整录音（面试官 + 本人）</option>
            <option disabled={!transcriptionConfigured} value="candidate_recording">仅本人录音</option>
            <option value="transcript">逐字转写文本</option>
            <option value="summary">复盘总结</option>
          </Select>
        </FieldLabel>
        <FieldLabel>
          录音或文本文件
          <Input
            accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.txt,.md,.docx,.pdf"
            className="h-auto py-1.5"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            ref={fileInputRef}
            type="file"
          />
        </FieldLabel>
        <FieldLabel>
          或粘贴面试文本
          <Textarea
            className="min-h-24"
            onChange={(event) => setText(event.target.value)}
            placeholder="例如：面试官：请介绍一下你的项目？\n我：我主要负责……"
            value={text}
          />
        </FieldLabel>
      </div>
      {isAudioMode && artifactId ? (
        <div className="mt-3 rounded border border-zinc-200 bg-white p-3">
          <p className="text-sm font-medium text-zinc-800">转写稿预览</p>
          <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-50 p-3 text-xs leading-5 text-zinc-700">
            {text}
          </div>
        </div>
      ) : null}
      {!transcriptionConfigured ? (
        <Alert className="mt-2" tone="info">录音导入需先在设置页配置语音转写；文本和文档导入仍可使用。</Alert>
      ) : null}

      {speakers.length > 0 ? (
        <div className="mt-3 rounded border border-zinc-200 bg-white p-3">
          <FieldLabel>
            哪位说话人是你？
            <Select
              onChange={(event) => setCandidateSpeaker(event.target.value)}
              required
              value={candidateSpeaker}
            >
              <option value="">请选择</option>
              {speakers.map((speaker) => (
                <option key={speaker} value={speaker}>{speaker}</option>
              ))}
            </Select>
          </FieldLabel>
          <div className="mt-3 max-h-44 space-y-2 overflow-y-auto text-xs text-zinc-700">
            {segments.slice(0, 24).map((segment, index) => (
              <p key={`${segment.speaker}-${segment.start}-${index}`}>
                <strong>{segment.speaker ?? "未知"}</strong>
                {segment.start !== null ? ` ${segment.start.toFixed(1)}s` : ""}：{segment.text}
              </p>
            ))}
          </div>
        </div>
      ) : artifactId && sourceType === "real_audio" && !hasVoiceMetrics ? (
        <Alert className="mt-3" tone="info">
          本次转写服务没有返回可用的说话人或时间戳，将继续按文本分析，不生成口语流畅度结论。
        </Alert>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          disabled={pending || (isAudioMode && Boolean(artifactId) && speakers.length > 0 && !candidateSpeaker)}
          onClick={runImportStep}
          type="button"
          variant="outline"
        >
          {pending
            ? isAudioMode && !artifactId
              ? "转写中..."
              : "识别中..."
            : isAudioMode && !artifactId
              ? "转写录音"
              : isAudioMode
                ? "识别面试问题"
                : "生成表单草稿"}
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
        录音只用于本次识别，不会保存音频文件。
      </p>
    </Card>
  );
}
