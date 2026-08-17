"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input, Textarea } from "@/components/ui/form-controls";

import type { InterviewDraftHeader } from "@/lib/interviews/draft";
import {
  MAX_INTERVIEW_AUDIO_BYTES,
  MAX_INTERVIEW_DOCUMENT_BYTES,
  type InterviewQuestionCategory,
  type InterviewQuestionInput,
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
      setMessage("请先选择文件或粘贴面试文本。");
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
          ? "录音文件不能超过 25MB，请先压缩或截取需要的片段。"
          : "文本文件不能超过 10MB。",
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
          throw new Error(result.error ?? "生成面试草稿失败。");
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
          throw new Error("录音转写失败。");
        }
        setText(transcribed.transcript);
        setArtifactId(transcribed.artifactId);
        setSourceType(transcribed.sourceType ?? "real_audio");
        setSpeakers(transcribed.speakers ?? []);
        setHasVoiceMetrics(Boolean(transcribed.capabilities?.hasVoiceMetrics));
        setMessage("录音已转写，正在识别面试问题…");
        structureArtifactId = transcribed.artifactId;
      }

      const formData = new FormData();
      if (structureArtifactId) {
        formData.set("artifactId", structureArtifactId);
        formData.set("action", "structure");
      } else if (file) formData.set("file", file);
      else formData.set("text", text);

      const result = await postDraft(formData);
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
        `已识别出 ${result.questions.length} 个问题，请确认内容后保存。` +
          (skipped > 0
            ? `另有 ${skipped} 个问题无法在原文中定位，未填入，可手动补充。`
            : ""),
      );
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "生成面试草稿失败。");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="p-3">
      {/* 说话人和材料类型都由服务端从转写结果推断，这里只回传导入产物 ID。 */}
      <input name="importArtifactId" type="hidden" value={artifactId} />
      <div>
        <h3 className="text-sm font-medium text-zinc-900">从文件或文本导入面试内容</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          支持 MP3、WAV、M4A、WebM、TXT、MD、DOCX 和 PDF。识别结果只填入表单，不会自动保存。
        </p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FieldLabel>
          录音或文本文件
          <Input
            accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.txt,.md,.docx,.pdf"
            className="h-auto py-1.5"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setArtifactId("");
              setSpeakers([]);
              setHasVoiceMetrics(false);
            }}
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

      {artifactId && sourceType === "real_audio" ? (
        hasVoiceMetrics ? (
          <p className="mt-3 text-xs text-zinc-600">
            已识别为真实录音
            {speakers.length > 1 ? ` · ${speakers.length} 位说话人，已自动定位你的发言` : ""}
            ，将生成口语流畅度结论。
          </p>
        ) : (
          <Alert className="mt-3" tone="info">
            这段录音无法可靠区分出你的发言（缺少说话人或时间戳信息），将只按文本分析，不生成口语流畅度结论。
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
            ? "识别中..."
            : isAudioMode && !artifactId
              ? "转写并识别"
              : isAudioMode
                ? "重新识别问题"
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
